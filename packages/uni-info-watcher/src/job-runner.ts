//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import debug from 'debug';

import { JobRunnerCmd } from '@cerc-io/cli';
import { startMetricsServer } from '@cerc-io/util';
import { Config, JobRunner } from '@vulcanize/util';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';

import { Indexer } from './indexer';
import { Database } from './database';

const log = debug('vulcanize:job-runner');

export const main = async (): Promise<any> => {
  const jobRunnerCmd = new JobRunnerCmd();

  const config: Config = await jobRunnerCmd.initConfig();
  const {
    uniWatcher,
    tokenWatcher
  } = config.upstream;

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);

  await jobRunnerCmd.init(Database, { uniClient, erc20Client });
  await jobRunnerCmd.initIndexer(Indexer);

  const jobQueue = jobRunnerCmd.jobQueue;
  const indexer = jobRunnerCmd.indexer as Indexer;
  assert(jobQueue);
  assert(indexer);

  await indexer.addContracts();

  const jobRunner = new JobRunner(config.jobQueue, indexer, jobQueue);
  await jobRunner.start();

  await startMetricsServer(config, indexer);
};

main().then(() => {
  log('Starting job runner...');
}).catch(err => {
  log(err);
});

process.on('uncaughtException', err => {
  log('uncaughtException', err);
});
