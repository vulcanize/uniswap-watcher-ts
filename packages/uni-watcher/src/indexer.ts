//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';
import { DeepPartial, FindConditions, FindManyOptions, QueryRunner } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';
import assert from 'assert';

import { JobQueue, IndexerInterface } from '@vulcanize/util';
import { Indexer as BaseIndexer, StateStatus, ServerConfig, Where, QueryOptions, ValueResult, UNKNOWN_EVENT_NAME } from '@cerc-io/util';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { StorageLayout, MappingKey } from '@cerc-io/solidity-mapper';

import { Database } from './database';
import { Event } from './entity/Event';
import { BlockProgress } from './entity/BlockProgress';
import { Contract, KIND_FACTORY, KIND_POOL, KIND_NFPM } from './entity/Contract';
import { SyncStatus } from './entity/SyncStatus';
import { State } from './entity/State';
import { StateSyncStatus } from './entity/StateSyncStatus';

import { abi as factoryABI, storageLayout as factoryStorageLayout } from './artifacts/factory.json';
import { abi as nfpmABI, storageLayout as nfpmStorageLayout } from './artifacts/NonfungiblePositionManager.json';
import poolABI from './artifacts/pool.json';

const log = debug('vulcanize:indexer');

type ResultEvent = {
  block: any;
  tx: any;

  contract: string;

  eventIndex: number;
  event: any;

  proof: string;
};

export class Indexer implements IndexerInterface {
  _db: Database
  _ethClient: EthClient
  _baseIndexer: BaseIndexer
  _ethProvider: ethers.providers.BaseProvider
  _serverConfig: ServerConfig
  _storageLayoutMap: Map<string, StorageLayout> = new Map()

  _factoryContract: ethers.utils.Interface
  _poolContract: ethers.utils.Interface
  _nfpmContract: ethers.utils.Interface

  constructor (serverConfig: ServerConfig, db: Database, ethClient: EthClient, ethProvider: ethers.providers.BaseProvider, jobQueue: JobQueue) {
    this._db = db;
    this._ethClient = ethClient;
    this._ethProvider = ethProvider;
    this._serverConfig = serverConfig;
    this._baseIndexer = new BaseIndexer(this._serverConfig, this._db, this._ethClient, this._ethProvider, jobQueue);

    this._factoryContract = new ethers.utils.Interface(factoryABI);
    this._poolContract = new ethers.utils.Interface(poolABI);
    this._nfpmContract = new ethers.utils.Interface(nfpmABI);
  }

  get serverConfig (): ServerConfig {
    return this._serverConfig;
  }

  get storageLayoutMap (): Map<string, StorageLayout> {
    return this._storageLayoutMap;
  }

  async init (): Promise<void> {
    await this._baseIndexer.fetchContracts();
  }

