//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { ConnectionOptions } from 'typeorm';
import { getDefaultProvider } from 'ethers';

import { BaseProvider } from '@ethersproject/providers';
import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';

import { Config, ServerConfig, UpstreamConfig, JobQueueConfig } from './config';

export const initClients = async (config: Config): Promise<{
  dbConfig: ConnectionOptions,
  serverConfig: ServerConfig,
  upstreamConfig: UpstreamConfig,
  jobQueueConfig: JobQueueConfig
  ethClient: EthClient,
  postgraphileClient: EthClient,
  ethProvider: BaseProvider
}> => {
  const { database: dbConfig, upstream: upstreamConfig, server: serverConfig, jobQueue: jobQueueConfig } = config;

  assert(serverConfig, 'Missing server config');
  assert(dbConfig, 'Missing database config');
  assert(upstreamConfig, 'Missing upstream config');

  const { ethServer: { gqlApiEndpoint, gqlPostgraphileEndpoint, rpcProviderEndpoint }, cache: cacheConfig } = upstreamConfig;

  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');
  assert(gqlPostgraphileEndpoint, 'Missing upstream ethServer.gqlPostgraphileEndpoint');
  assert(rpcProviderEndpoint, 'Missing upstream ethServer.rpcProviderEndpoint');

  const cache = await getCache(cacheConfig);

  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  const postgraphileClient = new EthClient({
    gqlEndpoint: gqlPostgraphileEndpoint,
    cache
  });

  const ethProvider = getDefaultProvider(rpcProviderEndpoint);

  return {
    dbConfig,
    serverConfig,
    upstreamConfig,
    ethClient,
    postgraphileClient,
    ethProvider,
    jobQueueConfig
  };
};
