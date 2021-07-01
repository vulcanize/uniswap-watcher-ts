import debug from 'debug';
import BigInt from 'apollo-type-bigint';
import { Data, Entity } from './data';

const log = debug('test');

interface BlockHeight {
  number: number;
  hash: string;
}

export const createResolvers = async (): Promise<any> => {
  const data = Data.getInstance();
  const { bundles } = data.entities;

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
      }
    }
  };
};
