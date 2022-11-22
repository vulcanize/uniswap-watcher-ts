//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import express, { Application } from 'express';
import { PubSub } from 'graphql-subscriptions';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';
import 'graphql-import-node';

import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { Config } from '@vulcanize/util';
import { createAndStartServer, DEFAULT_CONFIG_PATH, JobQueue, getCustomProvider, startGQLMetricsServer, getConfig } from '@cerc-io/util';
import { getCache } from '@cerc-io/cache';
import { EthClient } from '@cerc-io/ipld-eth-client';

import typeDefs from './schema';

import { createResolvers as createMockResolvers } from './mock/resolvers';
import { createResolvers } from './resolvers';
import { Indexer } from './indexer';
import { Database } from './database';
import { EventWatcher } from './events';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv))
    .option('f', {
      alias: 'config-file',
      demandOption: true,
      describe: 'configuration file path (toml)',
      type: 'string',
      default: DEFAULT_CONFIG_PATH
    })
    .argv;

  const config: Config = await getConfig(argv.f);

  assert(config.server, 'Missing server config');

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig, config.server);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const {
    ethServer: {
      gqlApiEndpoint,
      rpcProviderEndpoint
    },
    uniWatcher,
    tokenWatcher,
    cache: cacheConfig
  } = upstream;

  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    cache
  });

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);
  const ethProvider = getCustomProvider(rpcProviderEndpoint);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, { uniClient, erc20Client, ethClient }, ethProvider, jobQueue);

  const pubSub = new PubSub();
  const eventWatcher = new EventWatcher(ethClient, indexer, pubSub, jobQueue);
  // Delete jobs to prevent creating jobs after completion of processing previous block.
  await jobQueue.deleteAllJobs();
  await eventWatcher.start();

  const resolvers = process.env.MOCK ? await createMockResolvers() : await createResolvers(indexer, eventWatcher);

  // Create an Express app and server
  const app: Application = express();
  const server = createAndStartServer(app, typeDefs, resolvers, config.server);

  await startGQLMetricsServer(config);

  return { app, server };
};

main().then(() => {
  log('Starting server...');
}).catch(err => {
  log(err);
});

process.on('uncaughtException', err => {
  log('uncaughtException', err);
});

process.on('SIGINT', () => {
  log(`Exiting process ${process.pid} with code 0`);
  process.exit(0);
});
