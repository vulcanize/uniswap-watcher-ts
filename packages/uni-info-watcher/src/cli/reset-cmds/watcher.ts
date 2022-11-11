//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';
import assert from 'assert';

import { getConfig, getResetConfig, JobQueue, resetJobs } from '@vulcanize/util';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';

import { Database } from '../../database';
import { Indexer } from '../../indexer';

const log = debug('vulcanize:reset-watcher');

export const command = 'watcher';

export const desc = 'Reset watcher to a block number';

export const builder = {
  blockNumber: {
    type: 'number'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const config = await getConfig(argv.configFile);
  await resetJobs(config);
  const { jobQueue: jobQueueConfig } = config;
  const { dbConfig, upstreamConfig, ethClient, ethProvider } = await getResetConfig(config);

  // Initialize database.
  const db = new Database(dbConfig, config.server);
  await db.init();

  const {
    uniWatcher,
    tokenWatcher
  } = upstreamConfig;

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, uniClient, erc20Client, ethClient, ethProvider, jobQueue);

  await indexer.resetWatcherToBlock(argv.blockNumber);
  await indexer.resetLatestEntities(argv.blockNumber);

  log('Reset watcher successfully');
};
