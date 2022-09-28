//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import {
  Brackets,
  Connection,
  ConnectionOptions,
  createConnection,
  DeepPartial,
  FindConditions,
  FindManyOptions,
  In,
  Not,
  QueryRunner,
  Repository,
  SelectQueryBuilder
} from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import _ from 'lodash';
import { RelationType } from 'typeorm/metadata/types/RelationTypes';
import { SelectionNode } from 'graphql';

import { BlockProgressInterface, ContractInterface, EventInterface, SyncStatusInterface } from './types';
import { MAX_REORG_DEPTH, UNKNOWN_EVENT_NAME } from './constants';
import { blockProgressCount, eventCount } from './metrics';

const OPERATOR_MAP = {
  equals: '=',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
  in: 'IN',
  contains: 'LIKE',
  starts: 'LIKE',
  ends: 'LIKE'
};

const INSERT_EVENTS_BATCH = 100;
export const DEFAULT_LIMIT = 100;

export interface BlockHeight {
  number?: number;
  hash?: string;
}

export enum OrderDirection {
  asc = 'asc',
  desc = 'desc'
}

export interface QueryOptions {
  limit?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: OrderDirection;
}

export interface Where {
  [key: string]: [{
    value: any;
    not: boolean;
    operator: keyof typeof OPERATOR_MAP;
  }]
}

// Cache for updated entities used in job-runner event processing.
export interface CachedEntities {
  frothyBlocks: Map<
    string,
    {
      blockNumber: number;
      parentHash: string;
      entities: Map<string, Map<string, { [key: string]: any }>>;
    }
  >;
  latestPrunedEntities: Map<string, Map<string, { [key: string]: any }>>;
}

export type Relation = { entity: any, type: RelationType, field: string, foreignKey?: string, childRelations?: Relation[] }

export class Database {
  _config: ConnectionOptions
  _conn!: Connection
  _blockCount = 0
  _eventCount = 0
  _cachedEntities: CachedEntities = {
    frothyBlocks: new Map(),
    latestPrunedEntities: new Map()
  }

  constructor (config: ConnectionOptions) {
    assert(config);
    this._config = config;
  }

  get cachedEntities () {
    return this._cachedEntities;
  }

  async init (): Promise<Connection> {
    assert(!this._conn);

    this._conn = await createConnection({
      ...this._config,
      namingStrategy: new SnakeNamingStrategy()
    });

    await this._fetchBlockCount();
    await this._fetchEventCount();

    return this._conn;
  }

  async close (): Promise<void> {
    return this._conn.close();
  }

  async createTransactionRunner (): Promise<QueryRunner> {
    const queryRunner = this._conn.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    return queryRunner;
  }

  async getSyncStatus (repo: Repository<SyncStatusInterface>): Promise<SyncStatusInterface | undefined> {
    return repo.findOne();
  }

  async updateSyncStatusIndexedBlock (repo: Repository<SyncStatusInterface>, blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    const entity = await repo.findOne();
    assert(entity);

    if (force || blockNumber >= entity.latestIndexedBlockNumber) {
      entity.latestIndexedBlockHash = blockHash;
      entity.latestIndexedBlockNumber = blockNumber;
    }

    return await repo.save(entity);
  }

  async updateSyncStatusCanonicalBlock (repo: Repository<SyncStatusInterface>, blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    const entity = await repo.findOne();
    assert(entity);

    if (force || blockNumber >= entity.latestCanonicalBlockNumber) {
      entity.latestCanonicalBlockHash = blockHash;
      entity.latestCanonicalBlockNumber = blockNumber;
    }

    return await repo.save(entity);
  }

