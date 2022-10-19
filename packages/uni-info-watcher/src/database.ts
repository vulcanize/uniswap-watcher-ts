//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import {
  Brackets,
  Connection,
  ConnectionOptions,
  DeepPartial,
  FindConditions,
  FindManyOptions,
  LessThanOrEqual,
  QueryRunner,
  Repository,
  SelectQueryBuilder
} from 'typeorm';
import { RawSqlResultsToEntityTransformer } from 'typeorm/query-builder/transformer/RawSqlResultsToEntityTransformer';
import path from 'path';
import { SelectionNode } from 'graphql';
import debug from 'debug';
import _ from 'lodash';

import {
  eventProcessingLoadEntityCacheHitCount,
  eventProcessingLoadEntityCount,
  eventProcessingLoadEntityDBQueryDuration,
  StateKind,
  Database as BaseDatabase,
  DatabaseInterface,
  BlockHeight,
  QueryOptions,
  Where
} from '@cerc-io/util';

import { Factory } from './entity/Factory';
import { Pool } from './entity/Pool';
import { Event } from './entity/Event';
import { Token } from './entity/Token';
import { Bundle } from './entity/Bundle';
import { PoolDayData } from './entity/PoolDayData';
import { PoolHourData } from './entity/PoolHourData';
import { Transaction } from './entity/Transaction';
import { Mint } from './entity/Mint';
import { UniswapDayData } from './entity/UniswapDayData';
import { Tick } from './entity/Tick';
import { TokenDayData } from './entity/TokenDayData';
import { TokenHourData } from './entity/TokenHourData';
import { Burn } from './entity/Burn';
import { Swap } from './entity/Swap';
import { Position } from './entity/Position';
import { PositionSnapshot } from './entity/PositionSnapshot';
import { BlockProgress } from './entity/BlockProgress';
import { Block } from './events';
import { SyncStatus } from './entity/SyncStatus';
import { TickDayData } from './entity/TickDayData';
import { Contract } from './entity/Contract';
import { State } from './entity/State';
import { StateSyncStatus } from './entity/StateSyncStatus';
import { Collect } from './entity/Collect';
import { Flash } from './entity/Flash';
import { TickHourData } from './entity/TickHourData';
import { resolveEntityFieldConflicts } from './utils';

const log = debug('vulcanize:database');

export const DEFAULT_LIMIT = 100;

