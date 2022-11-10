//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import BigInt from 'apollo-type-bigint';
import debug from 'debug';
import { GraphQLResolveInfo, GraphQLScalarType } from 'graphql';
import JSONbig from 'json-bigint';

import { gqlQueryCount, gqlTotalQueryCount, GraphDecimal } from '@vulcanize/util';
import { BlockHeight, OrderDirection, getResultState } from '@cerc-io/util';

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
import { Transaction } from './entity/Transaction';
import { PositionSnapshot } from './entity/PositionSnapshot';
import { TickDayData } from './entity/TickDayData';
import { TickHourData } from './entity/TickHourData';
import { Flash } from './entity/Flash';
import { Collect } from './entity/Collect';
import { PoolHourData } from './entity/PoolHourData';
import { EventWatcher } from './events';
import { FACTORY_ADDRESS, BUNDLE_ID } from './utils/constants';
import { CustomIndexer } from './custom-indexer';

const log = debug('vulcanize:resolver');

export { BlockHeight };

export const createResolvers = async (indexer: Indexer, customIndexer: CustomIndexer, eventWatcher: EventWatcher): Promise<any> => {
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
      bundle: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight }
      ) => {
        log('bundle', JSONbig.stringify({ id, block }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('bundle').inc(1);

        return indexer.getBundle(id, block);
      },

      bundles: async (_: any, { block = {}, first, skip }: { first: number, skip: number, block: BlockHeight }) => {
        log('bundles', JSONbig.stringify({ block, first, skip }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('bundles').inc(1);

        let where = {};
        if (!indexer._isDemo) {
          // Filter using address deployed on mainnet if not in demo mode
          where = { id: BUNDLE_ID };
        }

        return indexer.getEntities(Bundle, block, where, { limit: first, skip });
      },

      burns: async (
        _: any,
        { block = {}, first, skip, orderBy, orderDirection, where }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('burns', JSONbig.stringify({ block, first, orderBy, orderDirection, where, skip }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('burns').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return customIndexer.getEntities(
          Burn,
          block,
          where,
          { limit: first, orderBy, orderDirection, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      factories: async (
        _: any,
        { block = {}, first, skip }: { first: number, skip: number, block: BlockHeight }
      ) => {
        log('factories', JSONbig.stringify({ block, first, skip }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('factories').inc(1);

        let where = {};
        if (!indexer._isDemo) {
          // Filter using address deployed on mainnet if not in demo mode
          where = { id: FACTORY_ADDRESS };
        }

        return indexer.getEntities(Factory, block, where, { limit: first, skip });
      },

      mints: async (
        _: any,
        { block = {}, first, skip, orderBy, orderDirection, where }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('mints', JSONbig.stringify({ block, first, skip, orderBy, orderDirection, where }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('mints').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return customIndexer.getEntities(
          Mint,
          block,
          where,
          { limit: first, orderBy, orderDirection, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      pool: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('pool', JSONbig.stringify({ id, block }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('pool').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return indexer.getPool(id, block, info.fieldNodes[0].selectionSet.selections);
      },

      poolDayDatas: async (
        _: any,
        { block = {}, first, skip, orderBy, orderDirection, where }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('poolDayDatas', JSONbig.stringify({ block, first, skip, orderBy, orderDirection, where }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('poolDayDatas').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return customIndexer.getEntities(
          PoolDayData,
          block,
          where,
          { limit: first, orderBy, orderDirection, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      poolHourDatas: async (
        _: any,
        { block, first, skip }: { block: BlockHeight, first: number, skip: number },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('poolHourDatas', JSONbig.stringify({ block, first, skip }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('poolHourDatas').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return indexer.getEntities(
          PoolHourData,
          block,
          {},
          { limit: first, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      pools: async (
        _: any,
        { block = {}, first, skip, orderBy, orderDirection, where = {} }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('pools', JSONbig.stringify({ block, first, skip, orderBy, orderDirection, where }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('pools').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return customIndexer.getEntities(
          Pool,
          block,
          where,
          { limit: first, orderBy, orderDirection, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      swaps: async (
        _: any,
        { block = {}, first, skip, orderBy, orderDirection, where }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('swaps', JSONbig.stringify({ block, first, skip, orderBy, orderDirection, where }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('swaps').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return customIndexer.getEntities(
          Swap,
          block,
          where,
          { limit: first, orderBy, orderDirection, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      ticks: async (
        _: any,
        { block = {}, first, skip, where = {} }: { block: BlockHeight, first: number, skip: number, where: { [key: string]: any } },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('ticks', JSONbig.stringify({ block, first, skip, where }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('ticks').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return indexer.getEntities(
          Tick,
          block,
          where,
          { limit: first, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      token: async (
        _: any,
        { id, block = {} }: { id: string, block: BlockHeight },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('token', JSONbig.stringify({ id, block }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('token').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return indexer.getToken(id, block, info.fieldNodes[0].selectionSet.selections);
      },

      tokens: async (
        _: any,
        { block = {}, first, skip, orderBy, orderDirection, where }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('tokens', JSONbig.stringify({ block, orderBy, orderDirection, where, skip }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('tokens').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return customIndexer.getEntities(
          Token,
          block,
          where,
          { limit: first, skip, orderBy, orderDirection },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      tokenDayDatas: async (
        _: any,
        { block = {}, first, skip, orderBy, orderDirection, where }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('tokenDayDatas', JSONbig.stringify({ block, first, skip, orderBy, orderDirection, where }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('tokenDayDatas').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return customIndexer.getEntities(
          TokenDayData,
          block,
          where,
          { limit: first, orderBy, orderDirection, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      tokenHourDatas: async (
        _: any,
        { block = {}, first, skip, orderBy, orderDirection, where }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('tokenHourDatas', JSONbig.stringify({ block, first, skip, orderBy, orderDirection, where }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('tokenHourDatas').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return customIndexer.getEntities(
          TokenHourData,
          block,
          where,
          { limit: first, orderBy, orderDirection, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      transactions: async (
        _: any,
        { block = {}, first, skip, orderBy, orderDirection, where }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('transactions', JSONbig.stringify({ block, first, skip, orderBy, orderDirection }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('transactions').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return customIndexer.getEntities(
          Transaction,
          block,
          where,
          { limit: first, orderBy, orderDirection, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      uniswapDayDatas: async (
        _: any,
        { block = {}, first, skip, orderBy, orderDirection, where }: { block: BlockHeight, first: number, skip: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('uniswapDayDatas', JSONbig.stringify({ block, first, skip, orderBy, orderDirection, where }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('uniswapDayDatas').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return customIndexer.getEntities(
          UniswapDayData,
          block,
          where,
          { limit: first, orderBy, orderDirection, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      positions: async (
        _: any,
        { block = {}, first, skip, where }: { block: BlockHeight, first: number, skip: number, where: { [key: string]: any } },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('positions', JSONbig.stringify({ block, first, skip, where }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('positions').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return indexer.getEntities(
          Position,
          block,
          where,
          { limit: first, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      positionSnapshots: async (
        _: any,
        { block, first, skip }: { block: BlockHeight, first: number, skip: number },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('positionSnapshots', JSONbig.stringify({ block, first, skip }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('positionSnapshots').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return indexer.getEntities(
          PositionSnapshot,
          block,
          {},
          { limit: first, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      tickDayDatas: async (
        _: any,
        { block, first, skip }: { block: BlockHeight, first: number, skip: number },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('tickDayDatas', JSONbig.stringify({ block, first, skip }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('tickDayDatas').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return indexer.getEntities(
          TickDayData,
          block,
          {},
          { limit: first, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      tickHourDatas: async (
        _: any,
        { block, first, skip }: { block: BlockHeight, first: number, skip: number },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('tickHourDatas', JSONbig.stringify({ block, first, skip }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('tickHourDatas').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return indexer.getEntities(
          TickHourData,
          block,
          {},
          { limit: first, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      flashes: async (
        _: any,
        { block, first, skip }: { block: BlockHeight, first: number, skip: number },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('flashes', JSONbig.stringify({ block, first, skip }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('flashes').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return indexer.getEntities(
          Flash,
          block,
          {},
          { limit: first, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      collects: async (
        _: any,
        { block, first, skip }: { block: BlockHeight, first: number, skip: number },
        __: any,
        info: GraphQLResolveInfo
      ) => {
        log('collects', JSONbig.stringify({ block, first, skip }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('collects').inc(1);
        assert(info.fieldNodes[0].selectionSet);

        return indexer.getEntities(
          Collect,
          block,
          {},
          { limit: first, skip },
          info.fieldNodes[0].selectionSet.selections
        );
      },

      blocks: async (_: any, { first, orderBy, orderDirection, where }: { first: number, orderBy: string, orderDirection: OrderDirection, where: { [key: string]: any } }) => {
        log('blocks', JSONbig.stringify({ first, orderBy, orderDirection, where }));
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('blocks').inc(1);

        return indexer.getBlockEntities(where, { limit: first, orderBy, orderDirection });
      },

      indexingStatusForCurrentVersion: async (_: any, { subgraphName }: { subgraphName: string }) => {
        log('health', subgraphName);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('indexingStatusForCurrentVersion').inc(1);

        return indexer.getIndexingStatus();
      },

      getState: async (_: any, { blockHash, contractAddress, kind }: { blockHash: string, contractAddress: string, kind: string }) => {
        log('getState', blockHash, contractAddress, kind);
        gqlTotalQueryCount.inc(1);
        gqlQueryCount.labels('getState').inc(1);

        const state = await indexer.getPrevState(blockHash, contractAddress, kind);

        return state && state.block.isComplete ? getResultState(state) : undefined;
      }
    }
  };
};
