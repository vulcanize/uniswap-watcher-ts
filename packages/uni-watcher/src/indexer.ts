import debug from 'debug';
import { DeepPartial } from 'typeorm';
import JSONbig from 'json-bigint';
import { ethers } from 'ethers';
import assert from 'assert';

import { EthClient } from '@vulcanize/ipld-eth-client';
import { GetStorageAt, getStorageValue, StorageLayout } from '@vulcanize/solidity-mapper';
import { Config } from '@vulcanize/util';

import { Database } from './database';
import { Event, UNKNOWN_EVENT_NAME } from './entity/Event';
import { BlockProgress } from './entity/BlockProgress';
import { Contract, KIND_FACTORY, KIND_POOL, KIND_NFPM } from './entity/Contract';

import { abi as factoryABI, storageLayout as factoryStorageLayout } from './artifacts/factory.json';
import { abi as nfpmABI, storageLayout as nfpmStorageLayout } from './artifacts/NonfungiblePositionManager.json';
import poolABI from './artifacts/pool.json';
import { SyncStatus } from './entity/SyncStatus';

// TODO: Move to config.
const MAX_EVENTS_BLOCK_RANGE = 1000;

const log = debug('vulcanize:indexer');

type ResultEvent = {
  block: any;
  tx: any;

  contract: string;

  eventIndex: number;
  event: any;

  proof: string;
};

interface ValueResult {
  value: any;
  proof: {
    data: string;
  }
}

export class Indexer {
  _config: Config;
  _db: Database
  _ethClient: EthClient
  _postgraphileClient: EthClient
  _getStorageAt: GetStorageAt

  _factoryContract: ethers.utils.Interface
  _poolContract: ethers.utils.Interface
  _nfpmContract: ethers.utils.Interface

  constructor (config: Config, db: Database, ethClient: EthClient, postgraphileClient: EthClient) {
    this._config = config;
    this._db = db;
    this._ethClient = ethClient;
    this._postgraphileClient = postgraphileClient;
    this._getStorageAt = this._ethClient.getStorageAt.bind(this._ethClient);

    this._factoryContract = new ethers.utils.Interface(factoryABI);
    this._poolContract = new ethers.utils.Interface(poolABI);
    this._nfpmContract = new ethers.utils.Interface(nfpmABI);
  }