  async updateSyncStatusChainHead (repo: Repository<SyncStatusInterface>, blockHash: string, blockNumber: number, force = false): Promise<SyncStatusInterface> {
    let entity = await repo.findOne();
    if (!entity) {
      entity = repo.create({
        chainHeadBlockHash: blockHash,
        chainHeadBlockNumber: blockNumber,
        latestCanonicalBlockHash: blockHash,
        latestCanonicalBlockNumber: blockNumber,
        latestIndexedBlockHash: '',
        latestIndexedBlockNumber: -1
      });
    }

    if (force || blockNumber >= entity.chainHeadBlockNumber) {
      entity.chainHeadBlockHash = blockHash;
      entity.chainHeadBlockNumber = blockNumber;
    }

    return await repo.save(entity);
  }

  async getBlockProgress (repo: Repository<BlockProgressInterface>, blockHash: string): Promise<BlockProgressInterface | undefined> {
    return repo.findOne({ where: { blockHash } });
  }

  async getBlockProgressEntities (repo: Repository<BlockProgressInterface>, where: FindConditions<BlockProgressInterface>, options: FindManyOptions<BlockProgressInterface>): Promise<BlockProgressInterface[]> {
    options.where = where;

    return repo.find(options);
  }

  async getBlocksAtHeight (repo: Repository<BlockProgressInterface>, height: number, isPruned: boolean): Promise<BlockProgressInterface[]> {
    return repo.createQueryBuilder('block_progress')
      .where('block_number = :height AND is_pruned = :isPruned', { height, isPruned })
      .getMany();
  }

  async saveBlockProgress (repo: Repository<BlockProgressInterface>, block: DeepPartial<BlockProgressInterface>): Promise<BlockProgressInterface> {
    this._blockCount++;
    blockProgressCount.set(this._blockCount);

    return await repo.save(block);
  }

  async updateBlockProgress (repo: Repository<BlockProgressInterface>, block: BlockProgressInterface, lastProcessedEventIndex: number): Promise<BlockProgressInterface> {
    if (!block.isComplete) {
      if (lastProcessedEventIndex <= block.lastProcessedEventIndex) {
        throw new Error(`Events processed out of order ${block.blockHash}, was ${block.lastProcessedEventIndex}, got ${lastProcessedEventIndex}`);
      }

      block.lastProcessedEventIndex = lastProcessedEventIndex;
      block.numProcessedEvents++;
      if (block.numProcessedEvents >= block.numEvents) {
        block.isComplete = true;
      }
    }

    const { generatedMaps } = await repo.createQueryBuilder()
      .update()
      .set(block)
      .where('id = :id', { id: block.id })
      .whereEntity(block)
      .returning('*')
      .execute();

    block = generatedMaps[0] as BlockProgressInterface;

    return block;
  }

  async markBlocksAsPruned (repo: Repository<BlockProgressInterface>, blocks: BlockProgressInterface[]): Promise<void> {
    const ids = blocks.map(({ id }) => id);

    await repo.update({ id: In(ids) }, { isPruned: true });
  }

  async getEvent (repo: Repository<EventInterface>, id: string): Promise<EventInterface | undefined> {
    return repo.findOne(id, { relations: ['block'] });
  }

  async getBlockEvents (repo: Repository<EventInterface>, blockHash: string, where: Where = {}, queryOptions: QueryOptions = {}): Promise<EventInterface[]> {
    let queryBuilder = repo.createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block.block_hash = :blockHash AND block.is_pruned = false', { blockHash });

    queryBuilder = this._buildQuery(repo, queryBuilder, where);

    if (queryOptions.orderBy) {
      queryBuilder = this._orderQuery(repo, queryBuilder, queryOptions);
    }

    queryBuilder.addOrderBy('event.id', 'ASC');

    if (queryOptions.skip) {
      queryBuilder = queryBuilder.offset(queryOptions.skip);
    }

    if (queryOptions.limit) {
      queryBuilder = queryBuilder.limit(queryOptions.limit);
    }

    return queryBuilder.getMany();
  }

