import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';

import { Indexer, OrderDirection } from './indexer';
import { Burn } from './entity/Burn';
import { Bundle } from './entity/Bundle';
import { Factory } from './entity/Factory';

const log = debug('vulcanize:resolver');

const DEFAULT_LIMIT = 100;

export interface BlockHeight {
  number?: number;
  hash?: string;
}

export const createResolvers = async (indexer: Indexer): Promise<any> => {
  assert(indexer);

  return {
    BigInt: new BigInt('bigInt'),

    Query: {
      bundle: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('bundle', id, block);

        return indexer.getBundle(id, block);
      },

      bundles: async (_: any, { block = {}, first = DEFAULT_LIMIT }: { first: number, block: BlockHeight }) => {
        log('bundles', block, first);

        return indexer.getEntities(Bundle, { blockHash: block.hash, blockNumber: block.number }, { limit: first });
      },

      burns: async (_: any, { first = DEFAULT_LIMIT, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: Partial<Burn> }) => {
        log('burns', first, orderBy, orderDirection, where);

        return indexer.getEntities(Burn, where, { limit: first, orderBy, orderDirection }, ['pool']);
      },

      factories: async (_: any, { block = {}, first = DEFAULT_LIMIT }: { first: number, block: BlockHeight }) => {
        log('factories', block, first);

        return indexer.getEntities(Factory, { blockHash: block.hash, blockNumber: block.number }, { limit: first });
      }
    }
  };
};
