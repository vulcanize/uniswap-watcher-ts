//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { DeepPartial, FindConditions, FindManyOptions, FindOneOptions, LessThan, MoreThan, QueryRunner } from 'typeorm';
import JSONbig from 'json-bigint';
import { providers, utils, BigNumber } from 'ethers';
import { SelectionNode } from 'graphql';
import _ from 'lodash';

import { Client as UniClient } from '@vulcanize/uni-watcher';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { GraphDecimal, JobQueue } from '@vulcanize/util';
import {
  ServerConfig,
  StateStatus,
  ValueResult,
  Indexer as BaseIndexer,
  IndexerInterface,
  QueryOptions,
  OrderDirection,
  BlockHeight,
  Where,
  eventProcessingEthCallDuration,
  getFullTransaction,
  getFullBlock,
  StateKind,
  cachePrunedEntitiesCount
} from '@cerc-io/util';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { StorageLayout, MappingKey } from '@cerc-io/solidity-mapper';

import { findEthPerToken, getEthPriceInUSD, getTrackedAmountUSD, sqrtPriceX96ToTokenPrices, WHITELIST_TOKENS } from './utils/pricing';
import { updatePoolDayData, updatePoolHourData, updateTickDayData, updateTokenDayData, updateTokenHourData, updateUniswapDayData } from './utils/interval-updates';
import { convertTokenToDecimal, loadFactory, loadTransaction, safeDiv, Block } from './utils';
import { createTick, feeTierToTickSpacing } from './utils/tick';
import { ADDRESS_ZERO, FACTORY_ADDRESS, FIRST_GRAFT_BLOCK, WATCHED_CONTRACTS } from './utils/constants';
import { Database, DEFAULT_LIMIT } from './database';
import { Event } from './entity/Event';
import { ResultEvent, Transaction, PoolCreatedEvent, InitializeEvent, MintEvent, BurnEvent, SwapEvent, IncreaseLiquidityEvent, DecreaseLiquidityEvent, CollectEvent, TransferEvent, FlashEvent } from './events';
import { Factory } from './entity/Factory';
import { Token } from './entity/Token';
import { Bundle } from './entity/Bundle';
import { Pool } from './entity/Pool';
import { Mint } from './entity/Mint';
import { Burn } from './entity/Burn';
import { Swap } from './entity/Swap';
import { Position } from './entity/Position';
import { PositionSnapshot } from './entity/PositionSnapshot';
import { Tick } from './entity/Tick';
import { PoolDayData } from './entity/PoolDayData';
import { PoolHourData } from './entity/PoolHourData';
import { UniswapDayData } from './entity/UniswapDayData';
import { TokenDayData } from './entity/TokenDayData';
import { TokenHourData } from './entity/TokenHourData';
import { TickDayData } from './entity/TickDayData';
import { Collect } from './entity/Collect';
import { Flash } from './entity/Flash';
import { TickHourData } from './entity/TickHourData';
import { Transaction as TransactionEntity } from './entity/Transaction';
import { SyncStatus } from './entity/SyncStatus';
import { BlockProgress } from './entity/BlockProgress';
import { Contract, KIND_POOL } from './entity/Contract';
import { State } from './entity/State';
import { StateSyncStatus } from './entity/StateSyncStatus';
import { createInitialState, createStateCheckpoint } from './hooks';

const SYNC_DELTA = 5;

const log = debug('vulcanize:indexer');

export { OrderDirection, BlockHeight };

export class Indexer implements IndexerInterface {
  _db: Database
  _uniClient: UniClient
  _erc20Client: ERC20Client
  _ethClient: EthClient
  _ethProvider: providers.BaseProvider
  _baseIndexer: BaseIndexer
  _serverConfig: ServerConfig
  _isDemo: boolean
  _storageLayoutMap: Map<string, StorageLayout> = new Map()
  _subgraphStateMap: Map<string, any> = new Map()
  _fullBlock?: Block

  constructor (serverConfig: ServerConfig, db: Database, uniClient: UniClient, erc20Client: ERC20Client, ethClient: EthClient, ethProvider: providers.BaseProvider, jobQueue: JobQueue) {
    assert(db);
    assert(uniClient);
    assert(erc20Client);

    this._db = db;
    this._uniClient = uniClient;
    this._erc20Client = erc20Client;
    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    this._serverConfig = serverConfig;
    this._baseIndexer = new BaseIndexer(this._serverConfig, this._db, this._ethClient, this._ethProvider, jobQueue);
    this._isDemo = this._serverConfig.mode === 'demo';
  }

  get serverConfig (): ServerConfig {
    return this._serverConfig;
  }

  get storageLayoutMap (): Map<string, StorageLayout> {
    return this._storageLayoutMap;
  }

  async init (): Promise<void> {
    await this._baseIndexer.fetchContracts();
    await this._baseIndexer.fetchStateStatus();
  }

  getResultEvent (event: Event): ResultEvent {
    const block = event.block;
    const eventFields = JSON.parse(event.eventInfo);
    const { tx, eventIndex } = JSON.parse(event.extraInfo);

    return {
      block: {
        hash: block.blockHash,
        number: block.blockNumber,
        timestamp: block.blockTimestamp,
        parentHash: block.parentHash
      },

      tx,
      contract: event.contract,
      eventIndex,

      event: {
        __typename: event.eventName,
        ...eventFields
      },

      proof: JSON.parse(event.proof)
    };
  }

  async getStorageValue (storageLayout: StorageLayout, blockHash: string, contractAddress: string, variable: string, ...mappingKeys: MappingKey[]): Promise<ValueResult> {
    return this._baseIndexer.getStorageValue(
      storageLayout,
      blockHash,
      contractAddress,
      variable,
      ...mappingKeys
    );
  }

  async processInitialState (contractAddress: string, blockHash: string): Promise<any> {
    // Call initial state hook.
    return createInitialState(this, contractAddress, blockHash);
  }

  async processStateCheckpoint (contractAddress: string, blockHash: string): Promise<boolean> {
    // Call checkpoint hook.
    return createStateCheckpoint(this, contractAddress, blockHash);
  }

  async processCanonicalBlock (blockHash: string, blockNumber: number): Promise<void> {
    // TODO Implement
  }

  async processCheckpoint (blockHash: string): Promise<void> {
    // Return if checkpointInterval is <= 0.
    const checkpointInterval = this._serverConfig.checkpointInterval;
    if (checkpointInterval <= 0) return;

    console.time('time:indexer#processCheckpoint-checkpoint');

    await this._baseIndexer.processCheckpoint(this, blockHash, checkpointInterval);

    console.timeEnd('time:indexer#processCheckpoint-checkpoint');
  }

  async processCLICheckpoint (contractAddress: string, blockHash?: string): Promise<string | undefined> {
    return this._baseIndexer.processCLICheckpoint(this, contractAddress, blockHash);
  }

  async getPrevState (blockHash: string, contractAddress: string, kind?: string): Promise<State | undefined> {
    return this._db.getPrevState(blockHash, contractAddress, kind);
  }

  async getLatestState (contractAddress: string, kind: StateKind | null, blockNumber?: number): Promise<State | undefined> {
    return this._db.getLatestState(contractAddress, kind, blockNumber);
  }

  async getStatesByHash (blockHash: string): Promise<State[]> {
    return this._baseIndexer.getStatesByHash(blockHash);
  }

  async getStateByCID (cid: string): Promise<State | undefined> {
    return this._baseIndexer.getStateByCID(cid);
  }

  async getStates (where: FindConditions<State>): Promise<State[]> {
    return this._db.getStates(where);
  }

  getStateData (state: State): any {
    return this._baseIndexer.getStateData(state);
  }

  // Method used to create auto diffs (diff_staged).
  async createDiffStaged (contractAddress: string, blockHash: string, data: any): Promise<void> {
    console.time('time:indexer#createDiffStaged-auto_diff');

    await this._baseIndexer.createDiffStaged(contractAddress, blockHash, data);

    console.timeEnd('time:indexer#createDiffStaged-auto_diff');
  }

