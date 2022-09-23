//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';
import { GraphQLScalarType } from 'graphql';

import { BlockHeight, gqlQueryCount, gqlTotalQueryCount, GraphDecimal, OrderDirection } from '@vulcanize/util';

import { Indexer } from './indexer';
import { Burn } from './entity/Burn';
import { Bundle } from './entity/Bundle';
import { Factory } from './entity/Factory';
import { Mint } from './entity/Mint';
import { PoolDayData } from './entity/PoolDayData';
import { Pool } from './entity/Pool';
import { Swap } from './entity/Swap';
import { Tick } from './entity/Tick';
import { Token } from './entity/Token';
import { TokenDayData } from './entity/TokenDayData';
import { TokenHourData } from './entity/TokenHourData';
import { UniswapDayData } from './entity/UniswapDayData';
import { Position } from './entity/Position';
import { EventWatcher } from './events';
import { Transaction } from './entity/Transaction';

const log = debug('vulcanize:resolver');

export { BlockHeight };

export const createResolvers = async (indexer: Indexer, eventWatcher: EventWatcher): Promise<any> => {
  assert(indexer);

  return {
    BigInt: new BigInt('bigInt'),

    BigDecimal: new GraphQLScalarType({
      name: 'BigDecimal',
      description: 'BigDecimal custom scalar type',
      parseValue (value) {
        // value from the client
        return new GraphDecimal(value);
      },
      serialize (value: GraphDecimal) {
        // value sent to the client
        return value.toFixed();
      }
    }),

    ChainIndexingStatus: {
      __resolveType: () => {
        return 'EthereumIndexingStatus';
      }
    },

    Subscription: {
      onBlockProgressEvent: {
        subscribe: () => eventWatcher.getBlockProgressEventIterator()
      }
    },

    Query: {
      bundle: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('bundle', id, block);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('bundle').inc(1);

        return indexer.getBundle(id, block);
      },

      bundles: async (_: any, { block = {}, first }: { first: number, block: BlockHeight }) => {
        log('bundles', block, first);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('bundles').inc(1);

        return indexer.getEntities(Bundle, block, {}, { limit: first });
      },

      burns: async (_: any, { block = {}, first, orderBy, orderDirection, where }: { block: BlockHeight, first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('burns', first, orderBy, orderDirection, where);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('burns').inc(1);

        return indexer.getEntities(
          Burn,
          block,
          where,
          { limit: first, orderBy, orderDirection },
          [
            {
              entity: Pool,
              type: 'one-to-one',
              field: 'pool',
              childRelations: [
                {
                  entity: Token,
                  type: 'one-to-one',
                  field: 'token0'
                },
                {
                  entity: Token,
                  type: 'one-to-one',
                  field: 'token1'
                }
              ]
            },
            {
              entity: Transaction,
              type: 'one-to-one',
              field: 'transaction'
            }
          ]
        );
      },

      factories: async (_: any, { block = {}, first }: { first: number, block: BlockHeight }) => {
        log('factories', block, first);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('factories').inc(1);

        return indexer.getEntities(Factory, block, {}, { limit: first });
      },

      mints: async (_: any, { block = {}, first, orderBy, orderDirection, where }: { block: BlockHeight, first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('mints', first, orderBy, orderDirection, where);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('mints').inc(1);

        return indexer.getEntities(
          Mint,
          block,
          where,
          { limit: first, orderBy, orderDirection },
          [
            {
              entity: Pool,
              type: 'one-to-one',
              field: 'pool',
              childRelations: [
                {
                  entity: Token,
                  type: 'one-to-one',
                  field: 'token0'
                },
                {
                  entity: Token,
                  type: 'one-to-one',
                  field: 'token1'
                }
              ]
            },
            {
              entity: Transaction,
              type: 'one-to-one',
              field: 'transaction'
            }
          ]
        );
      },

      pool: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('pool', id, block);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('pool').inc(1);

        return indexer.getPool(id, block);
      },

      poolDayDatas: async (_: any, { block = {}, first, skip, orderBy, orderDirection, where }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('poolDayDatas', first, skip, orderBy, orderDirection, where);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('poolDayDatas').inc(1);

        return indexer.getEntities(PoolDayData, block, where, { limit: first, skip, orderBy, orderDirection });
      },

      pools: async (_: any, { block = {}, first, orderBy, orderDirection, where = {} }: { block: BlockHeight, first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('pools', block, first, orderBy, orderDirection, where);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('pools').inc(1);

        return indexer.getEntities(
          Pool,
          block,
          where,
          { limit: first, orderBy, orderDirection },
          [
            {
              entity: Token,
              type: 'one-to-one',
              field: 'token0'
            },
            {
              entity: Token,
              type: 'one-to-one',
              field: 'token1'
            }
          ]
        );
      },

      swaps: async (_: any, { block = {}, first, orderBy, orderDirection, where }: { block: BlockHeight, first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('swaps', first, orderBy, orderDirection, where);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('swaps').inc(1);

        return indexer.getEntities(
          Swap,
          block,
          where,
          { limit: first, orderBy, orderDirection },
          [
            {
              entity: Pool,
              type: 'one-to-one',
              field: 'pool',
              childRelations: [
                {
                  entity: Token,
                  type: 'one-to-one',
                  field: 'token0'
                },
                {
                  entity: Token,
                  type: 'one-to-one',
                  field: 'token1'
                }
              ]
            },
            {
              entity: Transaction,
              type: 'one-to-one',
              field: 'transaction'
            }
          ]
        );
      },

      ticks: async (_: any, { block = {}, first, skip, where = {} }: { block: BlockHeight, first: number, skip: number, where: { [key: string]: any } }) => {
        log('ticks', block, first, skip, where);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('ticks').inc(1);

        return indexer.getEntities(Tick, block, where, { limit: first, skip });
      },

      token: async (_: any, { id, block = {} }: { id: string, block: BlockHeight }) => {
        log('token', id, block);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('token').inc(1);

        return indexer.getToken(id, block);
      },

      tokens: async (_: any, { block = {}, first, orderBy, orderDirection, where }: { block: BlockHeight, first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('tokens', orderBy, orderDirection, where);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('tokens').inc(1);

        return indexer.getEntities(
          Token,
          block,
          where,
          { limit: first, orderBy, orderDirection },
          [
            {
              entity: Pool,
              type: 'many-to-many',
              field: 'whitelistPools'
            }
          ]
        );
      },

      tokenDayDatas: async (_: any, { block = {}, first, skip, orderBy, orderDirection, where }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('tokenDayDatas', first, skip, orderBy, orderDirection, where);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('tokenDayDatas').inc(1);

        return indexer.getEntities(TokenDayData, block, where, { limit: first, skip, orderBy, orderDirection });
      },

      tokenHourDatas: async (_: any, { block = {}, first, skip, orderBy, orderDirection, where }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('tokenHourDatas', first, skip, orderBy, orderDirection, where);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('tokenHourDatas').inc(1);

        return indexer.getEntities(TokenHourData, block, where, { limit: first, skip, orderBy, orderDirection });
      },

      transactions: async (_: any, { block = {}, first, orderBy, orderDirection, where }: { block: BlockHeight, first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('transactions', first, orderBy, orderDirection);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('transactions').inc(1);

        return indexer.getEntities(
          Transaction,
          block,
          where,
          { limit: first, orderBy, orderDirection },
          [
            {
              entity: Mint,
              type: 'one-to-many',
              field: 'mints',
              foreignKey: 'transaction',
              childRelations: [
                {
                  entity: Transaction,
                  type: 'one-to-one',
                  field: 'transaction'
                },
                {
                  entity: Pool,
                  type: 'one-to-one',
                  field: 'pool',
                  childRelations: [
                    {
                      entity: Token,
                      type: 'one-to-one',
                      field: 'token0'
                    },
                    {
                      entity: Token,
                      type: 'one-to-one',
                      field: 'token1'
                    }
                  ]
                }
              ]
            },
            {
              entity: Burn,
              type: 'one-to-many',
              field: 'burns',
              foreignKey: 'transaction',
              childRelations: [
                {
                  entity: Transaction,
                  type: 'one-to-one',
                  field: 'transaction'
                },
                {
                  entity: Pool,
                  type: 'one-to-one',
                  field: 'pool',
                  childRelations: [
                    {
                      entity: Token,
                      type: 'one-to-one',
                      field: 'token0'
                    },
                    {
                      entity: Token,
                      type: 'one-to-one',
                      field: 'token1'
                    }
                  ]
                }
              ]
            },
            {
              entity: Swap,
              type: 'one-to-many',
              field: 'swaps',
              foreignKey: 'transaction',
              childRelations: [
                {
                  entity: Transaction,
                  type: 'one-to-one',
                  field: 'transaction'
                },
                {
                  entity: Pool,
                  type: 'one-to-one',
                  field: 'pool',
                  childRelations: [
                    {
                      entity: Token,
                      type: 'one-to-one',
                      field: 'token0'
                    },
                    {
                      entity: Token,
                      type: 'one-to-one',
                      field: 'token1'
                    }
                  ]
                }
              ]
            }
          ]
        );
      },

      uniswapDayDatas: async (_: any, { block = {}, first, skip, orderBy, orderDirection, where }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('uniswapDayDatas', first, skip, orderBy, orderDirection, where);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('uniswapDayDatas').inc(1);

        return indexer.getEntities(UniswapDayData, block, where, { limit: first, skip, orderBy, orderDirection });
      },

      positions: async (_: any, { block = {}, first, where }: { block: BlockHeight, first: number, where: { [key: string]: any } }) => {
        log('positions', first, where);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('positions').inc(1);

        return indexer.getEntities(
          Position,
          block,
          where,
          { limit: first },
          [
            {
              entity: Pool,
              type: 'one-to-one',
              field: 'pool'
            },
            {
              entity: Token,
              type: 'one-to-one',
              field: 'token0'
            },
            {
              entity: Token,
              type: 'one-to-one',
              field: 'token1'
            },
            {
              entity: Tick,
              type: 'one-to-one',
              field: 'tickLower'
            },
            {
              entity: Tick,
              type: 'one-to-one',
              field: 'tickUpper'
            },
            {
              entity: Transaction,
              type: 'one-to-one',
              field: 'transaction'
            }
          ]
        );
      },

      blocks: async (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('blocks', first, orderBy, orderDirection, where);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('blocks').inc(1);

        return indexer.getBlockEntities(where, { limit: first, orderBy, orderDirection });
      },

      indexingStatusForCurrentVersion: async (_: any, { subgraphName }: { subgraphName: string }) => {
        log('health', subgraphName);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('indexingStatusForCurrentVersion').inc(1);

        return indexer.getIndexingStatus();
      }
    }
  };
};
