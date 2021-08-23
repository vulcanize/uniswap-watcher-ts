//
// Copyright 2021 Vulcanize, Inc.
//

import { gql } from '@apollo/client/core';
import { GraphQLClient, GraphQLConfig } from '@vulcanize/ipld-eth-client';

import { BlockHeight } from './indexer';
import { queryBundles, queryFactories, queryPoolById, queryTicks, queryToken } from './queries';

export class Client {
  _config: GraphQLConfig;
  _client: GraphQLClient;

  constructor (config: GraphQLConfig) {
    this._config = config;

    this._client = new GraphQLClient(config);
  }

  async getToken (tokenId: string, block: BlockHeight): Promise<any> {
    const { token } = await this._client.query(
      gql(queryToken),
      {
        block,
        tokenId
      }
    );

    return token;
  }

  async getFactories (first: string, block: BlockHeight): Promise<any> {
    const { factories } = await this._client.query(
      gql(queryFactories),
      {
        block,
        first
      }
    );

    return factories;
  }

  async getBundles (first: string, block: BlockHeight): Promise<any> {
    const { bundles } = await this._client.query(
      gql(queryBundles),
      {
        block,
        first
      }
    );

    return bundles;
  }

  async getPoolById (id: string): Promise<any> {
    const { pool } = await this._client.query(
      gql(queryPoolById),
      {
        id
      }
    );

    return pool;
  }

  async getTicks (where: any, skip: number, first: number, block: BlockHeight): Promise<any> {
    const { ticks } = await this._client.query(
      gql(queryTicks),
      {
        where,
        skip,
        first,
        block
      }
    );

    return ticks;
  }
}
