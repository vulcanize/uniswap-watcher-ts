//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';

import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';
import {
  getConfig,
  JobQueue,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING,
  JobRunner as BaseJobRunner,
  JobQueueConfig,
  DEFAULT_CONFIG_PATH,
  getCustomProvider,
  startMetricsServer
} from '@vulcanize/util';

import { Indexer } from './indexer';
import { Database } from './database';

const log = debug('vulcanize:job-runner');

export class JobRunner {
  _indexer: Indexer
  _jobQueue: JobQueue
  _baseJobRunner: BaseJobRunner
  _jobQueueConfig: JobQueueConfig

  constructor (jobQueueConfig: JobQueueConfig, indexer: Indexer, jobQueue: JobQueue) {
    this._jobQueueConfig = jobQueueConfig;
    this._indexer = indexer;
    this._jobQueue = jobQueue;
    this._baseJobRunner = new BaseJobRunner(this._jobQueueConfig, this._indexer, this._jobQueue);
  }

  async start (): Promise<void> {
    await this.subscribeBlockProcessingQueue();
    await this.subscribeEventProcessingQueue();
  }

  async subscribeBlockProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_BLOCK_PROCESSING, async (job) => {
      await this._baseJobRunner.processBlock(job);
    });
  }

  async subscribeEventProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
      await this._baseJobRunner.processEvent(job);
    });
  }
}

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

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig, server: { mode }, metrics } = config;

  assert(dbConfig, 'Missing database config');

  const db = new Database(dbConfig);
  await db.init();

  assert(upstream, 'Missing upstream config');

  const {
    uniWatcher: {
      gqlEndpoint,
      gqlSubscriptionEndpoint
    },
    tokenWatcher,
    cache: cacheConfig,
    ethServer: {
      gqlApiEndpoint,
      rpcProviderEndpoint
    }
  } = upstream;

  assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');
  assert(gqlEndpoint, 'Missing upstream uniWatcher.gqlEndpoint');
  assert(gqlSubscriptionEndpoint, 'Missing upstream uniWatcher.gqlSubscriptionEndpoint');

  const cache = await getCache(cacheConfig);

  const ethClient = new EthClient({
    gqlEndpoint: gqlApiEndpoint,
    cache
  });

  const uniClient = new UniClient({
    gqlEndpoint,
    gqlSubscriptionEndpoint
  });

  const erc20Client = new ERC20Client(tokenWatcher);
  const ethProvider = getCustomProvider(rpcProviderEndpoint);

  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(db, uniClient, erc20Client, ethClient, ethProvider, jobQueue, mode);
  await indexer.init();

  if (mode !== 'demo') {
    await indexer.addContracts();
  }

  const jobRunner = new JobRunner(jobQueueConfig, indexer, jobQueue);
  await jobRunner.start();

  await startMetricsServer(metrics.host, metrics.port);
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