  async saveEvents (eventRepo: Repository<EventInterface>, events: DeepPartial<EventInterface>[]): Promise<void> {
    // Bulk insert events.
    const eventBatches = _.chunk(events, INSERT_EVENTS_BATCH);

    const insertPromises = eventBatches.map(async events => {
      await eventRepo.createQueryBuilder()
        .insert()
        .values(events)
        .updateEntity(false)
        .execute();
    });

    await Promise.all(insertPromises);

    this._eventCount += events.length;
    eventCount.set(this._eventCount);
  }

  async getEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindConditions<Entity>): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entity);

    const entities = await repo.find(findConditions);
    return entities;
  }

  async isEntityEmpty<Entity> (entity: new () => Entity): Promise<boolean> {
    const queryRunner = this._conn.createQueryRunner();

    try {
      await queryRunner.connect();
      const data = await this.getEntities(queryRunner, entity);

      if (data.length > 0) {
        return false;
      }

      return true;
    } finally {
      await queryRunner.release();
    }
  }

  async removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions: FindConditions<Entity> = {}): Promise<void> {
    const repo = queryRunner.manager.getRepository(entity);

    await repo.delete(findConditions);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    const heirerchicalQuery = `
      WITH RECURSIVE cte_query AS
      (
        SELECT
          block_hash,
          block_number,
          parent_hash,
          0 as depth
        FROM
          block_progress
        WHERE
          block_hash = $1
        UNION ALL
          SELECT
            b.block_hash,
            b.block_number,
            b.parent_hash,
            c.depth + 1
          FROM
            block_progress b
          INNER JOIN
            cte_query c ON c.parent_hash = b.block_hash
          WHERE
            c.depth < $2
      )
      SELECT
        block_hash, block_number
      FROM
        cte_query
      ORDER BY block_number ASC
      LIMIT 1;
    `;

    // Get ancestor block hash using heirarchical query.
    const [{ block_hash: ancestorBlockHash }] = await this._conn.query(heirerchicalQuery, [blockHash, depth]);

    return ancestorBlockHash;
  }

  async getProcessedBlockCountForRange (repo: Repository<BlockProgressInterface>, fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    const blockNumbers = _.range(fromBlockNumber, toBlockNumber + 1);
    const expected = blockNumbers.length;

    const { count: actual } = await repo
      .createQueryBuilder('block_progress')
      .select('COUNT(DISTINCT(block_number))', 'count')
      .where('block_number IN (:...blockNumbers) AND is_complete = :isComplete', { blockNumbers, isComplete: true })
      .getRawOne();

    return { expected, actual: parseInt(actual) };
  }

  async getEventsInRange (repo: Repository<EventInterface>, fromBlockNumber: number, toBlockNumber: number): Promise<Array<EventInterface>> {
    const events = repo.createQueryBuilder('event')
      .innerJoinAndSelect('event.block', 'block')
      .where('block_number >= :fromBlockNumber AND block_number <= :toBlockNumber AND event_name <> :eventName AND is_pruned = false', {
        fromBlockNumber,
        toBlockNumber,
        eventName: UNKNOWN_EVENT_NAME
      })
      .addOrderBy('event.id', 'ASC')
      .getMany();

    return events;
  }

  async saveEventEntity (repo: Repository<EventInterface>, entity: EventInterface): Promise<EventInterface> {
    const event = await repo.save(entity);
    this._eventCount++;
    eventCount.set(this._eventCount);

    return event;
  }

  async getModelEntities<Entity> (
    queryRunner: QueryRunner,
    relationsMap: Map<any, { [key: string]: any }>,
    entity: new () => Entity,
    block: BlockHeight,
    where: Where = {},
    queryOptions: QueryOptions = {},
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entity);
    const { tableName } = repo.metadata;

    let subQuery = repo.createQueryBuilder('subTable')
      .select('subTable.id', 'id')
      .addSelect('MAX(subTable.block_number)', 'block_number')
      .addFrom('block_progress', 'blockProgress')
      .where('subTable.block_hash = blockProgress.block_hash')
      .andWhere('blockProgress.is_pruned = :isPruned', { isPruned: false })
      .groupBy('subTable.id');

    if (block.hash) {
      const { canonicalBlockNumber, blockHashes } = await this.getFrothyRegion(queryRunner, block.hash);

      subQuery = subQuery
        .andWhere(new Brackets(qb => {
          qb.where('subTable.block_hash IN (:...blockHashes)', { blockHashes })
            .orWhere('subTable.block_number <= :canonicalBlockNumber', { canonicalBlockNumber });
        }));
    }

    if (block.number) {
      subQuery = subQuery.andWhere('subTable.block_number <= :blockNumber', { blockNumber: block.number });
    }

    let selectQueryBuilder = repo.createQueryBuilder(tableName)
      .innerJoin(
        `(${subQuery.getQuery()})`,
        'latestEntities',
        `${tableName}.id = "latestEntities"."id" AND ${tableName}.block_number = "latestEntities"."block_number"`
      )
      .setParameters(subQuery.getParameters());

    selectQueryBuilder = this._buildQuery(repo, selectQueryBuilder, where);

    if (queryOptions.orderBy) {
      selectQueryBuilder = this._orderQuery(repo, selectQueryBuilder, queryOptions);
    }

    selectQueryBuilder = this._orderQuery(repo, selectQueryBuilder, { ...queryOptions, orderBy: 'id' });

    if (queryOptions.skip) {
      selectQueryBuilder = selectQueryBuilder.offset(queryOptions.skip);
    }

    if (queryOptions.limit) {
      selectQueryBuilder = selectQueryBuilder.limit(queryOptions.limit);
    }

    let entities = await selectQueryBuilder.getMany();

    if (!entities.length) {
      return [];
    }

    entities = await this.loadRelations(queryRunner, block, relationsMap, entity, entities, selections);

    return entities;
  }

  async getModelEntity<Entity> (repo: Repository<Entity>, whereOptions: any): Promise<Entity | undefined> {
    const findOptions = {
      where: whereOptions,
      order: {
        blockNumber: 'DESC'
      }
    };

    if (findOptions.where.blockHash) {
      // Check cache only if latestPrunedEntities is updated.
      // latestPrunedEntities is updated when frothyBlocks is filled till canonical block height.
      if (this._cachedEntities.latestPrunedEntities.size > 0) {
        let frothyBlock = this._cachedEntities.frothyBlocks.get(findOptions.where.blockHash);
        let canonicalBlockNumber = -1;

        // Loop through frothy region until latest entity is found.
        while (frothyBlock) {
          const entity = frothyBlock.entities
            .get(repo.metadata.tableName)
            ?.get(findOptions.where.id);

          if (entity) {
            return _.cloneDeep(entity) as Entity;
          }

          canonicalBlockNumber = frothyBlock.blockNumber + 1;
          frothyBlock = this._cachedEntities.frothyBlocks.get(frothyBlock.parentHash);
        }

        // Canonical block number is not assigned if blockHash does not exist in frothy region.
        // Get latest pruned entity from cache only if blockHash exists in frothy region.
        // i.e. Latest entity in cache is the version before frothy region.
        if (canonicalBlockNumber > -1) {
          // If entity not found in frothy region get latest entity in the pruned region.
          // Check if latest entity is cached in pruned region.
          const entity = this._cachedEntities.latestPrunedEntities
            .get(repo.metadata.tableName)
            ?.get(findOptions.where.id);

          if (entity) {
            return _.cloneDeep(entity) as Entity;
          }

          // Get latest pruned entity from DB if not found in cache.
          const dbEntity = await this._getLatestPrunedEntity(repo, findOptions.where.id, canonicalBlockNumber);

          if (dbEntity) {
            // Update latest pruned entity in cache.
            this.cacheUpdatedEntity(repo, dbEntity);
          }

          return dbEntity;
        }
      }

      return this.getPrevEntityVersion(repo.queryRunner!, repo, findOptions);
    }

    return repo.findOne(findOptions);
  }

  async loadRelations<Entity> (
    queryRunner: QueryRunner,
    block: BlockHeight,
    relationsMap: Map<any, { [key: string]: any }>,
    entity: new () => Entity,
    entities: Entity[],
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity[]> {
    const relations = relationsMap.get(entity);

    if (!relations) {
      return entities;
    }

    // Filter selections from GQL query which are relations.
    const relationPromises = selections.filter((selection) => selection.kind === 'Field' && Boolean(relations[selection.name.value]))
      .map(async (selection) => {
        assert(selection.kind === 'Field');
        const field = selection.name.value;
        const { entity: relationEntity, type, foreignKey } = relations[field];
        let childSelections = selection.selectionSet?.selections || [];

        // Filter out __typename field in GQL for loading relations.
        childSelections = childSelections.filter(selection => !(selection.kind === 'Field' && selection.name.value === '__typename'));

        switch (type) {
          case 'one-to-many': {
            assert(foreignKey);

            const where: Where = {
              [foreignKey]: [{
                value: entities.map((entity: any) => entity.id),
                not: false,
                operator: 'in'
              }]
            };

            const relatedEntities = await this.getModelEntities(
              queryRunner,
              relationsMap,
              relationEntity,
              block,
              where,
              {},
              childSelections
            );

            const relatedEntitiesMap = relatedEntities.reduce((acc: {[key:string]: any[]}, entity: any) => {
              // Related entity might be loaded with data.
              const parentEntityId = entity[foreignKey].id ?? entity[foreignKey];

              if (!acc[parentEntityId]) {
                acc[parentEntityId] = [];
              }

              if (acc[parentEntityId].length < DEFAULT_LIMIT) {
                acc[parentEntityId].push(entity);
              }

              return acc;
            }, {});

            entities.forEach((entity: any) => {
              if (relatedEntitiesMap[entity.id]) {
                entity[field] = relatedEntitiesMap[entity.id];
              } else {
                entity[field] = [];
              }
            });

            break;
          }

          case 'many-to-many': {
            const relatedIds = entities.reduce((acc, entity: any) => {
              entity[field].forEach((relatedEntityId: any) => acc.add(relatedEntityId));

              return acc;
            }, new Set());

            const where: Where = {
              id: [{
                value: Array.from(relatedIds),
                not: false,
                operator: 'in'
              }]
            };

            const relatedEntities = await this.getModelEntities(
              queryRunner,
              relationsMap,
              relationEntity,
              block,
              where,
              {},
              childSelections
            );

            entities.forEach((entity: any) => {
              const relatedEntityIds: Set<string> = entity[field].reduce((acc: Set<string>, id: string) => {
                acc.add(id);

                return acc;
              }, new Set());

              entity[field] = [];

              relatedEntities.forEach((relatedEntity: any) => {
                if (relatedEntityIds.has(relatedEntity.id) && entity[field].length < DEFAULT_LIMIT) {
                  entity[field].push(relatedEntity);
                }
              });
            });

            break;
          }

          default: {
            // For one-to-one/many-to-one relations.
            if (childSelections.length === 1 && childSelections[0].kind === 'Field' && childSelections[0].name.value === 'id') {
              // Avoid loading relation if selections only has id field.
              entities.forEach((entity: any) => {
                entity[field] = { id: entity[field] };
              });

              break;
            }

            const where: Where = {
              id: [{
                value: entities.map((entity: any) => entity[field]),
                not: false,
                operator: 'in'
              }]
            };

            const relatedEntities = await this.getModelEntities(
              queryRunner,
              relationsMap,
              relationEntity,
              block,
              where,
              {},
              childSelections
            );

            const relatedEntitiesMap = relatedEntities.reduce((acc: {[key:string]: any}, entity: any) => {
              acc[entity.id] = entity;

              return acc;
            }, {});

            entities.forEach((entity: any) => {
              if (relatedEntitiesMap[entity[field]]) {
                entity[field] = relatedEntitiesMap[entity[field]];
              }
            });

            break;
          }
        }
      });

    await Promise.all(relationPromises);

    return entities;
  }

  async getPrevEntityVersion<Entity> (queryRunner: QueryRunner, repo: Repository<Entity>, findOptions: { [key: string]: any }): Promise<Entity | undefined> {
    // Hierarchical query for getting the entity in the frothy region.
    const heirerchicalQuery = `
      WITH RECURSIVE cte_query AS
      (
        SELECT
          b.block_hash,
          b.block_number,
          b.parent_hash,
          1 as depth,
          e.id
        FROM
          block_progress b
          LEFT JOIN
            ${repo.metadata.tableName} e
            ON e.block_hash = b.block_hash
            AND e.id = $2
        WHERE
          b.block_hash = $1
        UNION ALL
          SELECT
            b.block_hash,
            b.block_number,
            b.parent_hash,
            c.depth + 1,
            e.id
          FROM
            block_progress b
            LEFT JOIN
              ${repo.metadata.tableName} e
              ON e.block_hash = b.block_hash
              AND e.id = $2
            INNER JOIN
              cte_query c ON c.parent_hash = b.block_hash
            WHERE
              c.id IS NULL AND c.depth < $3
      )
      SELECT
        block_hash, block_number, id
      FROM
        cte_query
      ORDER BY block_number ASC
      LIMIT 1;
    `;

    // Fetching blockHash for previous entity in frothy region.
    const [{ block_hash: blockHash, block_number: blockNumber, id }] = await queryRunner.query(heirerchicalQuery, [findOptions.where.blockHash, findOptions.where.id, MAX_REORG_DEPTH]);

    if (id) {
      // Entity found in frothy region.
      findOptions.where.blockHash = blockHash;

      return repo.findOne(findOptions);
    }

    return this._getLatestPrunedEntity(repo, findOptions.where.id, blockNumber + 1);
  }

  async _getLatestPrunedEntity<Entity> (repo: Repository<Entity>, id: string, canonicalBlockNumber: number): Promise<Entity | undefined> {
    // Filter out latest entity from pruned blocks.
    const entityInPrunedRegion = await repo.createQueryBuilder('entity')
      .innerJoinAndSelect('block_progress', 'block', 'block.block_hash = entity.block_hash')
      .where('block.is_pruned = false')
      .andWhere('entity.id = :id', { id })
      .andWhere('entity.block_number <= :canonicalBlockNumber', { canonicalBlockNumber })
      .orderBy('entity.block_number', 'DESC')
      .limit(1)
      .getOne();

    return entityInPrunedRegion;
  }

  async getFrothyRegion (queryRunner: QueryRunner, blockHash: string): Promise<{ canonicalBlockNumber: number, blockHashes: string[] }> {
    const heirerchicalQuery = `
      WITH RECURSIVE cte_query AS
      (
        SELECT
          block_hash,
          block_number,
          parent_hash,
          1 as depth
        FROM
          block_progress
        WHERE
          block_hash = $1
        UNION ALL
          SELECT
            b.block_hash,
            b.block_number,
            b.parent_hash,
            c.depth + 1
          FROM
            block_progress b
          INNER JOIN
            cte_query c ON c.parent_hash = b.block_hash
          WHERE
            c.depth < $2
      )
      SELECT
        block_hash, block_number
      FROM
        cte_query;
    `;

    // Get blocks in the frothy region using heirarchical query.
    const blocks = await queryRunner.query(heirerchicalQuery, [blockHash, MAX_REORG_DEPTH]);
    const blockHashes = blocks.map(({ block_hash: blockHash }: any) => blockHash);

    // Canonical block is the block after the last block in frothy region.
    const canonicalBlockNumber = blocks[blocks.length - 1].block_number + 1;

    return { canonicalBlockNumber, blockHashes };
  }

  async getContracts (repo: Repository<ContractInterface>): Promise<ContractInterface[]> {
    return repo.createQueryBuilder('contract')
      .getMany();
  }

  async saveContract (repo: Repository<ContractInterface>, address: string, startingBlock: number, kind?: string): Promise<ContractInterface> {
    const contract = await repo
      .createQueryBuilder()
      .where('address = :address', { address })
      .getOne();

    const entity = repo.create({ address, kind, startingBlock });

    // If contract already present, overwrite fields.
    if (contract) {
      entity.id = contract.id;
    }

    return repo.save(entity);
  }

  cacheUpdatedEntity<Entity> (repo: Repository<Entity>, entity: any): void {
    const frothyBlock = this._cachedEntities.frothyBlocks.get(entity.blockHash);

    // Update frothyBlock only if already present in cache.
    // Might not be present when event processing starts without block processing on job retry.
    if (frothyBlock) {
      let entityIdMap = frothyBlock.entities.get(repo.metadata.tableName);

      if (!entityIdMap) {
        entityIdMap = new Map();
      }

      entityIdMap.set(entity.id, _.cloneDeep(entity));
      frothyBlock.entities.set(repo.metadata.tableName, entityIdMap);
    }
  }

  async _fetchBlockCount (): Promise<void> {
    this._blockCount = await this._conn.getRepository('block_progress')
      .count();

    blockProgressCount.set(this._blockCount);
  }

  async _fetchEventCount (): Promise<void> {
    this._eventCount = await this._conn.getRepository('event')
      .count({
        where: {
          eventName: Not(UNKNOWN_EVENT_NAME)
        }
      });

    eventCount.set(this._eventCount);
  }

  _buildQuery<Entity> (repo: Repository<Entity>, selectQueryBuilder: SelectQueryBuilder<Entity>, where: Where = {}): SelectQueryBuilder<Entity> {
    Object.entries(where).forEach(([field, filters]) => {
      filters.forEach((filter, index) => {
        // Form the where clause.
        let { not, operator, value } = filter;
        const columnMetadata = repo.metadata.findColumnWithPropertyName(field);
        assert(columnMetadata);
        let whereClause = `"${selectQueryBuilder.alias}"."${columnMetadata.databaseName}" `;

        if (columnMetadata.relationMetadata) {
          // For relation fields, use the id column.
          const idColumn = columnMetadata.relationMetadata.joinColumns.find(column => column.referencedColumn?.propertyName === 'id');
          assert(idColumn);
          whereClause = `"${selectQueryBuilder.alias}"."${idColumn.databaseName}" `;
        }

        if (not) {
          if (operator === 'equals') {
            whereClause += '!';
          } else {
            whereClause += 'NOT ';
          }
        }

        whereClause += `${OPERATOR_MAP[operator]} `;

        if (operator === 'in') {
          whereClause += '(:...';
        } else {
          // Convert to string type value as bigint type throws error in query.
          value = value.toString();

          whereClause += ':';
        }

        const variableName = `${field}${index}`;
        whereClause += variableName;

        if (operator === 'in') {
          whereClause += ')';

          if (!value.length) {
            whereClause = 'FALSE';
          }
        }

        if (['contains', 'starts'].some(el => el === operator)) {
          value = `%${value}`;
        }

        if (['contains', 'ends'].some(el => el === operator)) {
          value += '%';
        }

        selectQueryBuilder = selectQueryBuilder.andWhere(whereClause, { [variableName]: value });
      });
    });

    return selectQueryBuilder;
  }

  _orderQuery<Entity> (
    repo: Repository<Entity>,
    selectQueryBuilder: SelectQueryBuilder<Entity>,
    orderOptions: { orderBy?: string, orderDirection?: string }
  ): SelectQueryBuilder<Entity> {
    const { orderBy, orderDirection } = orderOptions;
    assert(orderBy);

    const columnMetadata = repo.metadata.findColumnWithPropertyName(orderBy);
    assert(columnMetadata);

    return selectQueryBuilder.addOrderBy(
      `${selectQueryBuilder.alias}.${columnMetadata.propertyAliasName}`,
      orderDirection === 'desc' ? 'DESC' : 'ASC'
    );
  }
}
