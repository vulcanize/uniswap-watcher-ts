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

    Query: {

      events: async (_: any, { blockHash, token, name }: { blockHash: string, token: string, name: string }) => {
        log('events', blockHash, token, name || '');
        return indexer.getEvents(blockHash, token, name);
      }
    }
  };
};
