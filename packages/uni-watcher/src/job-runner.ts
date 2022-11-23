//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import debug from 'debug';

import { JobRunnerCmd } from '@cerc-io/cli';
import { startMetricsServer } from '@cerc-io/util';
import { Config, WatcherJobRunner as JobRunner } from '@vulcanize/util';

import { Indexer } from './indexer';
import { Database } from './database';

const log = debug('vulcanize:job-runner');

export const main = async (): Promise<any> => {
  const jobRunnerCmd = new JobRunnerCmd();

  const config: Config = await jobRunnerCmd.initConfig();
  await jobRunnerCmd.init(Database, Indexer);

  const jobQueue = jobRunnerCmd.jobQueue;
  const indexer = jobRunnerCmd.indexer as Indexer;
  assert(jobQueue);
  assert(indexer);

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

process.on('SIGINT', () => {
  log(`Exiting process ${process.pid} with code 0`);
  process.exit(0);
});
