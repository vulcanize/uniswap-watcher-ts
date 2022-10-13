//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';
import { PubSub } from 'apollo-server-express';

import { DEFAULT_CONFIG_PATH } from '@cerc-io/util';
import { EthClient } from '@cerc-io/ipld-eth-client';
import { getCache } from '@vulcanize/cache';
import { getConfig, fillBlocks, JobQueue, getCustomProvider } from '@vulcanize/util';

import { Database } from './database';
import { Indexer } from './indexer';
import { EventWatcher } from './events';

const log = debug('vulcanize:server');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).env(
    'FILL'
  ).options({
    configFile: {
      alias: 'f',
      type: 'string',
      require: true,
      demandOption: true,
      describe: 'configuration file path (toml)',
      default: DEFAULT_CONFIG_PATH
    },
    startBlock: {
      type: 'number',
      require: true,
      demandOption: true,
      describe: 'Block number to start processing at'
    },
    endBlock: {
      type: 'number',
      require: true,
      demandOption: true,
      describe: 'Block number to stop processing at'
    },
    prefetch: {
      type: 'boolean',
      default: false,
      describe: 'Block and events prefetch mode'
    },
    batchBlocks: {
      type: 'number',
      default: 10,
      describe: 'Number of blocks prefetched in batch'
    },
    blockCid: {
      type: 'boolean',
      default: false,
      describe: 'Only fetch and update block CIDs'
    }
  }).argv;

  const config = await getConfig(argv.configFile);

  assert(config.server, 'Missing server config');

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const { ethServer: { gqlApiEndpoint, rpcProviderEndpoint, blockDelayInMilliSecs }, cache: cacheConfig } = upstream;

  const cache = await getCache(cacheConfig);
  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    cache
  });

  const ethProvider = getCustomProvider(rpcProviderEndpoint);

  // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
  // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
  const pubsub = new PubSub();

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, ethClient, ethProvider, jobQueue);

  const eventWatcher = new EventWatcher(upstream, ethClient, indexer, pubsub, jobQueue);

  assert(jobQueueConfig, 'Missing job queue config');

  await fillBlocks(jobQueue, indexer, eventWatcher, blockDelayInMilliSecs, argv);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit();
});
