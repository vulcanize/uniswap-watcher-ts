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
  Repository
} from 'typeorm';
import path from 'path';
import { SelectionNode } from 'graphql';
import debug from 'debug';
import _ from 'lodash';

import {
  StateKind,
  Database as BaseDatabase,
  DatabaseInterface,
  BlockHeight,
  QueryOptions,
  Where
} from '@cerc-io/util';
import { Database as GraphDatabase, ENTITY_QUERY_TYPE } from '@cerc-io/graph-node';

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
const ENTITY_QUERY_TYPE_MAP = new Map<new() => any, ENTITY_QUERY_TYPE>([
  [Bundle, ENTITY_QUERY_TYPE.SINGULAR],
  [Factory, ENTITY_QUERY_TYPE.SINGULAR],
  [Pool, ENTITY_QUERY_TYPE.GROUP_BY],
  [Token, ENTITY_QUERY_TYPE.GROUP_BY],
  [Burn, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [Mint, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [Swap, ENTITY_QUERY_TYPE.DISTINCT_ON],
  [Transaction, ENTITY_QUERY_TYPE.UNIQUE],
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
  _graphDatabase: GraphDatabase
  _relationsMap: Map<any, { [key: string]: any }>

  constructor (config: ConnectionOptions) {
    assert(config);
    const entitiesDir = path.join(__dirname, 'entity/*');

    this._config = {
      ...config,
      entities: [entitiesDir]
    };

    this._baseDatabase = new BaseDatabase(this._config);
    this._graphDatabase = new GraphDatabase(this._config, entitiesDir, ENTITY_QUERY_TYPE_MAP);
    this._relationsMap = new Map();
    this._populateRelationsMap();
  }

  get relationsMap (): Map<any, { [key: string]: any; }> {
    return this._relationsMap;
  }

  get graphDatabase (): GraphDatabase {
    return this._graphDatabase;
  }

  async init (): Promise<void> {
    this._conn = await this._baseDatabase.init();
    await this._graphDatabase.init();
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
    return this._graphDatabase.getEntities(queryRunner, entity, this._relationsMap, block, where, queryOptions, selections);
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

  async getModelEntity<Entity> (repo: Repository<Entity>, whereOptions: any): Promise<Entity | undefined> {
    return this._graphDatabase.getModelEntity(repo, whereOptions);
  }

  async loadRelations<Entity> (
    queryRunner: QueryRunner,
    block: BlockHeight,
    relationsMap: Map<any, { [key: string]: any }>,
    entity: new () => Entity,
    entities: Entity[],
    selections: ReadonlyArray<SelectionNode> = []
  ): Promise<Entity[]> {
    return this._graphDatabase.loadEntitiesRelations(queryRunner, block, relationsMap, entity, entities, selections);
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

  cacheUpdatedEntity<Entity> (repo: Repository<Entity>, entity: any): void {
    this._graphDatabase.cacheUpdatedEntity(repo, entity);
  }

  updateEntityCacheFrothyBlocks (blockProgress: BlockProgress, clearEntitiesCacheInterval?: number): void {
    this._graphDatabase.updateEntityCacheFrothyBlocks(blockProgress, clearEntitiesCacheInterval);
  }

  clearCachedEntities () {
    this._graphDatabase.cachedEntities.frothyBlocks.clear();
    this._graphDatabase.cachedEntities.latestPrunedEntities.clear();
  }

  pruneEntityCacheFrothyBlocks (canonicalBlockHash: string, canonicalBlockNumber: number) {
    this._graphDatabase.pruneEntityCacheFrothyBlocks(canonicalBlockHash, canonicalBlockNumber);
  }

  _populateRelationsMap (): void {
    // Needs to be generated by codegen.
    this._relationsMap.set(Pool, {
      token0: {
        entity: Token,
        isArray: false,
        isDerived: false
      },
      token1: {
        entity: Token,
        isArray: false,
        isDerived: false
      },
      poolHourData: {
        entity: PoolHourData,
        isArray: true,
        isDerived: true,
        field: 'pool'
      },
      poolDayData: {
        entity: PoolDayData,
        isArray: true,
        isDerived: true,
        field: 'pool'
      },
      mints: {
        entity: Mint,
        isArray: true,
        isDerived: true,
        field: 'pool'
      },
      burns: {
        entity: Burn,
        isArray: true,
        isDerived: true,
        field: 'pool'
      },
      swaps: {
        entity: Swap,
        isArray: true,
        isDerived: true,
        field: 'pool'
      },
      collects: {
        entity: Collect,
        isArray: true,
        isDerived: true,
        field: 'pool'
      },
      ticks: {
        entity: Tick,
        isArray: true,
        isDerived: true,
        field: 'pool'
      }
    });

    this._relationsMap.set(Burn, {
      pool: {
        entity: Pool,
        isArray: false,
        isDerived: false
      },
      transaction: {
        entity: Transaction,
        isArray: false,
        isDerived: false
      },
      token0: {
        entity: Token,
        isArray: false,
        isDerived: false
      },
      token1: {
        entity: Token,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(Mint, {
      pool: {
        entity: Pool,
        isArray: false,
        isDerived: false
      },
      transaction: {
        entity: Transaction,
        isArray: false,
        isDerived: false
      },
      token0: {
        entity: Token,
        isArray: false,
        isDerived: false
      },
      token1: {
        entity: Token,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(Swap, {
      pool: {
        entity: Pool,
        isArray: false,
        isDerived: false
      },
      transaction: {
        entity: Transaction,
        isArray: false,
        isDerived: false
      },
      token0: {
        entity: Token,
        isArray: false,
        isDerived: false
      },
      token1: {
        entity: Token,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(Token, {
      whitelistPools: {
        entity: Pool,
        isArray: true,
        isDerived: false
      },
      tokenDayData: {
        entity: TokenDayData,
        isArray: true,
        isDerived: true,
        field: 'token'
      }
    });

    this._relationsMap.set(Transaction, {
      mints: {
        entity: Mint,
        isArray: true,
        isDerived: true,
        field: 'transaction'
      },
      burns: {
        entity: Burn,
        isArray: true,
        isDerived: true,
        field: 'transaction'
      },
      swaps: {
        entity: Swap,
        isArray: true,
        isDerived: true,
        field: 'transaction'
      },
      flashed: {
        entity: Flash,
        isArray: true,
        isDerived: true,
        field: 'transaction'
      },
      collects: {
        entity: Collect,
        isArray: true,
        isDerived: true,
        field: 'transaction'
      }
    });

    this._relationsMap.set(Position, {
      pool: {
        entity: Pool,
        isArray: false,
        isDerived: false
      },
      token0: {
        entity: Token,
        isArray: false,
        isDerived: false
      },
      token1: {
        entity: Token,
        isArray: false,
        isDerived: false
      },
      tickLower: {
        entity: Tick,
        isArray: false,
        isDerived: false
      },
      tickUpper: {
        entity: Tick,
        isArray: false,
        isDerived: false
      },
      transaction: {
        entity: Transaction,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(PoolDayData, {
      pool: {
        entity: Pool,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(PoolHourData, {
      pool: {
        entity: Pool,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(TokenDayData, {
      token: {
        entity: Token,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(TokenHourData, {
      token: {
        entity: Token,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(Collect, {
      transaction: {
        entity: Transaction,
        isArray: false,
        isDerived: false
      },
      pool: {
        entity: Pool,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(Flash, {
      transaction: {
        entity: Transaction,
        isArray: false,
        isDerived: false
      },
      pool: {
        entity: Pool,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(PositionSnapshot, {
      pool: {
        entity: Pool,
        isArray: false,
        isDerived: false
      },
      position: {
        entity: Position,
        isArray: false,
        isDerived: false
      },
      transaction: {
        entity: Transaction,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(Tick, {
      pool: {
        entity: Pool,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(TickDayData, {
      pool: {
        entity: Pool,
        isArray: false,
        isDerived: false
      },
      tick: {
        entity: Tick,
        isArray: false,
        isDerived: false
      }
    });

    this._relationsMap.set(TickHourData, {
      pool: {
        entity: Pool,
        isArray: false,
        isDerived: false
      },
      tick: {
        entity: Tick,
        isArray: false,
        isDerived: false
      }
    });
  }
}
