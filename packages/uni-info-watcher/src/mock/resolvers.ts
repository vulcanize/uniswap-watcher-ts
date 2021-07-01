import debug from 'debug';
import BigInt from 'apollo-type-bigint';

// import { } from './data';

const log = debug('test');

interface BlockHeight {
  number: number;
  hash: string;
}

export const createResolvers = async (): Promise<any> => {
  return {
    BigInt: new BigInt('bigInt'),

    Query: {
      bundle: (_: any, { id, block }: { id: string, block: BlockHeight }) => {
        log('bundle', id, block);

        return {
          ethPriceUSD: 0,
          id: ''
        };
      }
    }
  };
};
