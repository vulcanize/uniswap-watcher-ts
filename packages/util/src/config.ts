//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import fs from 'fs-extra';
import path from 'path';
import toml from 'toml';
import debug from 'debug';
import { ConnectionOptions } from 'typeorm';

import { BaseProvider } from '@ethersproject/providers';
import { Config as CacheConfig, getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';

import { getCustomProvider } from './misc';

const log = debug('vulcanize:config');

export interface JobQueueConfig {
  dbConnectionString: string;
  maxCompletionLagInSecs: number;
  jobDelayInMilliSecs?: number;
  eventsInBatch: number;
  lazyUpdateBlockProgress?: boolean;
  subgraphEventsOrder: boolean;
}

interface ServerConfig {
  host: string;
  port: number;
  mode: string;
  kind: string;
}

interface MetricsConfig {
  host: string;
  port: number;
}

export interface UpstreamConfig {
  cache: CacheConfig,
  ethServer: {
    gqlApiEndpoint: string;
    rpcProviderEndpoint: string;
    blockDelayInMilliSecs: number;
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
  ethProvider: BaseProvider
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
