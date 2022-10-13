//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { getCache } from '@vulcanize/cache';
import { DEFAULT_CONFIG_PATH } from '@cerc-io/util';
import { getConfig, fillBlocks, JobQueue, getCustomProvider } from '@vulcanize/util';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { EthClient } from '@cerc-io/ipld-eth-client';

import { Database } from './database';
import { PubSub } from 'apollo-server-express';
import { Indexer } from './indexer';
import { EventWatcher } from './events';
import { fillState } from './cli/fill-state';

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
    state: {
      type: 'boolean',
      default: false,
      describe: 'Fill state for subgraph entities'
    },
    blockCid: {
      type: 'boolean',
      default: false,
      describe: 'Only fetch and update block CIDs'
    }
  }).argv;

  const config = await getConfig(argv.configFile);

  assert(config.server, 'Missing server config');

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig, server: { mode } } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');
  const { ethServer: { gqlApiEndpoint, rpcProviderEndpoint, blockDelayInMilliSecs }, cache: cacheConfig, uniWatcher, tokenWatcher } = upstream;

  const cache = await getCache(cacheConfig);

  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    cache
  });

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);
  const ethProvider = getCustomProvider(rpcProviderEndpoint);

  // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
  // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
  const pubsub = new PubSub();

  assert(jobQueueConfig, 'Missing job queue config');
  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, uniClient, erc20Client, ethClient, ethProvider, jobQueue);
  await indexer.init();

  if (argv.state) {
    await fillState(indexer, db, argv);
    return;
  }

  const eventWatcher = new EventWatcher(upstream, ethClient, indexer, pubsub, jobQueue);

  await fillBlocks(jobQueue, indexer, eventWatcher, blockDelayInMilliSecs, argv);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit();
});

process.on('SIGINT', () => {
  log(`Exiting process ${process.pid} with code 0`);
  process.exit(0);
});