  // Method to be used by createStateDiff hook.
  async createDiff (contractAddress: string, blockHash: string, data: any): Promise<void> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    await this._baseIndexer.createDiff(contractAddress, block, data);
  }

  // Method to be used by export-state CLI.
  async createCheckpoint (contractAddress: string, blockHash: string): Promise<string | undefined> {
    const block = await this.getBlockProgress(blockHash);
    assert(block);

    return this._baseIndexer.createCheckpoint(this, contractAddress, block);
  }

  // Method to be used by fill-state CLI.
  async createInit (blockHash: string, blockNumber: number): Promise<void> {
    // Create initial state for contracts.
    await this._baseIndexer.createInit(this, blockHash, blockNumber);
  }

  async saveOrUpdateState (state: State): Promise<State> {
    return this._baseIndexer.saveOrUpdateState(state);
  }

  async removeStates (blockNumber: number, kind: StateKind): Promise<void> {
    await this._baseIndexer.removeStates(blockNumber, kind);
  }

  async processEvent (dbEvent: Event): Promise<void> {
    try {
      const resultEvent = this.getResultEvent(dbEvent);

      await this._triggerEventHandler(resultEvent);
    } catch (error) {
      this._db.clearCachedEntities();
      throw error;
    }
  }

  async processBlock (blockProgress: BlockProgress): Promise<void> {
    this._db.updateEntityCacheFrothyBlocks(blockProgress, this._serverConfig.clearEntitiesCacheInterval);
  }

  async getStateSyncStatus (): Promise<StateSyncStatus | undefined> {
    return this._db.getStateSyncStatus();
  }

  async updateStateSyncStatusIndexedBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateStateSyncStatusIndexedBlock(dbTx, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async updateStateSyncStatusCheckpointBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.updateStateSyncStatusCheckpointBlock(dbTx, blockNumber, force);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getLatestCanonicalBlock (): Promise<BlockProgress> {
    const syncStatus = await this.getSyncStatus();
    assert(syncStatus);

    const latestCanonicalBlock = await this.getBlockProgress(syncStatus.latestCanonicalBlockHash);
    assert(latestCanonicalBlock);

    return latestCanonicalBlock;
  }

  async getLatestStateIndexedBlock (): Promise<BlockProgress> {
    return this._baseIndexer.getLatestStateIndexedBlock();
  }

  async getBlockEntities (where: { [key: string]: any } = {}, queryOptions: QueryOptions): Promise<any> {
    if (where.timestamp_gt) {
      where.blockTimestamp = MoreThan(where.timestamp_gt);
      delete where.timestamp_gt;
    }

    if (where.timestamp_lt) {
      where.blockTimestamp = LessThan(where.timestamp_lt);
      delete where.timestamp_lt;
    }

    const order: FindOneOptions['order'] = {};

    if (queryOptions.orderBy === 'timestamp') {
      order.blockTimestamp = queryOptions.orderDirection === 'desc' ? 'DESC' : 'ASC';
    }

    const blocks = await this.getBlockProgressEntities(
      where,
      {
        order,
        take: queryOptions.limit ?? DEFAULT_LIMIT
      }
    );

    return blocks.map(block => ({
      timestamp: block.blockTimestamp,
      number: block.blockNumber,
      hash: block.blockHash
    }));
  }

  async getIndexingStatus (): Promise<any> {
    const syncStatus = await this.getSyncStatus();
    assert(syncStatus);
    const synced = (syncStatus.chainHeadBlockNumber - syncStatus.latestIndexedBlockNumber) <= SYNC_DELTA;

    return {
      synced,
      health: 'healthy',
      chains: [
        {
          chainHeadBlock: {
            number: syncStatus.chainHeadBlockNumber,
            hash: syncStatus.chainHeadBlockHash
          },
          latestBlock: {
            number: syncStatus.latestIndexedBlockNumber,
            hash: syncStatus.latestIndexedBlockHash
          }
        }
      ]
    };
  }

  async getBundle (id: string, block: BlockHeight): Promise<Bundle | undefined> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.getBundle(dbTx, { id, blockHash: block.hash, blockNumber: block.number });
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getPool (id: string, block: BlockHeight, selections: ReadonlyArray<SelectionNode> = []): Promise<Pool | undefined> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.getPool(dbTx, { id, blockHash: block.hash, blockNumber: block.number }, true, selections);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getToken (id: string, block: BlockHeight, selections: ReadonlyArray<SelectionNode> = []): Promise<Token | undefined> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      res = await this._db.getToken(dbTx, { id, blockHash: block.hash, blockNumber: block.number }, true, selections);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getEntities<Entity> (entity: new () => Entity, block: BlockHeight, where: { [key: string]: any } = {}, queryOptions: QueryOptions, selections: ReadonlyArray<SelectionNode> = []): Promise<Entity[]> {
    const dbTx = await this._db.createTransactionRunner();
    let res;

    try {
      where = Object.entries(where).reduce((acc: { [key: string]: any }, [fieldWithSuffix, value]) => {
        const [field, ...suffix] = fieldWithSuffix.split('_');

        if (!acc[field]) {
          acc[field] = [];
        }

        const filter = {
          value,
          not: false,
          operator: 'equals'
        };

        let operator = suffix.shift();

        if (operator === 'not') {
          filter.not = true;
          operator = suffix.shift();
        }

        if (operator) {
          filter.operator = operator;
        }

        acc[field].push(filter);

        return acc;
      }, {});

      if (!queryOptions.limit) {
        queryOptions.limit = DEFAULT_LIMIT;
      }

      res = await this._db.getModelEntities(dbTx, entity, block, where, queryOptions, selections);
      dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    return res;
  }

  async getEntitiesForBlock (blockHash: string, tableName: string): Promise<any[]> {
    return this._db.getEntitiesForBlock(blockHash, tableName);
  }

  async addContracts (): Promise<void> {
    // Watching the contract(s) if not watched already.
    for (const contract of WATCHED_CONTRACTS) {
      const { address, startingBlock, kind } = contract;
      const watchedContract = this.isWatchedContract(address);

      if (!watchedContract) {
        await this.watchContract(address, kind, true, startingBlock);
      }
    }
  }

  isWatchedContract (address: string): Contract | undefined {
    return this._baseIndexer.isWatchedContract(address);
  }

  async watchContract (address: string, kind: string, checkpoint: boolean, startingBlock: number): Promise<void> {
    return this._baseIndexer.watchContract(address, kind, checkpoint, startingBlock);
  }

  updateStateStatusMap (address: string, stateStatus: StateStatus): void {
    this._baseIndexer.updateStateStatusMap(address, stateStatus);
  }

  cacheContract (contract: Contract): void {
    return this._baseIndexer.cacheContract(contract);
  }

  async saveEventEntity (dbEvent: Event): Promise<Event> {
    return this._baseIndexer.saveEventEntity(dbEvent);
  }

  async saveEvents (dbEvents: Event[]): Promise<void> {
    return this._baseIndexer.saveEvents(dbEvents);
  }

  async markBlocksAsPruned (blocks: BlockProgress[]): Promise<void> {
    return this._baseIndexer.markBlocksAsPruned(blocks);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseIndexer.getAncestorAtDepth(blockHash, depth);
  }

  async saveBlockAndFetchEvents (block: DeepPartial<BlockProgress>): Promise<[BlockProgress, DeepPartial<Event>[]]> {
    return this._baseIndexer.saveBlockAndFetchEvents(block, this._saveBlockAndFetchEvents.bind(this));
  }

  async saveBlockProgress (block: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    return this._baseIndexer.saveBlockProgress(block);
  }

  async getBlockEvents (blockHash: string, where: Where, queryOptions: QueryOptions): Promise<Array<Event>> {
    return this._baseIndexer.getBlockEvents(blockHash, where, queryOptions);
  }

  async removeUnknownEvents (block: BlockProgress): Promise<void> {
    return this._baseIndexer.removeUnknownEvents(Event, block);
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusIndexedBlock(blockHash, blockNumber, force);
  }

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    return this._baseIndexer.updateSyncStatusChainHead(blockHash, blockNumber, force);
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number, force = false): Promise<SyncStatus> {
    const syncStatus = await this._baseIndexer.updateSyncStatusCanonicalBlock(blockHash, blockNumber, force);
    this._db.pruneEntityCacheFrothyBlocks(syncStatus.latestCanonicalBlockHash, syncStatus.latestCanonicalBlockNumber);

    return syncStatus;
  }

  async getSyncStatus (): Promise<SyncStatus | undefined> {
    return this._baseIndexer.getSyncStatus();
  }

  async getBlocks (blockFilter: { blockHash?: string, blockNumber?: number }): Promise<any> {
    return this._baseIndexer.getBlocks(blockFilter);
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._baseIndexer.getEvent(id);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    return this._baseIndexer.getBlockProgress(blockHash);
  }

  async getBlockProgressEntities (where: FindConditions<BlockProgress>, options: FindManyOptions<BlockProgress>): Promise<BlockProgress[]> {
    return this._baseIndexer.getBlockProgressEntities(where, options);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    return this._baseIndexer.getBlocksAtHeight(height, isPruned);
  }

  async updateBlockProgress (block: BlockProgress, lastProcessedEventIndex: number): Promise<BlockProgress> {
    return this._baseIndexer.updateBlockProgress(block, lastProcessedEventIndex);
  }

  async dumpEntityState (blockHash: string, isStateFinalized = false): Promise<void> {
    // Create a diff for each contract in the subgraph state map.
    const createDiffPromises = Array.from(this._subgraphStateMap.entries())
      .map(([contractAddress, data]): Promise<void> => {
        if (isStateFinalized) {
          return this.createDiff(contractAddress, blockHash, data);
        }

        return this.createDiffStaged(contractAddress, blockHash, data);
      });

    await Promise.all(createDiffPromises);

    // Reset the subgraph state map.
    this._subgraphStateMap.clear();
  }

  updateEntityState (contractAddress: string, data: any): void {
    // Update the subgraph state for a given contract.
    const oldData = this._subgraphStateMap.get(contractAddress);
    const updatedData = _.merge(oldData, data);
    this._subgraphStateMap.set(contractAddress, updatedData);
  }

  async resetWatcherToBlock (blockNumber: number): Promise<void> {
    const entities = [Factory, Token, Bundle, Pool, Mint, Burn, Swap, Position, PositionSnapshot, Tick, PoolDayData, PoolHourData, UniswapDayData, TokenDayData, TokenHourData, TickDayData, Collect, Flash, TickHourData, TransactionEntity];
    await this._baseIndexer.resetWatcherToBlock(blockNumber, entities);
  }

  async _saveBlockAndFetchEvents ({
    id,
    cid: blockCid,
    blockHash,
    blockNumber,
    blockTimestamp,
    parentHash
  }: DeepPartial<BlockProgress>): Promise<[BlockProgress, DeepPartial<Event>[]]> {
    assert(blockHash);

    const events = await this._uniClient.getEvents(blockHash);

    const dbEvents: Array<DeepPartial<Event>> = [];
    const transactionsMap = new Map();

    const txHashSet = new Set();
    events.forEach((event: any) => {
      txHashSet.add(event.tx.hash);
    });

    await Promise.all(
      Array.from(txHashSet).map(async (txHash: any) => {
        const transaction = await getFullTransaction(this._ethClient, txHash);
        transactionsMap.set(txHash, transaction);
      })
    );

    for (let i = 0; i < events.length; i++) {
      const {
        tx,
        contract,
        eventIndex,
        event,
        proof
      } = events[i];

      // Get full transaction for extra params like gasUsed and gasPrice.
      const transaction = transactionsMap.get(tx.hash);

      const { __typename: eventName, ...eventInfo } = event;

      const extraInfo = {
        tx: transaction,
        eventIndex
      };

      dbEvents.push({
        index: i,
        txHash: tx.hash,
        contract,
        eventName,
        eventInfo: JSONbig.stringify(eventInfo),
        extraInfo: JSONbig.stringify(extraInfo),
        proof: JSONbig.stringify(proof)
      });
    }

    const block = {
      id,
      cid: blockCid,
      blockHash,
      blockNumber,
      blockTimestamp,
      parentHash,
      numEvents: dbEvents.length,
      isComplete: dbEvents.length === 0
    };

    console.time(`time:indexer#_saveBlockAndFetchEvents-db-save-${blockNumber}`);
    const blockProgress = await this.saveBlockProgress(block);
    console.timeEnd(`time:indexer#_saveBlockAndFetchEvents-db-save-${blockNumber}`);

    return [blockProgress, dbEvents];
  }

  async _triggerEventHandler (resultEvent: ResultEvent): Promise<void> {
    console.time('time:indexer#processEvent-mapping_code');

    // TODO: Process proof (proof.data) in event.
    const { contract, tx, block, event, eventIndex } = resultEvent;
    const { __typename: eventName } = event;

    if (!this._fullBlock || (this._fullBlock.hash !== block.hash)) {
      const { blockHash, blockNumber, timestamp, ...blockData } = await getFullBlock(this._ethClient, this._ethProvider, block.hash);

      this._fullBlock = {
        hash: blockHash,
        number: blockNumber,
        timestamp: Number(timestamp),
        ...blockData
      };

      assert(this._fullBlock);
    }

    switch (eventName) {
      case 'PoolCreatedEvent':
        log('Factory PoolCreated event', contract);
        await this._handlePoolCreated(this._fullBlock, contract, tx, event as PoolCreatedEvent);
        break;

      case 'InitializeEvent':
        log('Pool Initialize event', contract);
        await this._handleInitialize(this._fullBlock, contract, tx, event as InitializeEvent);
        break;

      case 'MintEvent':
        log('Pool Mint event', contract);
        await this._handleMint(this._fullBlock, contract, tx, event as MintEvent, eventIndex);
        break;

      case 'BurnEvent':
        log('Pool Burn event', contract);
        await this._handleBurn(this._fullBlock, contract, tx, event as BurnEvent, eventIndex);
        break;

      case 'SwapEvent':
        log('Pool Swap event', contract);
        await this._handleSwap(this._fullBlock, contract, tx, event as SwapEvent, eventIndex);
        break;

      case 'FlashEvent':
        log('Pool Flash event', contract);
        await this._handleFlash(this._fullBlock, contract, tx, event as FlashEvent);
        break;

      case 'IncreaseLiquidityEvent':
        log('NFPM IncreaseLiquidity event', contract);
        await this._handleIncreaseLiquidity(this._fullBlock, contract, tx, event as IncreaseLiquidityEvent);
        break;

      case 'DecreaseLiquidityEvent':
        log('NFPM DecreaseLiquidity event', contract);
        await this._handleDecreaseLiquidity(this._fullBlock, contract, tx, event as DecreaseLiquidityEvent);
        break;

      case 'CollectEvent':
        log('NFPM Collect event', contract);
        await this._handleCollect(this._fullBlock, contract, tx, event as CollectEvent);
        break;

      case 'TransferEvent':
        log('NFPM Transfer event', contract);
        await this._handleTransfer(this._fullBlock, contract, tx, event as TransferEvent);
        break;

      default:
        log('Event not handled', eventName);
        break;
    }

    log('Event processing completed for', eventName);
    console.timeEnd('time:indexer#processEvent-mapping_code');
  }

  async _handlePoolCreated (block: Block, contractAddress: string, tx: Transaction, poolCreatedEvent: PoolCreatedEvent): Promise<void> {
    let { token0: token0Address, token1: token1Address, fee, pool: poolAddress } = poolCreatedEvent;
    // Get the addresses in lowercase.
    token0Address = utils.hexlify(token0Address);
    token1Address = utils.hexlify(token1Address);
    poolAddress = utils.hexlify(poolAddress);

    // Temp fix from Subgraph mapping code.
    if (utils.getAddress(poolAddress) === utils.getAddress('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248')) {
      return;
    }

    // Get Tokens.
    let [token0, token1] = await Promise.all([
      this._db.getTokenNoTx({ blockHash: block.hash, id: token0Address }),
      this._db.getTokenNoTx({ blockHash: block.hash, id: token1Address })
    ]);

    // Fetch info if null.
    if (!token0) {
      token0 = await this._initToken(block, token0Address);
    }

    if (!token1) {
      token1 = await this._initToken(block, token1Address);
    }

    // Bail if we couldn't figure out the decimals.
    if (token0.decimals === null || token1.decimals === null) {
      log('mybug the decimal on token was null');
      return;
    }

    // Save entities to DB.
    const dbTx = await this._db.createTransactionRunner();

    try {
      // Load factory.
      let factory = await this._db.getFactory(dbTx, { blockHash: block.hash, id: contractAddress });

      if (!factory) {
        factory = new Factory();
        factory.id = contractAddress;
        factory = await this._db.saveFactory(dbTx, factory, block);

        // Create new bundle for tracking eth price.
        const bundle = new Bundle();
        bundle.id = '1';
        await this._db.saveBundle(dbTx, bundle, block);
      }

      // Update Factory.
      factory.poolCount = BigInt(factory.poolCount) + BigInt(1);

      let pool = new Pool();
      pool.id = poolAddress;

      token0 = await this._db.saveToken(dbTx, token0, block);
      token1 = await this._db.saveToken(dbTx, token1, block);
      token0 = await this._db.getToken(dbTx, token0);
      token1 = await this._db.getToken(dbTx, token1);
      assert(token0);
      assert(token1);

      pool.token0 = token0.id;
      pool.token1 = token1.id;
      pool.feeTier = BigInt(fee);
      pool.createdAtTimestamp = BigInt(block.timestamp);
      pool.createdAtBlockNumber = BigInt(block.number);
      pool = await this._db.savePool(dbTx, pool, block);

      if (block.number >= 13450924) {
        // Temp workaround to fix mismatch of Factory totalVolumeUSD and totalFeesUSD values with hosted subgraph endpoint
        if (!WHITELIST_TOKENS.includes('0x4dd28568d05f09b02220b09c2cb307bfd837cb95')) {
          WHITELIST_TOKENS.push('0x4dd28568d05f09b02220b09c2cb307bfd837cb95');
        }
      }

      // Update white listed pools.
      if (WHITELIST_TOKENS.includes(token0.id) || this._isDemo) {
        token1.whitelistPools.push(pool.id);
      }

      if (WHITELIST_TOKENS.includes(token1.id) || this._isDemo) {
        token0.whitelistPools.push(pool.id);
      }

      token0 = await this._db.saveToken(dbTx, token0, block);
      token1 = await this._db.saveToken(dbTx, token1, block);
      pool.token0 = token0.id;
      pool.token1 = token1.id;
      await this._db.savePool(dbTx, pool, block);
      await this._db.saveFactory(dbTx, factory, block);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }

    await this.watchContract(poolCreatedEvent.pool, KIND_POOL, true, block.number);
  }

  /**
   * Create new Token.
   * @param tokenAddress
   */
  async _initToken (block: Block, tokenAddress: string): Promise<Token> {
    const token = new Token();
    token.id = tokenAddress;

    console.time('time:indexer#_initToken-eth_call_for_token');
    const endTimer = eventProcessingEthCallDuration.startTimer();

    const symbolPromise = this._erc20Client.getSymbol(block.hash, tokenAddress);
    const namePromise = this._erc20Client.getName(block.hash, tokenAddress);
    const totalSupplyPromise = this._erc20Client.getTotalSupply(block.hash, tokenAddress);
    const decimalsPromise = this._erc20Client.getDecimals(block.hash, tokenAddress);

    const [
      { value: symbol },
      { value: name },
      { value: totalSupply },
      { value: decimals }
    ] = await Promise.all([symbolPromise, namePromise, totalSupplyPromise, decimalsPromise]);

    endTimer();
    console.timeEnd('time:indexer#_initToken-eth_call_for_token');

    token.symbol = symbol;
    token.name = name;
    token.totalSupply = totalSupply;
    token.decimals = decimals;

    return token;
  }

  async _handleInitialize (block: Block, contractAddress: string, tx: Transaction, initializeEvent: InitializeEvent): Promise<void> {
    const { sqrtPriceX96, tick } = initializeEvent;
    const dbTx = await this._db.createTransactionRunner();

    try {
      // Get the contract address in lowercase as pool address.
      const poolAddress = utils.hexlify(contractAddress);
      const pool = await this._db.getPool(dbTx, { id: poolAddress, blockHash: block.hash });
      assert(pool, `Pool ${poolAddress} not found.`);

      // Update Pool.
      pool.sqrtPrice = BigInt(sqrtPriceX96);
      pool.tick = BigInt(tick);

      // Update token prices.
      const [token0, token1] = await Promise.all([
        this._db.getToken(dbTx, { id: pool.token0, blockHash: block.hash }),
        this._db.getToken(dbTx, { id: pool.token1, blockHash: block.hash })
      ]);

      assert(token0 && token1, 'Pool tokens not found.');

      // Update ETH price now that prices could have changed.
      const bundle = await this._db.getBundle(dbTx, { id: '1', blockHash: block.hash });
      assert(bundle);
      bundle.ethPriceUSD = await getEthPriceInUSD(this._db, dbTx, block, this._isDemo);

      await updatePoolDayData(this._db, dbTx, { contractAddress, block });
      await updatePoolHourData(this._db, dbTx, { contractAddress, block });

      token0.derivedETH = await findEthPerToken(this._db, dbTx, token0, block, this._isDemo);
      token1.derivedETH = await findEthPerToken(this._db, dbTx, token1, block, this._isDemo);

      await this._db.saveBundle(dbTx, bundle, block);

      await Promise.all([
        this._db.saveToken(dbTx, token0, block),
        this._db.saveToken(dbTx, token1, block)
      ]);

      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleMint (block: Block, contractAddress: string, tx: Transaction, mintEvent: MintEvent, eventIndex: number): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      const bundle = await this._db.getBundle(dbTx, { id: '1', blockHash: block.hash });
      assert(bundle);

      // Get the contract address in lowercase as pool address.
      const poolAddress = utils.hexlify(contractAddress);
      let pool = await this._db.getPool(dbTx, { id: poolAddress, blockHash: block.hash });
      assert(pool);

      const factory = await loadFactory(this._db, dbTx, block, this._isDemo);

      let [token0, token1] = await Promise.all([
        this._db.getToken(dbTx, { id: pool.token0, blockHash: block.hash }),
        this._db.getToken(dbTx, { id: pool.token1, blockHash: block.hash })
      ]);

      assert(token0);
      assert(token1);
      const amount0 = convertTokenToDecimal(BigInt(mintEvent.amount0), BigInt(token0.decimals));
      const amount1 = convertTokenToDecimal(BigInt(mintEvent.amount1), BigInt(token1.decimals));

      const amountUSD = amount0
        .times(token0.derivedETH.times(bundle.ethPriceUSD))
        .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)));

      // Reset tvl aggregates until new amounts calculated.
      factory.totalValueLockedETH = factory.totalValueLockedETH.minus(pool.totalValueLockedETH);

      // Update globals.
      factory.txCount = BigInt(factory.txCount) + BigInt(1);

      // Update token0 data.
      token0.txCount = BigInt(token0.txCount) + BigInt(1);
      token0.totalValueLocked = token0.totalValueLocked.plus(amount0);
      token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH.times(bundle.ethPriceUSD));

      // Update token1 data.
      token1.txCount = BigInt(token1.txCount) + BigInt(1);
      token1.totalValueLocked = token1.totalValueLocked.plus(amount1);
      token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH.times(bundle.ethPriceUSD));

      // Pool data.
      pool.txCount = BigInt(pool.txCount) + BigInt(1);

      // Pools liquidity tracks the currently active liquidity given pools current tick.
      // We only want to update it on mint if the new position includes the current tick.
      if (pool.tick !== null) {
        if (
          BigInt(mintEvent.tickLower) <= BigInt(pool.tick) &&
          BigInt(mintEvent.tickUpper) > BigInt(pool.tick)
        ) {
          pool.liquidity = BigInt(pool.liquidity) + BigInt(mintEvent.amount);
        }
      }

      pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0);
      pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1);

      pool.totalValueLockedETH = pool.totalValueLockedToken0.times(token0.derivedETH)
        .plus(pool.totalValueLockedToken1.times(token1.derivedETH));

      pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD);

      // Reset aggregates with new amounts.
      factory.totalValueLockedETH = factory.totalValueLockedETH.plus(pool.totalValueLockedETH);
      factory.totalValueLockedUSD = factory.totalValueLockedETH.times(bundle.ethPriceUSD);

      const transaction = await loadTransaction(this._db, dbTx, { block, tx });

      const mint = new Mint();
      mint.id = transaction.id + '#' + pool.txCount.toString();
      mint.transaction = transaction.id;
      mint.timestamp = transaction.timestamp;
      mint.pool = pool.id;
      mint.token0 = pool.token0;
      mint.token1 = pool.token1;
      mint.owner = utils.hexlify(mintEvent.owner);
      mint.sender = utils.hexlify(mintEvent.sender);
      mint.origin = utils.hexlify(tx.from);
      mint.amount = BigInt(mintEvent.amount);
      mint.amount0 = amount0;
      mint.amount1 = amount1;
      mint.amountUSD = amountUSD;
      mint.tickLower = BigInt(mintEvent.tickLower);
      mint.tickUpper = BigInt(mintEvent.tickUpper);
      mint.logIndex = BigInt(eventIndex);

      // Tick entities.
      const lowerTickIdx = mintEvent.tickLower;
      const upperTickIdx = mintEvent.tickUpper;

      const lowerTickId = poolAddress + '#' + mintEvent.tickLower.toString();
      const upperTickId = poolAddress + '#' + mintEvent.tickUpper.toString();

      let lowerTick = await this._db.getTick(dbTx, { id: lowerTickId, blockHash: block.hash });
      let upperTick = await this._db.getTick(dbTx, { id: upperTickId, blockHash: block.hash });

      if (!lowerTick) {
        lowerTick = await createTick(this._db, dbTx, lowerTickId, BigInt(lowerTickIdx), pool, block);
      }

      if (!upperTick) {
        upperTick = await createTick(this._db, dbTx, upperTickId, BigInt(upperTickIdx), pool, block);
      }

      const amount = BigInt(mintEvent.amount);
      lowerTick.liquidityGross = BigInt(lowerTick.liquidityGross) + amount;
      lowerTick.liquidityNet = BigInt(lowerTick.liquidityNet) + amount;
      upperTick.liquidityGross = BigInt(upperTick.liquidityGross) + amount;
      upperTick.liquidityNet = BigInt(upperTick.liquidityNet) - amount;

      // TODO: Update Tick's volume, fees, and liquidity provider count.
      // Computing these on the tick level requires reimplementing some of the swapping code from v3-core.

      await updateUniswapDayData(this._db, dbTx, { block, contractAddress }, this._isDemo);
      await updateTokenDayData(this._db, dbTx, token0, { block });
      await updateTokenDayData(this._db, dbTx, token1, { block });
      await updateTokenHourData(this._db, dbTx, token0, { block });
      await updateTokenHourData(this._db, dbTx, token1, { block });

      await updatePoolDayData(this._db, dbTx, { block, contractAddress });
      await updatePoolHourData(this._db, dbTx, { block, contractAddress });

      [token0, token1] = await Promise.all([
        this._db.saveToken(dbTx, token0, block),
        this._db.saveToken(dbTx, token1, block)
      ]);

      pool.token0 = token0.id;
      pool.token1 = token1.id;

      pool = await this._db.savePool(dbTx, pool, block);
      await this._db.saveFactory(dbTx, factory, block);

      mint.pool = pool.id;
      mint.token0 = token0.id;
      mint.token1 = token1.id;
      await this._db.saveMint(dbTx, mint, block);

      lowerTick.pool = pool.id;
      upperTick.pool = pool.id;
      await Promise.all([
        await this._db.saveTick(dbTx, lowerTick, block),
        await this._db.saveTick(dbTx, upperTick, block)
      ]);

      // Update inner tick vars and save the ticks.
      await this._updateTickFeeVarsAndSave(dbTx, lowerTick, block, contractAddress);
      await this._updateTickFeeVarsAndSave(dbTx, upperTick, block, contractAddress);

      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleBurn (block: Block, contractAddress: string, tx: Transaction, burnEvent: BurnEvent, eventIndex: number): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      const bundle = await this._db.getBundle(dbTx, { id: '1', blockHash: block.hash });
      assert(bundle);

      // Get the contract address in lowercase as pool address.
      const poolAddress = utils.hexlify(contractAddress);
      let pool = await this._db.getPool(dbTx, { id: poolAddress, blockHash: block.hash });
      assert(pool);

      const factory = await loadFactory(this._db, dbTx, block, this._isDemo);

      let [token0, token1] = await Promise.all([
        this._db.getToken(dbTx, { id: pool.token0, blockHash: block.hash }),
        this._db.getToken(dbTx, { id: pool.token1, blockHash: block.hash })
      ]);

      assert(token0);
      assert(token1);
      const amount0 = convertTokenToDecimal(BigInt(burnEvent.amount0), BigInt(token0.decimals));
      const amount1 = convertTokenToDecimal(BigInt(burnEvent.amount1), BigInt(token1.decimals));

      const amountUSD = amount0
        .times(token0.derivedETH.times(bundle.ethPriceUSD))
        .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)));

      // Reset tvl aggregates until new amounts calculated.
      factory.totalValueLockedETH = factory.totalValueLockedETH.minus(pool.totalValueLockedETH);

      // Update globals.
      factory.txCount = BigInt(factory.txCount) + BigInt(1);

      // Update token0 data.
      token0.txCount = BigInt(token0.txCount) + BigInt(1);
      token0.totalValueLocked = token0.totalValueLocked.minus(amount0);
      token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH.times(bundle.ethPriceUSD));

      // Update token1 data.
      token1.txCount = BigInt(token1.txCount) + BigInt(1);
      token1.totalValueLocked = token1.totalValueLocked.minus(amount1);
      token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH.times(bundle.ethPriceUSD));

      // Pool data.
      pool.txCount = BigInt(pool.txCount) + BigInt(1);

      // Pools liquidity tracks the currently active liquidity given pools current tick.
      // We only want to update it on burn if the position being burnt includes the current tick.
      if (pool.tick !== null) {
        if (
          BigInt(burnEvent.tickLower) <= BigInt(pool.tick) &&
          BigInt(burnEvent.tickUpper) > BigInt(pool.tick)
        ) {
          pool.liquidity = BigInt(pool.liquidity) - BigInt(burnEvent.amount);
        }
      }

      pool.totalValueLockedToken0 = pool.totalValueLockedToken0.minus(amount0);
      pool.totalValueLockedToken1 = pool.totalValueLockedToken1.minus(amount1);

      pool.totalValueLockedETH = pool.totalValueLockedToken0
        .times(token0.derivedETH)
        .plus(pool.totalValueLockedToken1.times(token1.derivedETH));

      pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD);

      // Reset aggregates with new amounts.
      factory.totalValueLockedETH = factory.totalValueLockedETH.plus(pool.totalValueLockedETH);
      factory.totalValueLockedUSD = factory.totalValueLockedETH.times(bundle.ethPriceUSD);

      // Burn entity.
      const transaction = await loadTransaction(this._db, dbTx, { block, tx });

      const burn = new Burn();
      burn.id = transaction.id + '#' + pool.txCount.toString();
      burn.transaction = transaction.id;
      burn.timestamp = transaction.timestamp;
      burn.pool = pool.id;
      burn.token0 = pool.token0;
      burn.token1 = pool.token1;
      burn.owner = utils.hexlify(burnEvent.owner);
      burn.origin = utils.hexlify(tx.from);
      burn.amount = BigInt(burnEvent.amount);
      burn.amount0 = amount0;
      burn.amount1 = amount1;
      burn.amountUSD = amountUSD;
      burn.tickLower = BigInt(burnEvent.tickLower);
      burn.tickUpper = BigInt(burnEvent.tickUpper);
      burn.logIndex = BigInt(eventIndex);

      // Tick entities.
      const lowerTickId = poolAddress + '#' + (burnEvent.tickLower).toString();
      const upperTickId = poolAddress + '#' + (burnEvent.tickUpper).toString();
      const lowerTick = await this._db.getTick(dbTx, { id: lowerTickId, blockHash: block.hash }, false);
      const upperTick = await this._db.getTick(dbTx, { id: upperTickId, blockHash: block.hash }, false);
      assert(lowerTick && upperTick);
      const amount = BigInt(burnEvent.amount);
      lowerTick.liquidityGross = BigInt(lowerTick.liquidityGross) - amount;
      lowerTick.liquidityNet = BigInt(lowerTick.liquidityNet) - amount;
      upperTick.liquidityGross = BigInt(upperTick.liquidityGross) - amount;
      upperTick.liquidityNet = BigInt(upperTick.liquidityNet) + amount;

      await updateUniswapDayData(this._db, dbTx, { block, contractAddress }, this._isDemo);
      await updateTokenDayData(this._db, dbTx, token0, { block });
      await updateTokenDayData(this._db, dbTx, token1, { block });
      await updateTokenHourData(this._db, dbTx, token0, { block });
      await updateTokenHourData(this._db, dbTx, token1, { block });
      await updatePoolDayData(this._db, dbTx, { block, contractAddress });
      await updatePoolHourData(this._db, dbTx, { block, contractAddress });
      await this._updateTickFeeVarsAndSave(dbTx, lowerTick, block, contractAddress);
      await this._updateTickFeeVarsAndSave(dbTx, upperTick, block, contractAddress);

      [token0, token1] = await Promise.all([
        this._db.saveToken(dbTx, token0, block),
        this._db.saveToken(dbTx, token1, block)
      ]);

      pool.token0 = token0.id;
      pool.token1 = token1.id;
      pool = await this._db.savePool(dbTx, pool, block);
      await this._db.saveFactory(dbTx, factory, block);

      lowerTick.pool = pool.id;
      upperTick.pool = pool.id;
      await Promise.all([
        await this._db.saveTick(dbTx, lowerTick, block),
        await this._db.saveTick(dbTx, upperTick, block)
      ]);

      burn.pool = pool.id;
      burn.token0 = token0.id;
      burn.token1 = token1.id;
      await this._db.saveBurn(dbTx, burn, block);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleSwap (block: Block, contractAddress: string, tx: Transaction, swapEvent: SwapEvent, eventIndex: number): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      let bundle = await this._db.getBundle(dbTx, { id: '1', blockHash: block.hash });
      assert(bundle);

      const factory = await loadFactory(this._db, dbTx, block, this._isDemo);

      // Get the contract address in lowercase as pool address.
      const poolAddress = utils.hexlify(contractAddress);
      let pool = await this._db.getPool(dbTx, { id: poolAddress, blockHash: block.hash });
      assert(pool);

      // Hot fix for bad pricing.
      if (pool.id === '0x9663f2ca0454accad3e094448ea6f77443880454') {
        return;
      }

      let [token0, token1] = await Promise.all([
        this._db.getToken(dbTx, { id: pool.token0, blockHash: block.hash }),
        this._db.getToken(dbTx, { id: pool.token1, blockHash: block.hash })
      ]);

      assert(token0 && token1, 'Pool tokens not found.');

      let oldTick = pool.tick;

      // Amounts - 0/1 are token deltas. Can be positive or negative.
      const amount0 = convertTokenToDecimal(BigInt(swapEvent.amount0), BigInt(token0.decimals));
      const amount1 = convertTokenToDecimal(BigInt(swapEvent.amount1), BigInt(token1.decimals));

      // Need absolute amounts for volume.
      let amount0Abs = amount0;
      let amount1Abs = amount1;

      if (amount0.lt(new GraphDecimal(0))) {
        amount0Abs = amount0.times(new GraphDecimal('-1'));
      }

      if (amount1.lt(new GraphDecimal(0))) {
        amount1Abs = amount1.times(new GraphDecimal('-1'));
      }

      const amount0ETH = amount0Abs.times(token0.derivedETH);
      const amount1ETH = amount1Abs.times(token1.derivedETH);
      const amount0USD = amount0ETH.times(bundle.ethPriceUSD);
      const amount1USD = amount1ETH.times(bundle.ethPriceUSD);

      // Get amount that should be tracked only - div 2 because cant count both input and output as volume.
      const trackedAmountUSD = await getTrackedAmountUSD(this._db, dbTx, amount0Abs, token0, amount1Abs, token1, block, this._isDemo);
      const amountTotalUSDTracked = trackedAmountUSD.div(new GraphDecimal('2'));
      const amountTotalETHTracked = safeDiv(amountTotalUSDTracked, bundle.ethPriceUSD);
      const amountTotalUSDUntracked = amount0USD.plus(amount1USD).div(new GraphDecimal('2'));

      const feesETH = amountTotalETHTracked.times(pool.feeTier.toString()).div(new GraphDecimal('1000000'));
      const feesUSD = amountTotalUSDTracked.times(pool.feeTier.toString()).div(new GraphDecimal('1000000'));

      // Global updates.
      factory.txCount = BigInt(factory.txCount) + BigInt(1);
      factory.totalVolumeETH = factory.totalVolumeETH.plus(amountTotalETHTracked);
      factory.totalVolumeUSD = factory.totalVolumeUSD.plus(amountTotalUSDTracked);
      factory.untrackedVolumeUSD = factory.untrackedVolumeUSD.plus(amountTotalUSDUntracked);
      factory.totalFeesETH = factory.totalFeesETH.plus(feesETH);
      factory.totalFeesUSD = factory.totalFeesUSD.plus(feesUSD);

      // Reset aggregate tvl before individual pool tvl updates.
      const currentPoolTvlETH = pool.totalValueLockedETH;
      factory.totalValueLockedETH = factory.totalValueLockedETH.minus(currentPoolTvlETH);

      // pool volume
      pool.volumeToken0 = pool.volumeToken0.plus(amount0Abs);
      pool.volumeToken1 = pool.volumeToken1.plus(amount1Abs);
      pool.volumeUSD = pool.volumeUSD.plus(amountTotalUSDTracked);
      pool.untrackedVolumeUSD = pool.untrackedVolumeUSD.plus(amountTotalUSDUntracked);
      pool.feesUSD = pool.feesUSD.plus(feesUSD);
      pool.txCount = BigInt(pool.txCount) + BigInt(1);

      // Update the pool with the new active liquidity, price, and tick.
      pool.liquidity = BigInt(swapEvent.liquidity);
      pool.tick = BigInt(swapEvent.tick);
      pool.sqrtPrice = BigInt(swapEvent.sqrtPriceX96);
      pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0);
      pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1);

      // Update token0 data.
      token0.volume = token0.volume.plus(amount0Abs);
      token0.totalValueLocked = token0.totalValueLocked.plus(amount0);
      token0.volumeUSD = token0.volumeUSD.plus(amountTotalUSDTracked);
      token0.untrackedVolumeUSD = token0.untrackedVolumeUSD.plus(amountTotalUSDUntracked);
      token0.feesUSD = token0.feesUSD.plus(feesUSD);
      token0.txCount = BigInt(token0.txCount) + BigInt(1);

      // Update token1 data.
      token1.volume = token1.volume.plus(amount1Abs);
      token1.totalValueLocked = token1.totalValueLocked.plus(amount1);
      token1.volumeUSD = token1.volumeUSD.plus(amountTotalUSDTracked);
      token1.untrackedVolumeUSD = token1.untrackedVolumeUSD.plus(amountTotalUSDUntracked);
      token1.feesUSD = token1.feesUSD.plus(feesUSD);
      token1.txCount = BigInt(token1.txCount) + BigInt(1);

      // Updated pool rates.
      const prices = sqrtPriceX96ToTokenPrices(pool.sqrtPrice, token0 as Token, token1 as Token);
      pool.token0Price = prices[0];
      pool.token1Price = prices[1];
      await this._db.savePool(dbTx, pool, block);

      // Update USD pricing.
      bundle.ethPriceUSD = await getEthPriceInUSD(this._db, dbTx, block, this._isDemo);
      bundle = await this._db.saveBundle(dbTx, bundle, block);
      token0.derivedETH = await findEthPerToken(this._db, dbTx, token0, block, this._isDemo);
      token1.derivedETH = await findEthPerToken(this._db, dbTx, token1, block, this._isDemo);

      /**
       * Things afffected by new USD rates.
       */
      pool.totalValueLockedETH = pool.totalValueLockedToken0
        .times(token0.derivedETH)
        .plus(pool.totalValueLockedToken1.times(token1.derivedETH));

      pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD);

      factory.totalValueLockedETH = factory.totalValueLockedETH.plus(pool.totalValueLockedETH);
      factory.totalValueLockedUSD = factory.totalValueLockedETH.times(bundle.ethPriceUSD);

      token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH).times(bundle.ethPriceUSD);
      token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH).times(bundle.ethPriceUSD);

      // Create Swap event
      const transaction = await loadTransaction(this._db, dbTx, { block, tx });

      const swap = new Swap();
      swap.id = transaction.id + '#' + pool.txCount.toString();
      swap.transaction = transaction.id;
      swap.timestamp = transaction.timestamp;
      swap.pool = pool.id;
      swap.token0 = pool.token0;
      swap.token1 = pool.token1;
      swap.sender = utils.hexlify(swapEvent.sender);
      swap.origin = utils.hexlify(tx.from);
      swap.recipient = utils.hexlify(swapEvent.recipient);
      swap.amount0 = amount0;
      swap.amount1 = amount1;
      swap.amountUSD = amountTotalUSDTracked;
      swap.tick = BigInt(swapEvent.tick);
      swap.sqrtPriceX96 = BigInt(swapEvent.sqrtPriceX96);
      swap.logIndex = BigInt(eventIndex);

      // Skipping update pool fee growth as they are not queried.
      // // Update fee growth.
      // console.time('time:indexer#_getPosition-eth_call_for_feeGrowthGlobal');
      // const endTimer = eventProcessingEthCallDuration.startTimer();
      // const [
      //   { value: feeGrowthGlobal0X128 },
      //   { value: feeGrowthGlobal1X128 }
      // ] = await Promise.all([
      //   this._uniClient.feeGrowthGlobal0X128(block.hash, contractAddress),
      //   this._uniClient.feeGrowthGlobal1X128(block.hash, contractAddress)
      // ]);
      // endTimer();
      // console.timeEnd('time:indexer#_getPosition-eth_call_for_feeGrowthGlobal');

      // pool.feeGrowthGlobal0X128 = BigInt(feeGrowthGlobal0X128);
      // pool.feeGrowthGlobal1X128 = BigInt(feeGrowthGlobal1X128);

      // Interval data.
      const uniswapDayData = await updateUniswapDayData(this._db, dbTx, { block, contractAddress }, this._isDemo);
      const poolDayData = await updatePoolDayData(this._db, dbTx, { block, contractAddress });
      const poolHourData = await updatePoolHourData(this._db, dbTx, { block, contractAddress });
      const token0DayData = await updateTokenDayData(this._db, dbTx, token0, { block });
      const token1DayData = await updateTokenDayData(this._db, dbTx, token1, { block });
      const token0HourData = await updateTokenHourData(this._db, dbTx, token0, { block });
      const token1HourData = await updateTokenHourData(this._db, dbTx, token1, { block });

      // Update volume metrics.
      uniswapDayData.volumeETH = uniswapDayData.volumeETH.plus(amountTotalETHTracked);
      uniswapDayData.volumeUSD = uniswapDayData.volumeUSD.plus(amountTotalUSDTracked);
      uniswapDayData.feesUSD = uniswapDayData.feesUSD.plus(feesUSD);

      poolDayData.volumeUSD = poolDayData.volumeUSD.plus(amountTotalUSDTracked);
      poolDayData.volumeToken0 = poolDayData.volumeToken0.plus(amount0Abs);
      poolDayData.volumeToken1 = poolDayData.volumeToken1.plus(amount1Abs);
      poolDayData.feesUSD = poolDayData.feesUSD.plus(feesUSD);

      poolHourData.volumeUSD = poolHourData.volumeUSD.plus(amountTotalUSDTracked);
      poolHourData.volumeToken0 = poolHourData.volumeToken0.plus(amount0Abs);
      poolHourData.volumeToken1 = poolHourData.volumeToken1.plus(amount1Abs);
      poolHourData.feesUSD = poolHourData.feesUSD.plus(feesUSD);

      token0DayData.volume = token0DayData.volume.plus(amount0Abs);
      token0DayData.volumeUSD = token0DayData.volumeUSD.plus(amountTotalUSDTracked);
      token0DayData.untrackedVolumeUSD = token0DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked);
      token0DayData.feesUSD = token0DayData.feesUSD.plus(feesUSD);

      token0HourData.volume = token0HourData.volume.plus(amount0Abs);
      token0HourData.volumeUSD = token0HourData.volumeUSD.plus(amountTotalUSDTracked);
      token0HourData.untrackedVolumeUSD = token0HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked);
      token0HourData.feesUSD = token0HourData.feesUSD.plus(feesUSD);

      token1DayData.volume = token1DayData.volume.plus(amount1Abs);
      token1DayData.volumeUSD = token1DayData.volumeUSD.plus(amountTotalUSDTracked);
      token1DayData.untrackedVolumeUSD = token1DayData.untrackedVolumeUSD.plus(amountTotalUSDTracked);
      token1DayData.feesUSD = token1DayData.feesUSD.plus(feesUSD);

      token1HourData.volume = token1HourData.volume.plus(amount1Abs);
      token1HourData.volumeUSD = token1HourData.volumeUSD.plus(amountTotalUSDTracked);
      token1HourData.untrackedVolumeUSD = token1HourData.untrackedVolumeUSD.plus(amountTotalUSDTracked);
      token1HourData.feesUSD = token1HourData.feesUSD.plus(feesUSD);

      await this._db.saveFactory(dbTx, factory, block);

      [token0, token1] = await Promise.all([
        this._db.saveToken(dbTx, token0, block),
        this._db.saveToken(dbTx, token1, block)
      ]);

      pool.token0 = token0.id;
      pool.token1 = token1.id;
      pool = await this._db.savePool(dbTx, pool, block);

      swap.token0 = token0.id;
      swap.token1 = token1.id;
      swap.pool = pool.id;
      await this._db.saveSwap(dbTx, swap, block);

      token0DayData.token = token0.id;
      token1DayData.token = token1.id;
      await this._db.saveTokenDayData(dbTx, token0DayData, block);
      await this._db.saveTokenDayData(dbTx, token1DayData, block);

      await this._db.saveUniswapDayData(dbTx, uniswapDayData, block);

      poolDayData.pool = pool.id;
      await this._db.savePoolDayData(dbTx, poolDayData, block);

      if (block.number > FIRST_GRAFT_BLOCK) {
        await this._db.savePoolHourData(dbTx, poolHourData, block);
      }

      // Update inner vars of current or crossed ticks.
      const newTick = pool.tick;
      // Check that the tick value is not null (can be zero).
      assert(newTick !== null);

      const tickSpacing = feeTierToTickSpacing(pool.feeTier, block);
      const modulo = newTick % tickSpacing;

      if (modulo === BigInt(0)) {
        // Current tick is initialized and needs to be updated.
        await this._loadTickUpdateFeeVarsAndSave(dbTx, Number(newTick), block, contractAddress);
      }

      if (!oldTick) {
        // In subgraph mapping code when oldTick is null, it is converted to zero in the operation below.
        oldTick = BigInt(0);
      }

      const numIters = BigInt(
        BigNumber.from(oldTick - newTick)
          .abs()
          .div(tickSpacing)
          .toString()
      );

      if (numIters > BigInt(100)) {
        // In case more than 100 ticks need to be updated ignore the update in
        // order to avoid timeouts. From testing this behavior occurs only upon
        // pool initialization. This should not be a big issue as the ticks get
        // updated later. For early users this error also disappears when calling
        // collect.
      } else if (newTick > oldTick) {
        const firstInitialized = oldTick + tickSpacing - modulo;

        for (let i = firstInitialized; i < newTick; i = i + tickSpacing) {
          await this._loadTickUpdateFeeVarsAndSave(dbTx, Number(i), block, contractAddress);
        }
      } else if (newTick < oldTick) {
        const firstInitialized = oldTick - modulo;

        for (let i = firstInitialized; i >= newTick; i = i - tickSpacing) {
          await this._loadTickUpdateFeeVarsAndSave(dbTx, Number(i), block, contractAddress);
        }
      }

      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleFlash (block: Block, contractAddress: string, tx: Transaction, flashEvent: FlashEvent): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      // Get the contract address in lowercase as pool address.
      const poolAddress = utils.hexlify(contractAddress);
      const pool = await this._db.getPool(dbTx, { id: poolAddress, blockHash: block.hash });
      assert(pool);

      // Skipping update pool fee growth as they are not queried.
      // console.time('time:indexer#_getPosition-eth_call_for_feeGrowthGlobal');
      // const endTimer = eventProcessingEthCallDuration.startTimer();
      // const [
      //   { value: feeGrowthGlobal0X128 },
      //   { value: feeGrowthGlobal1X128 }
      // ] = await Promise.all([
      //   this._uniClient.feeGrowthGlobal0X128(block.hash, contractAddress),
      //   this._uniClient.feeGrowthGlobal1X128(block.hash, contractAddress)
      // ]);
      // endTimer();
      // console.timeEnd('time:indexer#_getPosition-eth_call_for_feeGrowthGlobal');

      // pool.feeGrowthGlobal0X128 = BigInt(feeGrowthGlobal0X128);
      // pool.feeGrowthGlobal1X128 = BigInt(feeGrowthGlobal1X128);

      await this._db.savePool(dbTx, pool, block);
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleIncreaseLiquidity (block: Block, contractAddress: string, tx: Transaction, event: IncreaseLiquidityEvent): Promise<void> {
    const position = await this._getPosition(block, contractAddress, tx, BigInt(event.tokenId));

    // position was not able to be fetched.
    if (position === null) {
      return;
    }

    // Temp fix from Subgraph mapping code.
    if (utils.getAddress(position.pool) === utils.getAddress('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248')) {
      return;
    }

    await this._updateFeeVars(position, block, contractAddress, BigInt(event.tokenId));
    const dbTx = await this._db.createTransactionRunner();

    try {
      const [token0, token1] = await Promise.all([
        this._db.getToken(dbTx, { id: position.token0, blockHash: block.hash }),
        this._db.getToken(dbTx, { id: position.token1, blockHash: block.hash })
      ]);

      assert(token0 && token1);

      const amount0 = convertTokenToDecimal(BigInt(event.amount0), BigInt(token0.decimals));
      const amount1 = convertTokenToDecimal(BigInt(event.amount1), BigInt(token1.decimals));

      position.liquidity = BigInt(position.liquidity) + BigInt(event.liquidity);
      position.depositedToken0 = position.depositedToken0.plus(amount0);
      position.depositedToken1 = position.depositedToken1.plus(amount1);

      await this._db.savePosition(dbTx, position, block);

      await this._savePositionSnapshot(dbTx, position, block, tx);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleDecreaseLiquidity (block: Block, contractAddress: string, tx: Transaction, event: DecreaseLiquidityEvent): Promise<void> {
    let position = await this._getPosition(block, contractAddress, tx, BigInt(event.tokenId));

    // Position was not able to be fetched.
    if (position == null) {
      return;
    }

    // Temp fix from Subgraph mapping code.
    if (utils.getAddress(position.pool) === utils.getAddress('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248')) {
      return;
    }

    position = await this._updateFeeVars(position, block, contractAddress, BigInt(event.tokenId));
    const dbTx = await this._db.createTransactionRunner();

    try {
      const [token0, token1] = await Promise.all([
        this._db.getToken(dbTx, { id: position.token0, blockHash: block.hash }),
        this._db.getToken(dbTx, { id: position.token1, blockHash: block.hash })
      ]);

      assert(token0 && token1);

      const amount0 = convertTokenToDecimal(BigInt(event.amount0), BigInt(token0.decimals));
      const amount1 = convertTokenToDecimal(BigInt(event.amount1), BigInt(token1.decimals));

      position.liquidity = BigInt(position.liquidity) - BigInt(event.liquidity);
      position.withdrawnToken0 = position.withdrawnToken0.plus(amount0);
      position.withdrawnToken1 = position.withdrawnToken1.plus(amount1);

      await this._db.savePosition(dbTx, position, block);
      await this._savePositionSnapshot(dbTx, position, block, tx);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleCollect (block: Block, contractAddress: string, tx: Transaction, event: CollectEvent): Promise<void> {
    let position = await this._getPosition(block, contractAddress, tx, BigInt(event.tokenId));

    // Position was not able to be fetched.
    if (position == null) {
      return;
    }

    // Temp fix from Subgraph mapping code.
    if (utils.getAddress(position.pool) === utils.getAddress('0x8fe8d9bb8eeba3ed688069c3d6b556c9ca258248')) {
      return;
    }

    position = await this._updateFeeVars(position, block, contractAddress, BigInt(event.tokenId));
    const dbTx = await this._db.createTransactionRunner();

    try {
      if (block.number <= FIRST_GRAFT_BLOCK) {
        const [token0, token1] = await Promise.all([
          this._db.getToken(dbTx, { id: position.token0, blockHash: block.hash }),
          this._db.getToken(dbTx, { id: position.token1, blockHash: block.hash })
        ]);

        assert(token0 && token1);

        const amount0 = convertTokenToDecimal(BigInt(event.amount0), BigInt(token0.decimals));
        const amount1 = convertTokenToDecimal(BigInt(event.amount1), BigInt(token1.decimals));

        position.collectedFeesToken0 = position.collectedFeesToken0.plus(amount0);
        position.collectedFeesToken1 = position.collectedFeesToken1.plus(amount1);
      }

      await this._db.savePosition(dbTx, position, block);
      await this._savePositionSnapshot(dbTx, position, block, tx);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _handleTransfer (block: Block, contractAddress: string, tx: Transaction, event: TransferEvent): Promise<void> {
    const position = await this._getPosition(block, contractAddress, tx, BigInt(event.tokenId));
    // Position was not able to be fetched.
    if (position === null) {
      return;
    }

    const dbTx = await this._db.createTransactionRunner();

    try {
      position.owner = utils.hexlify(event.to);
      await this._db.savePosition(dbTx, position, block);

      await this._savePositionSnapshot(dbTx, position, block, tx);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async _updateTickFeeVarsAndSave (dbTx: QueryRunner, tick: Tick, block: Block, contractAddress: string): Promise<void> {
    const poolAddress = contractAddress;

    // Not all ticks are initialized so obtaining null is expected behavior.
    console.time('time:indexer#_getPosition-eth_call_for_ticks');
    const endTimer = eventProcessingEthCallDuration.startTimer();
    const { value: tickResult } = await this._uniClient.ticks(block.hash, poolAddress, Number(tick.tickIdx));
    endTimer();
    console.timeEnd('time:indexer#_getPosition-eth_call_for_ticks');

    tick.feeGrowthOutside0X128 = tickResult.feeGrowthOutside0X128;
    tick.feeGrowthOutside1X128 = tickResult.feeGrowthOutside1X128;

    await this._db.saveTick(dbTx, tick, block);

    await updateTickDayData(this._db, dbTx, tick, { block });
  }

  async _loadTickUpdateFeeVarsAndSave (dbTx:QueryRunner, tickId: number, block: Block, contractAddress: string): Promise<void> {
    // Get the contract address in lowercase as pool address.
    const poolAddress = utils.hexlify(contractAddress);

    const tick = await this._db.getTick(
      dbTx,
      {
        id: poolAddress.concat('#').concat(tickId.toString()),
        blockHash: block.hash
      },
      false
    );

    if (tick) {
      await this._updateTickFeeVarsAndSave(dbTx, tick, block, contractAddress);
    }
  }

  async _getPosition (block: Block, contractAddress: string, tx: Transaction, tokenId: bigint): Promise<Position | null> {
    const { hash: blockHash } = block;
    let position = await this._db.getPosition({ id: tokenId.toString(), blockHash });

    if (!position) {
      try {
        console.time('time:indexer#_getPosition-eth_call_for_positions');
        let endTimer = eventProcessingEthCallDuration.startTimer();

        const { value: positionResult } = await this._uniClient.positions(blockHash, contractAddress, tokenId);

        endTimer();
        console.timeEnd('time:indexer#_getPosition-eth_call_for_positions');

        let factoryAddress = FACTORY_ADDRESS;

        if (this._isDemo) {
          // Currently fetching address from Factory entity in database as only one exists.
          const [factory] = await this._db.getModelEntitiesNoTx(Factory, { hash: blockHash }, {}, { limit: 1 });
          factoryAddress = factory.id;
        }

        console.time('time:indexer#_getPosition-eth_call_for_getPool');
        endTimer = eventProcessingEthCallDuration.startTimer();

        let { value: poolAddress } = await this._uniClient.callGetPool(blockHash, factoryAddress, positionResult.token0, positionResult.token1, positionResult.fee);

        endTimer();
        console.timeEnd('time:indexer#_getPosition-eth_call_for_getPool');

        // Get the pool address in lowercase.
        poolAddress = utils.hexlify(poolAddress);

        position = new Position();
        position.id = tokenId.toString();
        // The owner gets correctly updated in the Transfer handler
        position.owner = ADDRESS_ZERO;
        position.pool = poolAddress;
        position.token0 = utils.hexlify(positionResult.token0);
        position.token1 = utils.hexlify(positionResult.token1);
        position.tickLower = poolAddress.concat('#').concat(positionResult.tickLower.toString());
        position.tickUpper = poolAddress.concat('#').concat(positionResult.tickUpper.toString());

        const dbTx = await this._db.createTransactionRunner();

        try {
          const transaction = await loadTransaction(this._db, dbTx, { block, tx });
          position.transaction = transaction.id;

          await dbTx.commitTransaction();
        } catch (error) {
          await dbTx.rollbackTransaction();
          throw error;
        } finally {
          await dbTx.release();
        }

        position.feeGrowthInside0LastX128 = BigInt(positionResult.feeGrowthInside0LastX128.toString());
        position.feeGrowthInside1LastX128 = BigInt(positionResult.feeGrowthInside1LastX128.toString());
      } catch (error: any) {
        // The contract call reverts in situations where the position is minted and deleted in the same block.
        // From my investigation this happens in calls from BancorSwap.
        // (e.g. 0xf7867fa19aa65298fadb8d4f72d0daed5e836f3ba01f0b9b9631cdc6c36bed40)

        if (error.message !== utils.Logger.errors.CALL_EXCEPTION) {
          log('nfpm positions eth_call failed');
          throw error;
        }
      }
    }

    return position || null;
  }

  async _updateFeeVars (position: Position, block: Block, contractAddress: string, tokenId: bigint): Promise<Position> {
    try {
      console.time('time:indexer#_updateFeeVars-eth_call_for_positions');
      const endTimer = eventProcessingEthCallDuration.startTimer();

      const { value: positionResult } = await this._uniClient.positions(block.hash, contractAddress, tokenId);

      endTimer();
      console.timeEnd('time:indexer#_updateFeeVars-eth_call_for_positions');

      if (positionResult) {
        position.feeGrowthInside0LastX128 = BigInt(positionResult.feeGrowthInside0LastX128.toString());
        position.feeGrowthInside1LastX128 = BigInt(positionResult.feeGrowthInside1LastX128.toString());
      }
    } catch (error) {
      log('nfpm positions eth_call failed');
      log(error);
    }

    return position;
  }

  async _savePositionSnapshot (dbTx: QueryRunner, position: Position, block: Block, tx: Transaction): Promise<void> {
    const positionSnapshot = new PositionSnapshot();
    positionSnapshot.id = position.id.concat('#').concat(block.number.toString());
    positionSnapshot.owner = position.owner;
    positionSnapshot.pool = position.pool;
    positionSnapshot.position = position.id;
    positionSnapshot._blockNumber = BigInt(block.number);
    positionSnapshot.timestamp = BigInt(block.timestamp);
    positionSnapshot.liquidity = position.liquidity;
    positionSnapshot.depositedToken0 = position.depositedToken0;
    positionSnapshot.depositedToken1 = position.depositedToken1;
    positionSnapshot.withdrawnToken0 = position.withdrawnToken0;
    positionSnapshot.withdrawnToken1 = position.withdrawnToken1;
    positionSnapshot.collectedFeesToken0 = position.collectedFeesToken0;
    positionSnapshot.collectedFeesToken1 = position.collectedFeesToken1;
    const transaction = await loadTransaction(this._db, dbTx, { block, tx });
    positionSnapshot.transaction = transaction.id;
    positionSnapshot.feeGrowthInside0LastX128 = position.feeGrowthInside0LastX128;
    positionSnapshot.feeGrowthInside1LastX128 = position.feeGrowthInside1LastX128;

    await this._db.savePositionSnapshot(dbTx, positionSnapshot, block);
  }
}