  getResultEvent (event: Event): ResultEvent {
    const block = event.block;
    const eventFields = JSON.parse(event.eventInfo);
    const { transaction } = JSON.parse(event.extraInfo);

    return {
      block: {
        hash: block.blockHash,
        number: block.blockNumber,
        timestamp: block.blockTimestamp,
        parentHash: block.parentHash
      },

      tx: {
        hash: event.txHash,
        from: transaction.src,
        to: transaction.dst,
        index: transaction.index
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

  // Note: Some event names might be unknown at this point, as earlier events might not yet be processed.
  async getOrFetchBlockEvents (blockHash: string): Promise<Array<Event>> {
    const blockProgress = await this._db.getBlockProgress(blockHash);
    if (!blockProgress) {
      // Fetch and save events first and make a note in the event sync progress table.
      log(`getBlockEvents: db miss, fetching from upstream server ${blockHash}`);
      await this.fetchAndSaveEvents(blockHash);
    }

    const events = await this._db.getBlockEvents(blockHash);
    log(`getBlockEvents: db hit, ${blockHash} num events: ${events.length}`);

    return events;
  }

  async getBlockEvents (blockHash: string): Promise<Array<Event>> {
    return this._db.getBlockEvents(blockHash);
  }

  async getEventsByFilter (blockHash: string, contract: string, name: string | null): Promise<Array<Event>> {
    if (contract) {
      const uniContract = await this.isUniswapContract(contract);
      if (!uniContract) {
        throw new Error('Not a uniswap contract');
      }
    }

    const events = await this._db.getBlockEvents(blockHash);
    log(`getEvents: db hit, num events: ${events.length}`);

    // Filtering.
    const result = events
      // TODO: Filter using db WHERE condition on contract.
      .filter(event => !contract || contract === event.contract)
      // TODO: Filter using db WHERE condition when name is not empty.
      .filter(event => !name || name === event.eventName);

    return result;
  }

  async triggerIndexingOnEvent (dbEvent: Event): Promise<void> {
    const re = this.getResultEvent(dbEvent);

    switch (re.event.__typename) {
      case 'PoolCreatedEvent': {
        const poolContract = ethers.utils.getAddress(re.event.pool);
        await this._db.saveContract(poolContract, KIND_POOL, dbEvent.block.blockNumber);
      }
    }
  }

  async isUniswapContract (address: string): Promise<Contract | undefined> {
    return this._db.getContract(ethers.utils.getAddress(address));
  }

  async processEvent (event: Event): Promise<void> {
    // Trigger indexing of data based on the event.
    await this.triggerIndexingOnEvent(event);
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

  async fetchAndSaveEvents (blockHash: string): Promise<void> {
    const { block, logs } = await this._ethClient.getLogs({ blockHash });

    const {
      allEthHeaderCids: {
        nodes: [
          {
            ethTransactionCidsByHeaderId: {
              nodes: transactions
            }
          }
        ]
      }
    } = await this._postgraphileClient.getBlockWithTransactions({ blockHash });

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
        }
      } = logObj;

      let eventName = UNKNOWN_EVENT_NAME;
      let eventInfo = {};
      const transaction = transactionMap[txHash];
      const extraInfo = { topics, data, transaction };

      const contract = ethers.utils.getAddress(address);
      const uniContract = await this.isUniswapContract(contract);

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
            receipt: {
              cid,
              ipldBlock
            }
          })
        })
      });
    }

    await this._db.saveEvents(block, dbEvents);
  }

  async updateSyncStatusIndexedBlock (blockHash: string, blockNumber: number): Promise<SyncStatus> {
    return this._db.updateSyncStatusIndexedBlock(blockHash, blockNumber);
  }

  async updateSyncStatusChainHead (blockHash: string, blockNumber: number): Promise<SyncStatus> {
    return this._db.updateSyncStatusChainHead(blockHash, blockNumber);
  }

  async updateSyncStatusCanonicalBlock (blockHash: string, blockNumber: number): Promise<SyncStatus> {
    return this._db.updateSyncStatusCanonicalBlock(blockHash, blockNumber);
  }

  async getSyncStatus (): Promise<SyncStatus | undefined> {
    return this._db.getSyncStatus();
  }

  async getBlock (blockHash: string): Promise<any> {
    const { block } = await this._ethClient.getLogs({ blockHash });
    return block;
  }

  async getEvent (id: string): Promise<Event | undefined> {
    return this._db.getEvent(id);
  }

  async saveEventEntity (dbEvent: Event): Promise<Event> {
    return this._db.saveEventEntity(dbEvent);
  }

  async getBlockProgress (blockHash: string): Promise<BlockProgress | undefined> {
    return this._db.getBlockProgress(blockHash);
  }

  async getBlocksAtHeight (height: number, isPruned: boolean): Promise<BlockProgress[]> {
    return this._db.getBlocksAtHeight(height, isPruned);
  }

  async blockIsAncestor (ancestorBlockHash: string, blockHash: string, maxDepth: number): Promise<boolean> {
    assert(maxDepth > 0);

    let depth = 0;
    let currentBlockHash = blockHash;
    let currentBlock;

    // TODO: Use a hierarchical query to optimize this.
    while (depth < maxDepth) {
      depth++;

      currentBlock = await this._db.getBlockProgress(currentBlockHash);
      if (!currentBlock) {
        break;
      } else {
        if (currentBlock.parentHash === ancestorBlockHash) {
          return true;
        }

        // Descend the chain.
        currentBlockHash = currentBlock.parentHash;
      }
    }

    return false;
  }

  async markBlockAsPruned (block: BlockProgress): Promise<BlockProgress> {
    return this._db.markBlockAsPruned(block);
  }

  async updateBlockProgress (blockHash: string, lastProcessedEventIndex: number): Promise<void> {
    return this._db.updateBlockProgress(blockHash, lastProcessedEventIndex);
  }

  async getProcessedBlockCountForRange (fromBlockNumber: number, toBlockNumber: number): Promise<{ expected: number, actual: number }> {
    return this._db.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
  }

  async getEventsInRange (fromBlockNumber: number, toBlockNumber: number): Promise<Array<Event>> {
    if (toBlockNumber <= fromBlockNumber) {
      throw new Error('toBlockNumber should be greater than fromBlockNumber');
    }

    if ((toBlockNumber - fromBlockNumber) > MAX_EVENTS_BLOCK_RANGE) {
      throw new Error(`Max range (${MAX_EVENTS_BLOCK_RANGE}) exceeded`);
    }

    return this._db.getEventsInRange(fromBlockNumber, toBlockNumber);
  }

  async position (blockHash: string, tokenId: string): Promise<any> {
    const nfpmContract = await this._db.getLatestContract('nfpm');
    assert(nfpmContract, 'No NFPM contract watched.');
    const { value, proof } = await this._getStorageValue(nfpmStorageLayout, blockHash, nfpmContract.address, '_positions', BigInt(tokenId));

    return {
      ...value,
      proof
    };
  }

  async poolIdToPoolKey (blockHash: string, poolId: string): Promise<any> {
    const nfpmContract = await this._db.getLatestContract('nfpm');
    assert(nfpmContract, 'No NFPM contract watched.');
    const { value, proof } = await this._getStorageValue(nfpmStorageLayout, blockHash, nfpmContract.address, '_poolIdToPoolKey', BigInt(poolId));

    return {
      ...value,
      proof
    };
  }

  async getPool (blockHash: string, token0: string, token1: string, fee: string): Promise<any> {
    const factoryContract = await this._db.getLatestContract('factory');
    assert(factoryContract, 'No Factory contract watched.');
    const { value, proof } = await this._getStorageValue(factoryStorageLayout, blockHash, factoryContract.address, 'getPool', token0, token1, BigInt(fee));

    return {
      pool: value,
      proof
    };
  }

  // TODO: Move into base/class or framework package.
  async _getStorageValue (storageLayout: StorageLayout, blockHash: string, token: string, variable: string, ...mappingKeys: any[]): Promise<ValueResult> {
    return getStorageValue(
      storageLayout,
      this._getStorageAt,
      blockHash,
      token,
      variable,
      ...mappingKeys
    );
  }
}
