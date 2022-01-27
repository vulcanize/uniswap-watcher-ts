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
  QueryRunner,
  Repository,
  SelectQueryBuilder
} from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import _ from 'lodash';
import { RelationType } from 'typeorm/metadata/types/RelationTypes';

import { BlockProgressInterface, ContractInterface, EventInterface, SyncStatusInterface } from './types';
import { MAX_REORG_DEPTH, UNKNOWN_EVENT_NAME } from './constants';

export const DEFAULT_LIMIT = 100;
export const DEFAULT_SKIP = 0;

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

export type Relation = { entity: any, type: RelationType, property: string, field: string, childRelations?: Relation[] }

export class Database {
  _config: ConnectionOptions
  _conn!: Connection

  constructor (config: ConnectionOptions) {
    assert(config);
    this._config = config;
  }

  async init (): Promise<Connection> {
    assert(!this._conn);

    this._conn = await createConnection({
      ...this._config,
      namingStrategy: new SnakeNamingStrategy()
    });

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

    const { limit = DEFAULT_LIMIT, skip = DEFAULT_SKIP } = queryOptions;

    queryBuilder = queryBuilder.offset(skip)
      .limit(limit);

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

  async removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindConditions<Entity>): Promise<void> {
    const repo = queryRunner.manager.getRepository(entity);

    if (findConditions) {
      await repo.delete(findConditions);

      return;
    }

    await repo.clear();
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
    return await repo.save(entity);
  }

  async getModelEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, block: BlockHeight, where: Where = {}, queryOptions: QueryOptions = {}, relations: Relation[] = []): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entity);
    const { tableName } = repo.metadata;

    let subQuery = repo.createQueryBuilder('subTable')
      .select('subTable.id', 'id')
      .addSelect('MAX(subTable.block_number)', 'block_number')
      .addFrom('block_progress', 'blockProgress')
      .where('subTable.block_hash = blockProgress.block_hash')
      .andWhere('blockProgress.is_pruned = :isPruned', { isPruned: false })
      .groupBy('subTable.id');

    subQuery = this._buildQuery(repo, subQuery, where);

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

    if (queryOptions.orderBy) {
      selectQueryBuilder = this._orderQuery(repo, selectQueryBuilder, queryOptions);
    }

    const { limit = DEFAULT_LIMIT, skip = DEFAULT_SKIP } = queryOptions;

    selectQueryBuilder = selectQueryBuilder.offset(skip)
      .limit(limit);

    // Load entity ids for many to many relations.
    relations.filter(relation => relation.type === 'many-to-many')
      .forEach(relation => {
        const { property } = relation;

        selectQueryBuilder = selectQueryBuilder.leftJoinAndSelect(`${selectQueryBuilder.alias}.${property}`, property)
          .addOrderBy(`${property}.id`);

        // TODO: Get only ids from many to many join table instead of joining with related entity table.
      });

    let entities = await selectQueryBuilder.getMany();

    if (!entities.length) {
      return [];
    }

    entities = await this.loadRelations(queryRunner, block, queryOptions, relations, entities);

    return entities;
  }

  async loadRelations<Entity> (queryRunner: QueryRunner, block: BlockHeight, queryOptions: QueryOptions = {}, relations: Relation[], entities: Entity[]): Promise<Entity[]> {
    const relationPromises = relations.map(async relation => {
      const { entity: relationEntity, type, property, field, childRelations = [] } = relation;

      switch (type) {
        case 'one-to-many': {
          const where: Where = {
            [field]: [{
              value: entities.map((entity: any) => entity.id),
              not: false,
              operator: 'in'
            }]
          };

          const relatedEntities = await this.getModelEntities(
            queryRunner,
            relationEntity,
            block,
            where,
            {
              orderBy: 'id',
              limit: queryOptions.limit
            },
            childRelations
          );

          const relatedEntitiesMap = relatedEntities.reduce((acc: {[key:string]: any[]}, entity: any) => {
            if (!acc[entity[field]]) {
              acc[entity[field]] = [];
            }

            acc[entity[field]].push(entity);

            return acc;
          }, {});

          entities.forEach((entity: any) => {
            if (relatedEntitiesMap[entity.id]) {
              entity[property] = relatedEntitiesMap[entity.id];
            } else {
              entity[property] = [];
            }
          });

          break;
        }

        case 'many-to-many': {
          const relatedIds = entities.reduce((acc, entity: any) => {
            entity[property].forEach((relatedEntity: any) => acc.add(relatedEntity.id));

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
            relationEntity,
            block,
            where,
            {
              limit: queryOptions.limit
            },
            childRelations
          );

          const relatedEntitiesMap = relatedEntities.reduce((acc: {[key:string]: any}, entity: any) => {
            acc[entity.id] = entity;

            return acc;
          }, {});

          entities.forEach((entity: any) => {
            const relatedField = entity[property] as any[];

            relatedField.forEach((relatedEntity, index) => {
              relatedField[index] = relatedEntitiesMap[relatedEntity.id];
            });
          });

          break;
        }

        default: {
          // For one-to-one/many-to-one relations.
          const where: Where = {
            id: [{
              value: entities.map((entity: any) => entity[field]),
              not: false,
              operator: 'in'
            }]
          };

          const relatedEntities = await this.getModelEntities(
            queryRunner,
            relationEntity,
            block,
            where,
            {
              limit: queryOptions.limit
            },
            childRelations
          );

          const relatedEntitiesMap = relatedEntities.reduce((acc: {[key:string]: any}, entity: any) => {
            acc[entity.id] = entity;

            return acc;
          }, {});

          entities.forEach((entity: any) => {
            if (relatedEntitiesMap[entity[field]]) {
              entity[property] = relatedEntitiesMap[entity[field]];
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
    } else {
      // If entity not found in frothy region get latest entity in the pruned region.
      // Filter out entities from pruned blocks.
      const canonicalBlockNumber = blockNumber + 1;
      const entityInPrunedRegion:any = await repo.createQueryBuilder('entity')
        .innerJoinAndSelect('block_progress', 'block', 'block.block_hash = entity.block_hash')
        .where('block.is_pruned = false')
        .andWhere('entity.id = :id', { id: findOptions.where.id })
        .andWhere('entity.block_number <= :canonicalBlockNumber', { canonicalBlockNumber })
        .orderBy('entity.block_number', 'DESC')
        .limit(1)
        .getOne();

      findOptions.where.blockHash = entityInPrunedRegion?.blockHash;
    }

    return repo.findOne(findOptions);
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

        if (['contains', 'starts'].some(el => el === operator)) {
          whereClause += '%:';
        } else if (operator === 'in') {
          whereClause += '(:...';
        } else {
          // Convert to string type value as bigint type throws error in query.
          value = value.toString();

          whereClause += ':';
        }

        const variableName = `${field}${index}`;
        whereClause += variableName;

        if (['contains', 'ends'].some(el => el === operator)) {
          whereClause += '%';
        } else if (operator === 'in') {
          whereClause += ')';

          if (!value.length) {
            whereClause = 'FALSE';
          }
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
