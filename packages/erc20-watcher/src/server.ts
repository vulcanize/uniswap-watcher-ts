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

import { getCache } from '@cerc-io/cache';
import {
  KIND_ACTIVE,
  DEFAULT_CONFIG_PATH,
  createAndStartServer,
  JobQueue,
  getCustomProvider
} from '@cerc-io/util';
import { getConfig, startGQLMetricsServer } from '@vulcanize/util';
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

  const config = await getConfig(argv.f);

  assert(config.server, 'Missing server config');

  const { kind: watcherKind } = config.server;

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const { ethServer: { gqlApiEndpoint, rpcProviderEndpoint }, cache: cacheConfig } = upstream;
  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    cache
  });

  const ethProvider = getCustomProvider(rpcProviderEndpoint);

  // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
  // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
  const pubsub = new PubSub();

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue);

  const eventWatcher = new EventWatcher(upstream, ethClient, indexer, pubsub, jobQueue);

  if (watcherKind === KIND_ACTIVE) {
    await jobQueue.start();
    // Delete jobs to prevent creating jobs after completion of processing previous block.
    await jobQueue.deleteAllJobs();
    await eventWatcher.start();
  }

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
