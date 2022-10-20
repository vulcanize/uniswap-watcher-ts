//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import toml from 'toml';
import debug from 'debug';
import { ConnectionOptions } from 'typeorm';
import { providers } from 'ethers';

import { Config as CacheConfig, getCache } from '@vulcanize/cache';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { JobQueueConfig, ServerConfig } from '@cerc-io/util';

import { getCustomProvider } from './misc';

const log = debug('vulcanize:config');

export interface GQLMetricsConfig {
  port: number;
}

export interface MetricsConfig {
  host: string;
  port: number;
  gql: GQLMetricsConfig;
}

export interface UpstreamConfig {
  cache: CacheConfig,
  ethServer: {
    gqlApiEndpoint: string;
    rpcProviderEndpoint: string;
  }
  traceProviderEndpoint: string;
  uniWatcher: {
    gqlEndpoint: string;
    gqlSubscriptionEndpoint: string;
  };
  tokenWatcher: {
    gqlEndpoint: string;
    gqlSubscriptionEndpoint: string;
  }
}

export interface Config {
  server: ServerConfig;
  database: ConnectionOptions;
  upstream: UpstreamConfig;
  jobQueue: JobQueueConfig;
  metrics: MetricsConfig;
}

export const getConfig = async (configFile: string): Promise<Config> => {
  const configFilePath = path.resolve(configFile);
  const fileExists = await fs.pathExists(configFilePath);
  if (!fileExists) {
    throw new Error(`Config file not found: ${configFilePath}`);
  }

  const config = toml.parse(await fs.readFile(configFilePath, 'utf8'));
  log('config', JSON.stringify(config, null, 2));

  return config;
};

export const getResetConfig = async (config: Config): Promise<{
  dbConfig: ConnectionOptions,
  serverConfig: ServerConfig,
  upstreamConfig: UpstreamConfig,
  ethClient: EthClient,
  ethProvider: providers.BaseProvider
}> => {
  const { database: dbConfig, upstream: upstreamConfig, server: serverConfig } = config;

  assert(serverConfig, 'Missing server config');
  assert(dbConfig, 'Missing database config');

  assert(upstreamConfig, 'Missing upstream config');
  const { ethServer: { gqlApiEndpoint, rpcProviderEndpoint }, cache: cacheConfig } = upstreamConfig;
  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');
  assert(rpcProviderEndpoint, 'Missing upstream ethServer.rpcProviderEndpoint');

  const cache = await getCache(cacheConfig);

  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    cache
  });

  const ethProvider = getCustomProvider(rpcProviderEndpoint);

  return {
    dbConfig,
    serverConfig,
    upstreamConfig,
    ethClient,
    ethProvider
  };
};
