//
// Copyright 2022 Vulcanize, Inc.
//

import debug from 'debug';
import assert from 'assert';

import { getConfig, initClients, JobQueue } from '@cerc-io/util';
import { Config } from '@vulcanize/util';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';

import { Database } from '../../database';
import { Indexer } from '../../indexer';

const log = debug('vulcanize:checkpoint-create');

export const command = 'create';

export const desc = 'Create checkpoint';

export const builder = {
  address: {
    type: 'string',
    require: true,
    demandOption: true,
    describe: 'Contract address to create the checkpoint for.'
  },
  blockHash: {
    type: 'string',
    describe: 'Blockhash at which to create the checkpoint.'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const config: Config = await getConfig(argv.configFile);
  const { ethClient, ethProvider } = await initClients(config);

  const db = new Database(config.database, config.server);
  await db.init();

  const jobQueueConfig = config.jobQueue;
  assert(jobQueueConfig, 'Missing job queue config');

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const {
    uniWatcher,
    tokenWatcher
  } = config.upstream;

  const uniClient = new UniClient(uniWatcher);
  const erc20Client = new ERC20Client(tokenWatcher);

  const indexer = new Indexer(config.server, db, { uniClient, erc20Client, ethClient }, ethProvider, jobQueue);
  await indexer.init();

  const blockHash = await indexer.processCLICheckpoint(argv.address, argv.blockHash);

  log(`Created a checkpoint for contract ${argv.address} at block-hash ${blockHash}`);

  await db.close();
};
