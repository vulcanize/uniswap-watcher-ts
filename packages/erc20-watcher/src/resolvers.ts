import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { Indexer, ValueResult } from './indexer';

const log = debug('vulcanize:resolver');

export const createResolvers = async (indexer: Indexer): Promise<any> => {
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
        subscribe: () => indexer.getEventIterator()
      }
    },

    Mutation: {
      watchToken: (_: any, { token, startingBlock = 1 }: { token: string, startingBlock: number }): Promise<boolean> => {
        log('watchToken', token, startingBlock);
        return indexer.watchContract(token, startingBlock);
      }
    },

    Query: {

      totalSupply: (_: any, { blockHash, token }: { blockHash: string, token: string }): Promise<ValueResult> => {
        log('totalSupply', blockHash, token);
        return indexer.totalSupply(blockHash, token);
      },

      balanceOf: async (_: any, { blockHash, blockNumber, token, owner }: { blockHash: string, blockNumber: number, token: string, owner: string }) => {
        log('balanceOf', blockHash, token, owner);
        return indexer.balanceOf(blockHash, blockNumber, token, owner);
      },

      allowance: async (_: any, { blockHash, blockNumber, token, owner, spender }: { blockHash: string, blockNumber: number, token: string, owner: string, spender: string }) => {
        log('allowance', blockHash, token, owner, spender);
        return indexer.allowance(blockHash, blockNumber, token, owner, spender);
      },

      name: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('name', blockHash, token);
        return indexer.name(blockHash, token);
      },

      symbol: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('symbol', blockHash, token);
        return indexer.symbol(blockHash, token);
      },

      decimals: (_: any, { blockHash, token }: { blockHash: string, token: string }) => {
        log('decimals', blockHash, token);
        return indexer.decimals(blockHash, token);
      },

      events: async (_: any, { blockHash, token, name }: { blockHash: string, token: string, name: string }) => {
        log('events', blockHash, token, name || '');
        return indexer.getEvents(blockHash, token, name);
      }
    }
  };
};
