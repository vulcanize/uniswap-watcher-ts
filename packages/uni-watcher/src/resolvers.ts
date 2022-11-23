//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import {
  gqlTotalQueryCount,
  gqlQueryCount,
  ValueResult,
  IndexerInterface,
  EventWatcherInterface
} from '@cerc-io/util';

import { Indexer } from './indexer';
import { EventWatcher } from './events';

const log = debug('vulcanize:resolver');

export const createResolvers = async (indexerArg: IndexerInterface, eventWatcherArg: EventWatcherInterface): Promise<any> => {
  const indexer = indexerArg as Indexer;
  const eventWatcher = eventWatcherArg as EventWatcher;

  return {
    BigInt: new BigInt('bigInt'),

    FactoryEvent: {
      __resolveType () {
        return null;
      }
    },

    NonFungiblePositionManagerEvent: {
      __resolveType () {
        return null;
      }
    },

    PoolEvent: {
      __resolveType () {
        return null;
      }
    },

    Event: {
      __resolveType: (obj: any) => {
        assert(obj.__typename);

        return obj.__typename;
      }
    },

    Subscription: {
      onEvent: {
        subscribe: () => eventWatcher.getEventIterator()
      },

      onBlockProgressEvent: {
        subscribe: () => eventWatcher.getBlockProgressEventIterator()
      }
    },

    Query: {

      events: async (_: any, { blockHash, contract, name }: { blockHash: string, contract: string, name: string }) => {
        log('events', blockHash, contract, name || '');
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('events').inc(1);

        const block = await indexer.getBlockProgress(blockHash);
        if (!block || !block.isComplete) {
          // TODO: Trigger indexing for the block.
          throw new Error(`Block hash ${blockHash} number ${block?.blockNumber} not processed yet`);
        }

        const events = await indexer.getEventsByFilter(blockHash, contract, name);
        return events.map(event => indexer.getResultEvent(event));
      },

      eventsInRange: async (_: any, { fromBlockNumber, toBlockNumber }: { fromBlockNumber: number, toBlockNumber: number }) => {
        log('eventsInRange', fromBlockNumber, toBlockNumber);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('eventsInRange').inc(1);

        const { expected, actual } = await indexer.getProcessedBlockCountForRange(fromBlockNumber, toBlockNumber);
        if (expected !== actual) {
          throw new Error(`Range not available, expected ${expected}, got ${actual} blocks in range`);
        }

        const events = await indexer.getEventsInRange(fromBlockNumber, toBlockNumber);
        return events.map(event => indexer.getResultEvent(event));
      },

      position: (_: any, { blockHash, tokenId }: { blockHash: string, tokenId: string }) => {
        log('position', blockHash, tokenId);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('position').inc(1);

        return indexer.position(blockHash, tokenId);
      },

      positions: (_: any, { blockHash, contractAddress, tokenId }: { blockHash: string, contractAddress: string, tokenId: string }): Promise<ValueResult> => {
        log('positions', blockHash, contractAddress, tokenId);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('positions').inc(1);

        return indexer.positions(blockHash, contractAddress, tokenId);
      },

      ticks: (_: any, { blockHash, contractAddress, tick }: { blockHash: string, contractAddress: string, tick: number }): Promise<ValueResult> => {
        log('ticks', blockHash, contractAddress, tick);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('ticks').inc(1);

        return indexer.ticks(blockHash, contractAddress, tick);
      },

      feeGrowthGlobal0X128: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('feeGrowthGlobal0X128', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('feeGrowthGlobal0X128').inc(1);

        return indexer.feeGrowthGlobal0X128(blockHash, contractAddress);
      },

      feeGrowthGlobal1X128: (_: any, { blockHash, contractAddress }: { blockHash: string, contractAddress: string }): Promise<ValueResult> => {
        log('feeGrowthGlobal1X128', blockHash, contractAddress);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('feeGrowthGlobal1X128').inc(1);

        return indexer.feeGrowthGlobal1X128(blockHash, contractAddress);
      },

      poolIdToPoolKey: (_: any, { blockHash, poolId }: { blockHash: string, poolId: string }) => {
        log('poolIdToPoolKey', blockHash, poolId);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('poolIdToPoolKey').inc(1);

        return indexer.poolIdToPoolKey(blockHash, poolId);
      },

      getPool: (_: any, { blockHash, token0, token1, fee }: { blockHash: string, token0: string, token1: string, fee: string }) => {
        log('getPool', blockHash, token0, token1, fee);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('getPool').inc(1);

        return indexer.getPool(blockHash, token0, token1, fee);
      },

      callGetPool: (_: any, { blockHash, contractAddress, key0, key1, key2 }: { blockHash: string, contractAddress: string, key0: string, key1: string, key2: number }): Promise<ValueResult> => {
        log('callGetPool', blockHash, contractAddress, key0, key1, key2);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('callGetPool').inc(1);

        return indexer.callGetPool(blockHash, contractAddress, key0, key1, key2);
      },

      getContract: (_: any, { type }: { type: string }) => {
        log('getContract', type);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('getContract').inc(1);

        return indexer.getContract(type);
      }
    }
  };
};