  getResultEvent (event: Event): ResultEvent {
    const block = event.block;
    const eventFields = JSON.parse(event.eventInfo);
    const { tx } = JSON.parse(event.extraInfo);

    return {
      block: {
        hash: block.blockHash,
        number: block.blockNumber,
        timestamp: block.blockTimestamp,
        parentHash: block.parentHash
      },

      tx: {
        hash: event.txHash,
        from: tx.src,
        to: tx.dst,
        index: tx.index
      },

      contract: event.contract,

      eventIndex: event.index,
      event: {
        __typename: `${event.eventName}Event`,
        ...eventFields
      },

      // TODO: Return proof only if requested.
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

  getStateData (state: State): any {
    return this._baseIndexer.getStateData(state);
  }

  async triggerIndexingOnEvent (dbTx: QueryRunner, dbEvent: Event): Promise<void> {
    const re = this.getResultEvent(dbEvent);

    switch (re.event.__typename) {
      case 'PoolCreatedEvent': {
        const poolContract = ethers.utils.getAddress(re.event.pool);
        await this.watchContract(poolContract, KIND_POOL, true, dbEvent.block.blockNumber);
      }
    }
  }

  async processEvent (event: Event): Promise<void> {
    const dbTx = await this._db.createTransactionRunner();

    try {
      // Trigger indexing of data based on the event.
      await this.triggerIndexingOnEvent(dbTx, event);
      await dbTx.commitTransaction();
    } catch (error) {
      await dbTx.rollbackTransaction();
      throw error;
    } finally {
      await dbTx.release();
    }
  }

  async processBlock (blockProgress: BlockProgress): Promise<void> {
    // Method for processing on indexing new block.
  }

  async processCanonicalBlock (blockHash: string, blockNumber: number): Promise<void> {
    // TODO Implement
  }

  async processCheckpoint (blockHash: string): Promise<void> {
    // TODO Implement
  }

  parseEventNameAndArgs (kind: string, logObj: any): any {
    let eventName = UNKNOWN_EVENT_NAME;
    let eventInfo = {};

    const { topics, data } = logObj;

    switch (kind) {
      case KIND_FACTORY: {
        const logDescription = this._factoryContract.parseLog({ data, topics });
        switch (logDescription.name) {
          case 'PoolCreated': {
            eventName = logDescription.name;
            const { token0, token1, fee, tickSpacing, pool } = logDescription.args;
            eventInfo = { token0, token1, fee, tickSpacing, pool };

            break;
          }
        }

        break;
      }
      case KIND_POOL: {
        const logDescription = this._poolContract.parseLog({ data, topics });
        switch (logDescription.name) {
          case 'Initialize': {
            eventName = logDescription.name;
            const { sqrtPriceX96, tick } = logDescription.args;
            eventInfo = { sqrtPriceX96: sqrtPriceX96.toString(), tick };

            break;
          }
          case 'Mint': {
            eventName = logDescription.name;
            const { sender, owner, tickLower, tickUpper, amount, amount0, amount1 } = logDescription.args;
            eventInfo = {
              sender,
              owner,
              tickLower,
              tickUpper,
              amount: amount.toString(),
              amount0: amount0.toString(),
              amount1: amount1.toString()
            };

            break;
          }
          case 'Burn': {
            eventName = logDescription.name;
            const { owner, tickLower, tickUpper, amount, amount0, amount1 } = logDescription.args;
            eventInfo = {
              owner,
              tickLower,
              tickUpper,
              amount: amount.toString(),
              amount0: amount0.toString(),
              amount1: amount1.toString()
            };

            break;
          }
          case 'Swap': {
            eventName = logDescription.name;
            const { sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick } = logDescription.args;
            eventInfo = {
              sender,
              recipient,
              amount0: amount0.toString(),
              amount1: amount1.toString(),
              sqrtPriceX96: sqrtPriceX96.toString(),
              liquidity: liquidity.toString(),
              tick
            };

            break;
          }
          case 'Flash': {
            eventName = logDescription.name;
            const { sender, recipient, amount0, amount1, paid0, paid1 } = logDescription.args;
            eventInfo = {
              sender,
              recipient,
              amount0: amount0.toString(),
              amount1: amount1.toString(),
              paid0: paid0.toString(),
              paid1: paid1.toString()
            };

            break;
          }
        }

        break;
      }
      case KIND_NFPM: {
        const logDescription = this._nfpmContract.parseLog({ data, topics });
        switch (logDescription.name) {
          case 'IncreaseLiquidity': {
            eventName = logDescription.name;
            const { tokenId, liquidity, amount0, amount1 } = logDescription.args;

            eventInfo = {
              tokenId: tokenId.toString(),
              liquidity: liquidity.toString(),
              amount0: amount0.toString(),
              amount1: amount1.toString()
            };

            break;
          }
          case 'DecreaseLiquidity': {
            eventName = logDescription.name;
            const { tokenId, liquidity, amount0, amount1 } = logDescription.args;

            eventInfo = {
              tokenId: tokenId.toString(),
              liquidity: liquidity.toString(),
              amount0: amount0.toString(),
              amount1: amount1.toString()
            };

            break;
          }
          case 'Collect': {
            eventName = logDescription.name;
            const { tokenId, recipient, amount0, amount1 } = logDescription.args;

            eventInfo = {
              tokenId: tokenId.toString(),
              recipient,
              amount0: amount0.toString(),
              amount1: amount1.toString()
            };

            break;
          }
          case 'Transfer': {
            eventName = logDescription.name;
            const { from, to, tokenId } = logDescription.args;

            eventInfo = {
              from,
              to,
              tokenId: tokenId.toString()
            };

            break;
          }
        }

        break;
      }
    }

    return { eventName, eventInfo };
  }

  async position (blockHash: string, tokenId: string): Promise<any> {
    const nfpmContract = await this._db.getLatestContract('nfpm');
    assert(nfpmContract, 'No NFPM contract watched.');
    const { value, proof } = await this._baseIndexer.getStorageValue(nfpmStorageLayout, blockHash, nfpmContract.address, '_positions', BigInt(tokenId));

    return {
      ...value,
      proof
    };
  }

  async poolIdToPoolKey (blockHash: string, poolId: string): Promise<any> {
    const nfpmContract = await this._db.getLatestContract('nfpm');
    assert(nfpmContract, 'No NFPM contract watched.');
    const { value, proof } = await this._baseIndexer.getStorageValue(nfpmStorageLayout, blockHash, nfpmContract.address, '_poolIdToPoolKey', BigInt(poolId));

    return {
      ...value,
      proof
    };
  }

  async getPool (blockHash: string, token0: string, token1: string, fee: string): Promise<any> {
    const factoryContract = await this._db.getLatestContract('factory');
    assert(factoryContract, 'No Factory contract watched.');
    const { value, proof } = await this._baseIndexer.getStorageValue(factoryStorageLayout, blockHash, factoryContract.address, 'getPool', token0, token1, BigInt(fee));

    return {
      pool: value,
      proof
    };
  }

  async callGetPool (blockHash: string, contractAddress: string, key0: string, key1: string, key2: number): Promise<ValueResult> {
    const contract = new ethers.Contract(contractAddress, factoryABI, this._ethProvider);

    try {
      const value = await contract.getPool(key0, key1, key2, { blockTag: blockHash });

      return { value };
    } catch (error: any) {
      if (error.code === ethers.utils.Logger.errors.CALL_EXCEPTION) {
        log('eth_call error');
        log(error);

        throw new Error(error.code);
      }

      throw error;
    }
  }

  async positions (blockHash: string, contractAddress: string, tokenId: string): Promise<ValueResult> {
    const contract = new ethers.Contract(contractAddress, nfpmABI, this._ethProvider);

    try {
      const value = await contract.positions(tokenId, { blockTag: blockHash });

      return { value };
    } catch (error: any) {
      if (error.code === ethers.utils.Logger.errors.CALL_EXCEPTION) {
        log('eth_call error');
        log(error);

        throw new Error(error.code);
      }

      throw error;
    }
  }

  async ticks (blockHash: string, contractAddress: string, tick: number): Promise<ValueResult> {
    const contract = new ethers.Contract(contractAddress, poolABI, this._ethProvider);

    try {
      const value = await contract.ticks(tick, { blockTag: blockHash });

      return { value };
    } catch (error: any) {
      if (error.code === ethers.utils.Logger.errors.CALL_EXCEPTION) {
        log('eth_call error');
        log(error);

        throw new Error(error.code);
      }

      throw error;
    }
  }

  async feeGrowthGlobal0X128 (blockHash: string, contractAddress: string): Promise<ValueResult> {
    const contract = new ethers.Contract(contractAddress, poolABI, this._ethProvider);

    try {
      const value = await contract.feeGrowthGlobal0X128({ blockTag: blockHash });

      return { value };
    } catch (error: any) {
      if (error.code === ethers.utils.Logger.errors.CALL_EXCEPTION) {
        log('eth_call error');
        log(error);

        throw new Error(error.code);
      }

      throw error;
    }
  }

  async feeGrowthGlobal1X128 (blockHash: string, contractAddress: string): Promise<ValueResult> {
    const contract = new ethers.Contract(contractAddress, poolABI, this._ethProvider);

    try {
      const value = await contract.feeGrowthGlobal1X128({ blockTag: blockHash });

      return { value };
    } catch (error: any) {
      if (error.code === ethers.utils.Logger.errors.CALL_EXCEPTION) {
        log('eth_call error');
        log(error);

        throw new Error(error.code);
      }

      throw error;
    }
  }

  async getStateSyncStatus (): Promise<StateSyncStatus | undefined> {
    return this._db.getStateSyncStatus();
  }

  async updateStateSyncStatusIndexedBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    // TODO Implement
    return {} as StateSyncStatus;
  }

  async updateStateSyncStatusCheckpointBlock (blockNumber: number, force?: boolean): Promise<StateSyncStatus> {
    // TODO Implement
    return {} as StateSyncStatus;
  }

  async getLatestCanonicalBlock (): Promise<BlockProgress> {
    const syncStatus = await this.getSyncStatus();
    assert(syncStatus);

    const latestCanonicalBlock = await this.getBlockProgress(syncStatus.latestCanonicalBlockHash);
    assert(latestCanonicalBlock);

    return latestCanonicalBlock;
  }

  async getContract (type: string): Promise<any> {
    const contract = await this._db.getLatestContract(type);
    return contract;
  }

  async getEventsByFilter (blockHash: string, contract: string, name?: string): Promise<Array<Event>> {
    return this._baseIndexer.getEventsByFilter(blockHash, contract, name);
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

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    return this._baseIndexer.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    return this._baseIndexer.getEventsInRange(fromBlockNumber, toBlockNumber);
  }

  // Note: Some event names might be unknown at this point, as earlier events might not yet be processed.
  async fetchBlockEvents (block: DeepPartial<BlockProgress>): Promise<DeepPartial<Event>[]> {
    return this._baseIndexer.fetchBlockEvents(
      block,
      this._fetchEvents.bind(this)
    );
  }

  async fetchBlockWithEvents (block: DeepPartial<BlockProgress>): Promise<BlockProgress> {
    // Method not used in uni-watcher but required for indexer interface.
    return new BlockProgress();
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
    return this._baseIndexer.updateSyncStatusCanonicalBlock(blockHash, blockNumber, force);
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

  async markBlocksAsPruned (blocks: BlockProgress[]): Promise<void> {
    return this._baseIndexer.markBlocksAsPruned(blocks);
  }

  async updateBlockProgress (block: BlockProgress, lastProcessedEventIndex: number): Promise<BlockProgress> {
    return this._baseIndexer.updateBlockProgress(block, lastProcessedEventIndex);
  }

  async getAncestorAtDepth (blockHash: string, depth: number): Promise<string> {
    return this._baseIndexer.getAncestorAtDepth(blockHash, depth);
  }

  async _fetchEvents ({ blockHash }: DeepPartial<BlockProgress>): Promise<DeepPartial<Event>[]> {
    assert(blockHash);

    const logsPromise = this._ethClient.getLogs({ blockHash });
    const transactionsPromise = this._ethClient.getBlockWithTransactions({ blockHash });

    const [
      { logs },
      {
        allEthHeaderCids: {
          nodes: [
            {
              ethTransactionCidsByHeaderId: {
                nodes: transactions
              }
            }
          ]
        }
      }
    ] = await Promise.all([logsPromise, transactionsPromise]);

    const transactionMap = transactions.reduce((acc: {[key: string]: any}, transaction: {[key: string]: any}) => {
      acc[transaction.txHash] = transaction;
      return acc;
    }, {});

    const dbEvents: Array<DeepPartial<Event>> = [];

    for (let li = 0; li < logs.length; li++) {
      const logObj = logs[li];
      const {
        topics,
        data,
        index: logIndex,
        cid,
        ipldBlock,
        account: {
          address
        },
        transaction: {
          hash: txHash
        },
        receiptCID,
        status
      } = logObj;

      if (status) {
        let eventName = UNKNOWN_EVENT_NAME;
        let eventInfo = {};
        const tx = transactionMap[txHash];
        const extraInfo = { topics, data, tx };

        const contract = ethers.utils.getAddress(address);
        const uniContract = await this.isWatchedContract(contract);

        if (uniContract) {
          const eventDetails = this.parseEventNameAndArgs(uniContract.kind, logObj);
          eventName = eventDetails.eventName;
          eventInfo = eventDetails.eventInfo;
        }

        dbEvents.push({
          index: logIndex,
          txHash,
          contract,
          eventName,
          eventInfo: JSONbig.stringify(eventInfo),
          extraInfo: JSONbig.stringify(extraInfo),
          proof: JSONbig.stringify({
            data: JSONbig.stringify({
              blockHash,
              receiptCID,
              log: {
                cid,
                ipldBlock
              }
            })
          })
        });
      } else {
        log(`Skipping event for receipt ${receiptCID} due to failed transaction.`);
      }
    }

    return dbEvents;
  }
}
