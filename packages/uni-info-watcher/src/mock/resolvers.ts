import debug from 'debug';
import BigInt from 'apollo-type-bigint';
import { Data, Entity } from './data';

const LATEST_BLOCK = 2;

const log = debug('test');

interface BlockHeight {
  number: number;
  hash: string;
}

enum OrderDirection {
  asc,
  desc
}

enum BurnOrderBy {
  timestamp
}

interface BurnFilter {
  pool: string;
  token0: string;
  token1: string;
}

export const createResolvers = async (): Promise<any> => {
  const data = Data.getInstance();
  const { bundles, burns } = data.entities;

  return {
    BigInt: new BigInt('bigInt'),

    Query: {
      bundle: (_: any, { id: bundleId, block }: { id: string, block: BlockHeight }) => {
        log('bundle', bundleId, block);
        const res = bundles.find((bundle: Entity) => bundle.blockNumber === block.number && bundle.id === bundleId);

        if (res) {
          const { ethPriceUSD, id } = res;
          return { ethPriceUSD, id };
        }
      },

      bundles: (_: any, { first, block }: { first: number, block: BlockHeight }) => {
        log('bundles', first, block);

        const res = bundles.filter((bundle: Entity) => bundle.blockNumber === block.number)
          .slice(0, first)
          .map(({ ethPriceUSD, id }) => ({ ethPriceUSD, id }));

        return res;
      },

      burns: (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: BurnOrderBy, orderDirection: OrderDirection, where: BurnFilter }) => {
        log('burns', first, orderBy, orderDirection, where);

        const res = burns.filter((burn: Entity) => {
          if (burn.blockNumber === LATEST_BLOCK) {
            return Object.entries(where || {})
              .every(([field, value]) => burn[field] === value);
          }

          return false;
        }).slice(0, first)
          .sort((a: any, b: any) => {
            return orderDirection === OrderDirection.asc ? (a - b) : (b - a);
          });

        return res;
      }
    }
  };
};