export enum ENTITY_QUERY_TYPE {
  SINGULAR,
  DISTINCT_ON,
  GROUP_BY
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

// Map: Entity to suitable query type.
const ENTITY_QUERY_TYPE_MAP = new Map<new() => any, number>([
  [Bundle, ENTITY_QUERY_TYPE.SINGULAR],
  [Factory, ENTITY_QUERY_TYPE.SINGULAR],
  [Pool, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [Token, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [Burn, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [Mint, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [Swap, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [Transaction, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [TokenDayData, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [TokenHourData, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [PoolDayData, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [PoolHourData, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [Position, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [PositionSnapshot, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [Tick, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [TickDayData, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [UniswapDayData, ENTITY_QUERY_TYPE.GROUP_BY]
]);

export class Database implements DatabaseInterface {
  _config: ConnectionOptions
  _conn!: Connection
  _baseDatabase: BaseDatabase
  _relationsMap: Map<any, { [key: string]: any }>

  _cachedEntities: CachedEntities = {
    frothyBlocks: new Map(),
    latestPrunedEntities: new Map()
  }

  constructor (config: ConnectionOptions) {
    assert(config);

    this._config = {
      ...config,
      entities: [path.join(__dirname, 'entity/*')]
    };

    this._baseDatabase = new BaseDatabase(this._config);
    this._relationsMap = new Map();
    this._populateRelationsMap();
  }

  get relationsMap (): Map<any, { [key: string]: any; }> {
    return this._relationsMap;
  }

  get cachedEntities (): CachedEntities {
    return this._cachedEntities;
  }

  async init (): Promise<void> {
    this._conn = await this._baseDatabase.init();
  }

  async close (): Promise<void> {
    return this._baseDatabase.close();
  }

  getNewState (): State {
    return new State();
  }

  async getStates (where: FindConditions<State>): Promise<State[]> {
    const repo = this._conn.getRepository(State);

    return this._baseDatabase.getStates(repo, where);
  }

  async getLatestState (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<State | undefined> {
    const repo = this._conn.getRepository(State);

    return this._baseDatabase.getLatestState(repo, contractAddress, kind, blockNumber);
  }

  async getPrevState (blockHash: string, contractAddress: string, kind?: string): Promise<State | undefined> {
    const repo = this._conn.getRepository(State);

    return this._baseDatabase.getPrevState(repo, blockHash, contractAddress, kind);
  }

  // Fetch all diff States after the specified block number.
  async getDiffStatesInRange (contractAddress: string, startblock: number, endBlock: number): Promise<State[]> {
    const repo = this._conn.getRepository(State);

    return this._baseDatabase.getDiffStatesInRange(repo, contractAddress, startblock, endBlock);
  }

  async saveOrUpdateState (dbTx: QueryRunner, state: State): Promise<State> {
    const repo = dbTx.manager.getRepository(State);

    return this._baseDatabase.saveOrUpdateState(repo, state);
  }

  async removeStates (dbTx: QueryRunner, blockNumber: number, kind: string): Promise<void> {
    const repo = dbTx.manager.getRepository(State);

    await this._baseDatabase.removeStates(repo, blockNumber, kind);
  }

  async removeStatesAfterBlock (dbTx: QueryRunner, blockNumber: number): Promise<void> {
    const repo = dbTx.manager.getRepository(State);

    await this._baseDatabase.removeStatesAfterBlock(repo, blockNumber);
  }

  async getStateSyncStatus (): Promise<StateSyncStatus | undefined> {
    const repo = this._conn.getRepository(StateSyncStatus);

    return this._baseDatabase.getStateSyncStatus(repo);
  }

  async updateStateSyncStatusIndexedBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    const repo = queryRunner.manager.getRepository(StateSyncStatus);

    return this._baseDatabase.updateStateSyncStatusIndexedBlock(repo, blockNumber, force);
  }

  async updateStateSyncStatusCheckpointBlock (queryRunner: QueryRunner, blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    const repo = queryRunner.manager.getRepository(StateSyncStatus);

    return this._baseDatabase.updateStateSyncStatusCheckpointBlock(repo, blockNumber, force);
  }

  async getFactory (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<Factory>): Promise<Factory | undefined> {
    const repo = queryRunner.manager.getRepository(Factory);
    const whereOptions: FindConditions<Factory> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    return this.getModelEntity(repo, whereOptions);
  }

  async getBundle (queryRunner: QueryRunner, { id, blockHash, blockNumber }: DeepPartial<Bundle>): Promise<Bundle | undefined> {
    const repo = queryRunner.manager.getRepository(Bundle);
    const whereOptions: FindConditions<Bundle> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    return this.getModelEntity(repo, whereOptions);
  }

  async getToken (
    queryRunner: QueryRunner,
    { id, blockHash, blockNumber }: DeepPartial<Token>,
    loadRelations = false,
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Token | undefined> {
    const repo = queryRunner.manager.getRepository(Token);
    const whereOptions: FindConditions<Token> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    let entity = await this.getModelEntity(repo, whereOptions);

    if (loadRelations && entity) {
      [entity] = await this.loadRelations(
        queryRunner,
        { hash: blockHash, number: blockNumber },
        this._relationsMap,
        Token,
        [entity],
        selections
      );
    }

    return entity;
  }

  async getTokenNoTx ({ id, blockHash }: DeepPartial<Token>): Promise<Token | undefined> {
    const queryRunner = this._conn.createQueryRunner();
    let res;

    try {
      await queryRunner.connect();
      res = await this.getToken(queryRunner, { id, blockHash });
    } finally {
      await queryRunner.release();
    }

    return res;
  }

  async getPool (
    queryRunner: QueryRunner,
    { id, blockHash, blockNumber }: DeepPartial<Pool>,
    loadRelations = false,
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Pool | undefined> {
    const repo = queryRunner.manager.getRepository(Pool);
    const whereOptions: FindConditions<Pool> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    if (blockNumber) {
      whereOptions.blockNumber = LessThanOrEqual(blockNumber);
    }

    let entity = await this.getModelEntity(repo, whereOptions);

    if (loadRelations && entity) {
      [entity] = await this.loadRelations(
        queryRunner,
        { hash: blockHash, number: blockNumber },
        this._relationsMap,
        Pool,
        [entity],
        selections
      );
    }

    return entity;
  }

  async getPoolNoTx ({ id, blockHash, blockNumber }: DeepPartial<Pool>): Promise<Pool | undefined> {
    const queryRunner = this._conn.createQueryRunner();
    let res;

    try {
      await queryRunner.connect();
      res = await this.getPool(queryRunner, { id, blockHash, blockNumber });
    } finally {
      await queryRunner.release();
    }

    return res;
  }

  async getPosition ({ id, blockHash }: DeepPartial<Position>, loadRelations = false): Promise<Position | undefined> {
    const queryRunner = this._conn.createQueryRunner();
    let entity;

    try {
      await queryRunner.connect();
      const repo = queryRunner.manager.getRepository(Position);
      const whereOptions: FindConditions<Position> = { id };

      if (blockHash) {
        whereOptions.blockHash = blockHash;
      }

      entity = await this.getModelEntity(repo, whereOptions);

      if (loadRelations && entity) {
        [entity] = await this.loadRelations(
          queryRunner,
          { hash: blockHash },
          this._relationsMap,
          Position,
          [entity]
        );
      }
    } finally {
      await queryRunner.release();
    }

    return entity;
  }

  async getTick (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<Tick>, loadRelations = false): Promise<Tick | undefined> {
    const repo = queryRunner.manager.getRepository(Tick);
    const whereOptions: FindConditions<Tick> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    let entity = await this.getModelEntity(repo, whereOptions);

    if (loadRelations && entity) {
      [entity] = await this.loadRelations(
        queryRunner,
        { hash: blockHash },
        this._relationsMap,
        Tick,
        [entity]
      );
    }

    return entity;
  }

  async getTickNoTx ({ id, blockHash }: DeepPartial<Tick>): Promise<Tick | undefined> {
    const queryRunner = this._conn.createQueryRunner();
    let res;

    try {
      await queryRunner.connect();
      res = await this.getTick(queryRunner, { id, blockHash });
    } finally {
      await queryRunner.release();
    }

    return res;
  }

  async getPoolDayData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<PoolDayData>, loadRelations = false): Promise<PoolDayData | undefined> {
    const repo = queryRunner.manager.getRepository(PoolDayData);
    const whereOptions: FindConditions<PoolDayData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    let entity = await this.getModelEntity(repo, whereOptions);

    if (loadRelations && entity) {
      [entity] = await this.loadRelations(
        queryRunner,
        { hash: blockHash },
        this._relationsMap,
        PoolDayData,
        [entity]
      );
    }

    return entity;
  }

  async getPoolHourData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<PoolHourData>, loadRelations = false): Promise<PoolHourData | undefined> {
    const repo = queryRunner.manager.getRepository(PoolHourData);
    const whereOptions: FindConditions<PoolHourData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    let entity = await this.getModelEntity(repo, whereOptions);

    if (loadRelations && entity) {
      [entity] = await this.loadRelations(
        queryRunner,
        { hash: blockHash },
        this._relationsMap,
        PoolHourData,
        [entity]
      );
    }

    return entity;
  }

  async getUniswapDayData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<UniswapDayData>): Promise<UniswapDayData | undefined> {
    const repo = queryRunner.manager.getRepository(UniswapDayData);
    const whereOptions: FindConditions<UniswapDayData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const entity = await this.getModelEntity(repo, whereOptions);

    return entity;
  }

  async getTokenDayData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<TokenDayData>, loadRelations = false): Promise<TokenDayData | undefined> {
    const repo = queryRunner.manager.getRepository(TokenDayData);
    const whereOptions: FindConditions<TokenDayData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    let entity = await this.getModelEntity(repo, whereOptions);

    if (loadRelations && entity) {
      [entity] = await this.loadRelations(
        queryRunner,
        { hash: blockHash },
        this._relationsMap,
        TokenDayData,
        [entity]
      );
    }

    return entity;
  }

  async getTokenHourData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<TokenHourData>, loadRelations = false): Promise<TokenHourData | undefined> {
    const repo = queryRunner.manager.getRepository(TokenHourData);
    const whereOptions: FindConditions<TokenHourData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    let entity = await this.getModelEntity(repo, whereOptions);

    if (loadRelations && entity) {
      [entity] = await this.loadRelations(
        queryRunner,
        { hash: blockHash },
        this._relationsMap,
        TokenHourData,
        [entity]
      );
    }

    return entity;
  }

  async getTickDayData (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<TickDayData>, loadRelations = false): Promise<TickDayData | undefined> {
    const repo = queryRunner.manager.getRepository(TickDayData);
    const whereOptions: FindConditions<TickDayData> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    let entity = await this.getModelEntity(repo, whereOptions);

    if (loadRelations && entity) {
      [entity] = await this.loadRelations(
        queryRunner,
        { hash: blockHash },
        this._relationsMap,
        TickDayData,
        [entity]
      );
    }

    return entity;
  }

  async getTransaction (queryRunner: QueryRunner, { id, blockHash }: DeepPartial<Transaction>): Promise<Transaction | undefined> {
    const repo = queryRunner.manager.getRepository(Transaction);
    const whereOptions: FindConditions<Transaction> = { id };

    if (blockHash) {
      whereOptions.blockHash = blockHash;
    }

    const entity = await this.getModelEntity(repo, whereOptions);

    return entity;
  }

  async getEntitiesForBlock (blockHash: string, tableName: string): Promise<any[]> {
    const repo = this._conn.getRepository(tableName);

    const entities = await repo.find({
      where: {
        blockHash
      }
    });

    return entities;
  }

  async getModelEntities<Entity> (
    queryRunner: QueryRunner,
    entity: new () => Entity,
    block: BlockHeight,
    where: Where = {},
    queryOptions: QueryOptions = {},
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity[]> {
    let entities: Entity[];

    // Use different suitable query patterns based on entities.
    switch (ENTITY_QUERY_TYPE_MAP.get(entity)) {
      case ENTITY_QUERY_TYPE.SINGULAR:
        entities = await this.getModelEntitiesSingular(queryRunner, entity, block, where);
        break;

      case ENTITY_QUERY_TYPE.DISTINCT_ON:
        entities = await this.getModelEntitiesDistinctOn(queryRunner, entity, block, where, queryOptions);
        break;

      case ENTITY_QUERY_TYPE.GROUP_BY:
        entities = await this.getModelEntitiesGroupBy(queryRunner, entity, block, where, queryOptions);
        break;

      default:
        log(`Invalid entity query type for entity ${entity}`);
        entities = [];
        break;
    }

    if (!entities.length) {
      return [];
    }

    entities = await this.loadRelations(queryRunner, block, this._relationsMap, entity, entities, selections);
    entities = entities.map(entity => resolveEntityFieldConflicts(entity));

    return entities;
  }

  async getModelEntitiesNoTx<Entity> (
    entity: new () => Entity,
    block: BlockHeight,
    where: Where = {},
    queryOptions: QueryOptions = {},
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity[]> {
    const queryRunner = this._conn.createQueryRunner();
    let res;

    try {
      await queryRunner.connect();
      res = await this.getModelEntities(queryRunner, entity, block, where, queryOptions, selections);
    } finally {
      await queryRunner.release();
    }

    return res;
  }

  async getModelEntitiesGroupBy<Entity> (
    queryRunner: QueryRunner,
    entity: new () => Entity,
    block: BlockHeight,
    where: Where = {},
    queryOptions: QueryOptions = {}
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
      const { canonicalBlockNumber, blockHashes } = await this._baseDatabase.getFrothyRegion(queryRunner, block.hash);

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

    selectQueryBuilder = this._baseDatabase.buildQuery(repo, selectQueryBuilder, where);

    if (queryOptions.orderBy) {
      selectQueryBuilder = this._baseDatabase.orderQuery(repo, selectQueryBuilder, queryOptions);
    }

    selectQueryBuilder = this._baseDatabase.orderQuery(repo, selectQueryBuilder, { ...queryOptions, orderBy: 'id' });

    if (queryOptions.skip) {
      selectQueryBuilder = selectQueryBuilder.offset(queryOptions.skip);
    }

    if (queryOptions.limit) {
      selectQueryBuilder = selectQueryBuilder.limit(queryOptions.limit);
    }

    const entities = await selectQueryBuilder.getMany();

    return entities;
  }

  async getModelEntitiesDistinctOn<Entity> (
    queryRunner: QueryRunner,
    entity: new () => Entity,
    block: BlockHeight,
    where: Where = {},
    queryOptions: QueryOptions = {}
  ): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entity);

    let subQuery = repo.createQueryBuilder('subTable')
      .distinctOn(['subTable.id'])
      .addFrom('block_progress', 'blockProgress')
      .where('subTable.block_hash = blockProgress.block_hash')
      .andWhere('blockProgress.is_pruned = :isPruned', { isPruned: false })
      .addOrderBy('subTable.id', 'ASC')
      .addOrderBy('subTable.block_number', 'DESC');

    if (block.hash) {
      const { canonicalBlockNumber, blockHashes } = await this._baseDatabase.getFrothyRegion(queryRunner, block.hash);

      subQuery = subQuery
        .andWhere(new Brackets(qb => {
          qb.where('subTable.block_hash IN (:...blockHashes)', { blockHashes })
            .orWhere('subTable.block_number <= :canonicalBlockNumber', { canonicalBlockNumber });
        }));
    }

    if (block.number) {
      subQuery = subQuery.andWhere('subTable.block_number <= :blockNumber', { blockNumber: block.number });
    }

    subQuery = this._baseDatabase.buildQuery(repo, subQuery, where);

    let selectQueryBuilder = queryRunner.manager.createQueryBuilder()
      .from(
        `(${subQuery.getQuery()})`,
        'latestEntities'
      )
      .setParameters(subQuery.getParameters());

    if (queryOptions.orderBy) {
      selectQueryBuilder = this._baseDatabase.orderQuery(repo, selectQueryBuilder, queryOptions, 'subTable_');
      if (queryOptions.orderBy !== 'id') {
        selectQueryBuilder = this._baseDatabase.orderQuery(repo, selectQueryBuilder, { ...queryOptions, orderBy: 'id' }, 'subTable_');
      }
    }

    if (queryOptions.skip) {
      selectQueryBuilder = selectQueryBuilder.offset(queryOptions.skip);
    }

    if (queryOptions.limit) {
      selectQueryBuilder = selectQueryBuilder.limit(queryOptions.limit);
    }

    let entities = await selectQueryBuilder.getRawMany();
    entities = await this._transformResults(queryRunner, repo.createQueryBuilder('subTable'), entities);

    return entities as Entity[];
  }

  async getModelEntitiesSingular<Entity> (
    queryRunner: QueryRunner,
    entity: new () => Entity,
    block: BlockHeight,
    where: Where = {}
  ): Promise<Entity[]> {
    const repo = queryRunner.manager.getRepository(entity);
    const { tableName } = repo.metadata;

    let selectQueryBuilder = repo.createQueryBuilder(tableName)
      .addFrom('block_progress', 'blockProgress')
      .where(`${tableName}.block_hash = blockProgress.block_hash`)
      .andWhere('blockProgress.is_pruned = :isPruned', { isPruned: false })
      .addOrderBy(`${tableName}.block_number`, 'DESC')
      .limit(1);

    if (block.hash) {
      const { canonicalBlockNumber, blockHashes } = await this._baseDatabase.getFrothyRegion(queryRunner, block.hash);

      selectQueryBuilder = selectQueryBuilder
        .andWhere(new Brackets(qb => {
          qb.where(`${tableName}.block_hash IN (:...blockHashes)`, { blockHashes })
            .orWhere(`${tableName}.block_number <= :canonicalBlockNumber`, { canonicalBlockNumber });
        }));
    }

    if (block.number) {
      selectQueryBuilder = selectQueryBuilder.andWhere(`${tableName}.block_number <= :blockNumber`, { blockNumber: block.number });
    }

    selectQueryBuilder = this._baseDatabase.buildQuery(repo, selectQueryBuilder, where);

    const entities = await selectQueryBuilder.getMany();

    return entities as Entity[];
  }

  async getModelEntity<Entity> (repo: Repository<Entity>, whereOptions: any): Promise<Entity | undefined> {
    eventProcessingLoadEntityCount.inc();

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
            eventProcessingLoadEntityCacheHitCount.inc();
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
            eventProcessingLoadEntityCacheHitCount.inc();
            return _.cloneDeep(entity) as Entity;
          }

          // Get latest pruned entity from DB if not found in cache.
          const endTimer = eventProcessingLoadEntityDBQueryDuration.startTimer();
          const dbEntity = await this._baseDatabase.getLatestPrunedEntity(repo, findOptions.where.id, canonicalBlockNumber);
          endTimer();

          if (dbEntity) {
            // Update latest pruned entity in cache.
            this.cacheUpdatedEntity(repo, dbEntity, true);
          }

          return dbEntity;
        }
      }

      const endTimer = eventProcessingLoadEntityDBQueryDuration.startTimer();
      const dbEntity = await this._baseDatabase.getPrevEntityVersion(repo.queryRunner!, repo, findOptions);
      endTimer();

      return dbEntity;
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

  async saveFactory (queryRunner: QueryRunner, factory: Factory, block: Block): Promise<Factory> {
    const repo = queryRunner.manager.getRepository(Factory);
    factory.blockNumber = block.number;
    factory.blockHash = block.hash;
    const data = await repo.save(factory);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async saveBundle (queryRunner: QueryRunner, bundle: Bundle, block: Block): Promise<Bundle> {
    const repo = queryRunner.manager.getRepository(Bundle);
    bundle.blockNumber = block.number;
    bundle.blockHash = block.hash;
    const data = await repo.save(bundle);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async savePool (queryRunner: QueryRunner, pool: Pool, block: Block): Promise<Pool> {
    const repo = queryRunner.manager.getRepository(Pool);
    pool.blockNumber = block.number;
    pool.blockHash = block.hash;
    const data = await repo.save(pool);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async savePoolDayData (queryRunner: QueryRunner, poolDayData: PoolDayData, block: Block): Promise<PoolDayData> {
    const repo = queryRunner.manager.getRepository(PoolDayData);
    poolDayData.blockNumber = block.number;
    poolDayData.blockHash = block.hash;
    const data = await repo.save(poolDayData);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async savePoolHourData (queryRunner: QueryRunner, poolHourData: PoolHourData, block: Block): Promise<PoolHourData> {
    const repo = queryRunner.manager.getRepository(PoolHourData);
    poolHourData.blockNumber = block.number;
    poolHourData.blockHash = block.hash;
    const data = await repo.save(poolHourData);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async saveToken (queryRunner: QueryRunner, token: Token, block: Block): Promise<Token> {
    const repo = queryRunner.manager.getRepository(Token);
    token.blockNumber = block.number;
    token.blockHash = block.hash;
    const data = await repo.save(token);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async saveTransaction (queryRunner: QueryRunner, transaction: Transaction, block: Block): Promise<Transaction> {
    const repo = queryRunner.manager.getRepository(Transaction);
    transaction.blockNumber = block.number;
    transaction.blockHash = block.hash;
    const data = await repo.save(transaction);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async saveUniswapDayData (queryRunner: QueryRunner, uniswapDayData: UniswapDayData, block: Block): Promise<UniswapDayData> {
    const repo = queryRunner.manager.getRepository(UniswapDayData);
    uniswapDayData.blockNumber = block.number;
    uniswapDayData.blockHash = block.hash;
    const data = await repo.save(uniswapDayData);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async saveTokenDayData (queryRunner: QueryRunner, tokenDayData: TokenDayData, block: Block): Promise<TokenDayData> {
    const repo = queryRunner.manager.getRepository(TokenDayData);
    tokenDayData.blockNumber = block.number;
    tokenDayData.blockHash = block.hash;
    const data = await repo.save(tokenDayData);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async saveTokenHourData (queryRunner: QueryRunner, tokenHourData: TokenHourData, block: Block): Promise<TokenHourData> {
    const repo = queryRunner.manager.getRepository(TokenHourData);
    tokenHourData.blockNumber = block.number;
    tokenHourData.blockHash = block.hash;
    const data = await repo.save(tokenHourData);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async saveTick (queryRunner: QueryRunner, tick: Tick, block: Block): Promise<Tick> {
    const repo = queryRunner.manager.getRepository(Tick);
    tick.blockNumber = block.number;
    tick.blockHash = block.hash;
    const data = await repo.save(tick);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async saveTickDayData (queryRunner: QueryRunner, tickDayData: TickDayData, block: Block): Promise<TickDayData> {
    const repo = queryRunner.manager.getRepository(TickDayData);
    tickDayData.blockNumber = block.number;
    tickDayData.blockHash = block.hash;
    const data = await repo.save(tickDayData);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async savePosition (queryRunner: QueryRunner, position: Position, block: Block): Promise<Position> {
    const repo = queryRunner.manager.getRepository(Position);
    position.blockNumber = block.number;
    position.blockHash = block.hash;
    const data = await repo.save(position);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async savePositionSnapshot (queryRunner: QueryRunner, positionSnapshot: PositionSnapshot, block: Block): Promise<PositionSnapshot> {
    const repo = queryRunner.manager.getRepository(PositionSnapshot);
    positionSnapshot.blockNumber = block.number;
    positionSnapshot.blockHash = block.hash;
    const data = await repo.save(positionSnapshot);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async saveMint (queryRunner: QueryRunner, mint: Mint, block: Block): Promise<Mint> {
    const repo = queryRunner.manager.getRepository(Mint);
    mint.blockNumber = block.number;
    mint.blockHash = block.hash;
    const data = await repo.save(mint);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async saveBurn (queryRunner: QueryRunner, burn: Burn, block: Block): Promise<Burn> {
    const repo = queryRunner.manager.getRepository(Burn);
    burn.blockNumber = block.number;
    burn.blockHash = block.hash;
    const data = await repo.save(burn);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async saveSwap (queryRunner: QueryRunner, swap: Swap, block: Block): Promise<Swap> {
    const repo = queryRunner.manager.getRepository(Swap);
    swap.blockNumber = block.number;
    swap.blockHash = block.hash;
    const data = await repo.save(swap);
    this.cacheUpdatedEntity(repo, data);

    return data;
  }

  async getContracts (): Promise<Contract[]> {
    const repo = this._conn.getRepository(Contract);

    return this._baseDatabase.getContracts(repo);
  }

  async saveContract (queryRunner: QueryRunner, address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<Contract> {
    const repo = queryRunner.manager.getRepository(Contract);

    return this._baseDatabase.saveContract(repo, address, kind, checkpoint, startingBlock);
  }

  async createTransactionRunner (): Promise<QueryRunner> {
    return this._baseDatabase.createTransactionRunner();
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getProcessedBlockCountForRange(repo, fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    const repo = this._conn.getRepository(Event);

    return this._baseDatabase.getEventsInRange(repo, fromBlockNumber, toBlockNumber);
  }

  async saveEventEntity (queryRunner: QueryRunner, entity: Event): Promise<Event> {
    const repo = queryRunner.manager.getRepository(Event);
    return this._baseDatabase.saveEventEntity(repo, entity);
  }

  async getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Event[]> {
    const repo = this._conn.getRepository(Event);

    return this._baseDatabase.getBlockEvents(repo, blockHash, where, queryOptions);
  }

  async saveBlockWithEvents (queryRunner: QueryRunner, block: DeepPartial<BlockProgress>, events: DeepPartial<Event>[]): Promise<BlockProgress> {
    const blockRepo = queryRunner.manager.getRepository(BlockProgress);
    const eventRepo = queryRunner.manager.getRepository(Event);

    return this._baseDatabase.saveBlockWithEvents(blockRepo, eventRepo, block, events);
  }

  async saveEvents (queryRunner: QueryRunner, events: Event[]): Promise<void> {
    const eventRepo = queryRunner.manager.getRepository(Event);

    return this._baseDatabase.saveEvents(eventRepo, events);
  }

  async updateSyncStatusIndexedBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusIndexedBlock(repo, blockHash, blockNumber, force);
  }

  async updateSyncStatusCanonicalBlock (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusCanonicalBlock(repo, blockHash, blockNumber, force);
  }

  async updateSyncStatusChainHead (queryRunner: QueryRunner, blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.updateSyncStatusChainHead(repo, blockHash, blockNumber, force);
  }

  async getSyncStatus (queryRunner: QueryRunner): Promise<SyncStatus | undefined> {
    const repo = queryRunner.manager.getRepository(SyncStatus);

    return this._baseDatabase.getSyncStatus(repo);
  }

  async getEvent (id: string): Promise<Event | undefined> {
    const repo = this._conn.getRepository(Event);

    return this._baseDatabase.getEvent(repo, id);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getBlocksAtHeight(repo, height, isPruned);
  }

  async markBlocksAsPruned (queryRunner: QueryRunner, blocks: BlockProgress[]): Promise<void> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.markBlocksAsPruned(repo, blocks);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    const repo = this._conn.getRepository(BlockProgress);
    return this._baseDatabase.getBlockProgress(repo, blockHash);
  }

  async getBlockProgressEntities (where: FindConditions<BlockProgress>, options: FindManyOptions<BlockProgress>): Promise<BlockProgress[]> {
    const repo = this._conn.getRepository(BlockProgress);

    return this._baseDatabase.getBlockProgressEntities(repo, where, options);
  }

  async saveBlockProgress (queryRunner: QueryRunner, block: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.saveBlockProgress(repo, block);
  }

  async updateBlockProgress (queryRunner: QueryRunner, block: BlockProgress, lastProcessedEventIndex: number): Promise<BlockProgress> {
    const repo = queryRunner.manager.getRepository(BlockProgress);

    return this._baseDatabase.updateBlockProgress(repo, block, lastProcessedEventIndex);
  }

  async getEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindConditions<Entity>): Promise<Entity[]> {
    return this._baseDatabase.getEntities(queryRunner, entity, findConditions);
  }

  async removeEntities<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions?: FindConditions<Entity>): Promise<void> {
    return this._baseDatabase.removeEntities(queryRunner, entity, findConditions);
  }

  async deleteEntitiesByConditions<Entity> (queryRunner: QueryRunner, entity: new () => Entity, findConditions: FindConditions<Entity>): Promise<void> {
    await this._baseDatabase.deleteEntitiesByConditions(queryRunner, entity, findConditions);
  }

  async isEntityEmpty<Entity> (entity: new () => Entity): Promise<boolean> {
    return this._baseDatabase.isEntityEmpty(entity);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseDatabase.getAncestorAtDepth(blockHash, depth);
  }

  cacheUpdatedEntity<Entity> (repo: Repository<Entity>, entity: any, pruned = false): void {
    const tableName = repo.metadata.tableName;
    if (pruned) {
      let entityIdMap = this._cachedEntities.latestPrunedEntities.get(tableName);
      if (!entityIdMap) {
        entityIdMap = new Map();
      }
      entityIdMap.set(entity.id, _.cloneDeep(entity));
      this._cachedEntities.latestPrunedEntities.set(tableName, entityIdMap);
      return;
    }
    const frothyBlock = this._cachedEntities.frothyBlocks.get(entity.blockHash);
    // Update frothyBlock only if already present in cache.
    // Might not be present when event processing starts without block processing on job retry.
    if (frothyBlock) {
      let entityIdMap = frothyBlock.entities.get(tableName);
      if (!entityIdMap) {
        entityIdMap = new Map();
      }
      entityIdMap.set(entity.id, _.cloneDeep(entity));
      frothyBlock.entities.set(tableName, entityIdMap);
    }
  }

  async _transformResults<Entity> (queryRunner: QueryRunner, qb: SelectQueryBuilder<Entity>, rawResults: any[]): Promise<any[]> {
    const transformer = new RawSqlResultsToEntityTransformer(
      qb.expressionMap,
      queryRunner.manager.connection.driver,
      [],
      [],
      queryRunner
    );
    assert(qb.expressionMap.mainAlias);
    return transformer.transform(rawResults, qb.expressionMap.mainAlias);
  }

  _populateRelationsMap (): void {
    // Needs to be generated by codegen.
    this._relationsMap.set(Pool, {
      token0: {
        entity: Token,
        type: 'one-to-one'
      },
      token1: {
        entity: Token,
        type: 'one-to-one'
      },
      poolHourData: {
        entity: PoolHourData,
        type: 'one-to-many',
        foreignKey: 'pool'
      },
      poolDayData: {
        entity: PoolDayData,
        type: 'one-to-many',
        foreignKey: 'pool'
      },
      mints: {
        entity: Mint,
        type: 'one-to-many',
        foreignKey: 'pool'
      },
      burns: {
        entity: Burn,
        type: 'one-to-many',
        foreignKey: 'pool'
      },
      swaps: {
        entity: Swap,
        type: 'one-to-many',
        foreignKey: 'pool'
      },
      collects: {
        entity: Collect,
        type: 'one-to-many',
        foreignKey: 'pool'
      },
      ticks: {
        entity: Tick,
        type: 'one-to-many',
        foreignKey: 'pool'
      }
    });

    this._relationsMap.set(Burn, {
      pool: {
        entity: Pool,
        type: 'one-to-one'
      },
      transaction: {
        entity: Transaction,
        type: 'one-to-one'
      },
      token0: {
        entity: Token,
        type: 'one-to-one'
      },
      token1: {
        entity: Token,
        type: 'one-to-one'
      }
    });

    this._relationsMap.set(Mint, {
      pool: {
        entity: Pool,
        type: 'one-to-one'
      },
      transaction: {
        entity: Transaction,
        type: 'one-to-one'
      },
      token0: {
        entity: Token,
        type: 'one-to-one'
      },
      token1: {
        entity: Token,
        type: 'one-to-one'
      }
    });

    this._relationsMap.set(Swap, {
      pool: {
        entity: Pool,
        type: 'one-to-one'
      },
      transaction: {
        entity: Transaction,
        type: 'one-to-one'
      },
      token0: {
        entity: Token,
        type: 'one-to-one'
      },
      token1: {
        entity: Token,
        type: 'one-to-one'
      }
    });

    this._relationsMap.set(Token, {
      whitelistPools: {
        entity: Pool,
        type: 'many-to-many'
      },
      tokenDayData: {
        entity: TokenDayData,
        type: 'one-to-many',
        foreignKey: 'token'
      }
    });

    this._relationsMap.set(Transaction, {
      mints: {
        entity: Mint,
        type: 'one-to-many',
        foreignKey: 'transaction'
      },
      burns: {
        entity: Burn,
        type: 'one-to-many',
        foreignKey: 'transaction'
      },
      swaps: {
        entity: Swap,
        type: 'one-to-many',
        foreignKey: 'transaction'
      },
      flashed: {
        entity: Flash,
        type: 'one-to-many',
        foreignKey: 'transaction'
      },
      collects: {
        entity: Collect,
        type: 'one-to-many',
        foreignKey: 'transaction'
      }
    });

    this._relationsMap.set(Position, {
      pool: {
        entity: Pool,
        type: 'one-to-one'
      },
      token0: {
        entity: Token,
        type: 'one-to-one'
      },
      token1: {
        entity: Token,
        type: 'one-to-one'
      },
      tickLower: {
        entity: Tick,
        type: 'one-to-one'
      },
      tickUpper: {
        entity: Tick,
        type: 'one-to-one'
      },
      transaction: {
        entity: Transaction,
        type: 'one-to-one'
      }
    });

    this._relationsMap.set(PoolDayData, {
      pool: {
        entity: Pool,
        type: 'one-to-one'
      }
    });

    this._relationsMap.set(PoolHourData, {
      pool: {
        entity: Pool,
        type: 'one-to-one'
      }
    });

    this._relationsMap.set(TokenDayData, {
      token: {
        entity: Token,
        type: 'one-to-one'
      }
    });

    this._relationsMap.set(TokenHourData, {
      token: {
        entity: Token,
        type: 'one-to-one'
      }
    });

    this._relationsMap.set(Collect, {
      transaction: {
        entity: Transaction,
        type: 'one-to-one'
      },
      pool: {
        entity: Pool,
        type: 'one-to-one'
      }
    });

    this._relationsMap.set(Flash, {
      transaction: {
        entity: Transaction,
        type: 'one-to-one'
      },
      pool: {
        entity: Pool,
        type: 'one-to-one'
      }
    });

    this._relationsMap.set(PositionSnapshot, {
      pool: {
        entity: Pool,
        type: 'one-to-one'
      },
      position: {
        entity: Position,
        type: 'one-to-one'
      },
      transaction: {
        entity: Transaction,
        type: 'one-to-one'
      }
    });

    this._relationsMap.set(TickDayData, {
      pool: {
        entity: Pool,
        type: 'one-to-one'
      },
      tick: {
        entity: Tick,
        type: 'one-to-one'
      }
    });

    this._relationsMap.set(TickHourData, {
      pool: {
        entity: Pool,
        type: 'one-to-one'
      },
      tick: {
        entity: Tick,
        type: 'one-to-one'
      }
    });
  }
}
