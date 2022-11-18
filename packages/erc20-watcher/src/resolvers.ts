//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { gqlTotalQueryCount, gqlQueryCount, ValueResult } from '@cerc-io/util';

import { CONTRACT_KIND, Indexer } from './indexer';
import { EventWatcher } from './events';

const log = debug('vulcanize:resolver');

export const createResolvers = async (indexer: Indexer, eventWatcher: EventWatcher): Promise<any> => {
  assert(indexer);

  return {
    BigInt: new BigInt('bigInt'),

    TokenEvent: {
      __resolveType: (obj: any) => {
        assert(obj.__typename);

        return obj.__typename;
      }
    },

    Subscription: {
      onTokenEvent: {
        subscribe: () => eventWatcher.getEventIterator()
      }
    },

    Mutation: {
      watchToken: async (_: any, { token, checkpoint = false, startingBlock = 1 }: { token: string, checkpoint: boolean, startingBlock: number }): Promise<boolean> => {
        log('watchToken', token, checkpoint, startingBlock);
        await indexer.watchContract(token, CONTRACT_KIND, checkpoint, startingBlock);

        return true;
      }
    },

    Query: {

      totalSupply: (_: any, { blockHash, token }: { blockHash: string, token: string }): Promise<ValueResult> => {
        log('totalSupply', blockHash, token);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('totalSupply').inc(1);

        return indexer.totalSupply(blockHash, token);
      },

      balanceOf: async (_: any, { blockHash, token, owner }: { blockHash: string, token: string, owner: string }) => {
        log('balanceOf', blockHash, token, owner);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('balanceOf').inc(1);

        return indexer.balanceOf(blockHash, token, owner);
      },

      allowance: async (_: any, { blockHash, token, owner, spender }: { blockHash: string, token: string, owner: string, spender: string }) => {
        log('allowance', blockHash, token, owner, spender);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('allowance').inc(1);

        return indexer.allowance(blockHash, token, owner, spender);
      },

      name: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('name', blockHash, token);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('name').inc(1);

        return indexer.name(blockHash, token);
      },

      symbol: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('symbol', blockHash, token);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('symbol').inc(1);

        return indexer.symbol(blockHash, token);
      },

      decimals: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('decimals', blockHash, token);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('decimals').inc(1);

        return indexer.decimals(blockHash, token);
      },

      events: async (_: any, { blockHash, token, name }: { blockHash: string, token: string, name: string }) => {
        log('events', blockHash, token, name || '');
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('events').inc(1);

        const block = await indexer.getBlockProgress(blockHash);
        if (!block || !block.isComplete) {
          throw new Error(`Block hash ${blockHash} number ${block?.blockNumber} not processed yet`);
        }

        const events = await indexer.getEventsByFilter(blockHash, token, name);
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
      }
    }
  };
};
