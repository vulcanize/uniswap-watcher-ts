//
// Copyright 2021 Vulcanize, Inc.
//

import debug from 'debug';
import assert from 'assert';

import { JobQueue } from '@cerc-io/util';
import { getConfig, getResetConfig, resetJobs } from '@vulcanize/util';

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
  const { dbConfig, serverConfig, ethClient, ethProvider } = await getResetConfig(config);

  // Initialize database.
  const db = new Database(dbConfig);
  await db.init();

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });

  const indexer = new Indexer(serverConfig, db, ethClient, ethProvider, jobQueue);

  const syncStatus = await indexer.getSyncStatus();
  assert(syncStatus, 'Missing syncStatus');

  await indexer.resetWatcherToBlock(argv.blockNumber);
  log('Reset watcher successfully');
};
