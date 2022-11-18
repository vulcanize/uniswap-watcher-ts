//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';

import { JobQueue } from '@cerc-io/util';
import {
  getConfig,
  getResetConfig
} from '@vulcanize/util';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';

import { Database } from '../src/database';
import { Indexer } from '../src/indexer';

const CONFIG_FILE = './environments/test.toml';

const watchContract = async (indexer: Indexer, address: string, kind: string): Promise<void> => {
  const watchedContract = indexer.isWatchedContract(address);

  if (!watchedContract) {
    await indexer.watchContract(address, kind, true, 100);
  }
};

const main = async () => {
  // Get config.
  const config = await getConfig(CONFIG_FILE);

  const { upstream, database: dbConfig, jobQueue: jobQueueConfig, server: serverConfig } = config;

  assert(dbConfig, 'Missing dbConfig.');
  // Initialize database.
  const db = new Database(dbConfig, serverConfig);
  await db.init();

  // Initialize uniClient.
  assert(upstream, 'Missing upstream config');
  const { uniWatcher: { gqlEndpoint, gqlSubscriptionEndpoint }, tokenWatcher } = upstream;
  const uniClient = new UniClient({
    gqlEndpoint,
    gqlSubscriptionEndpoint
  });

  const erc20Client = new ERC20Client(tokenWatcher);

  const { ethClient, ethProvider } = await getResetConfig(config);

  assert(jobQueueConfig, 'Missing job queue config');
  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();

  const indexer = new Indexer(config.server, db, uniClient, erc20Client, ethClient, ethProvider, jobQueue);
  await indexer.init();

  // Get the factory contract address.
  const factoryContract = await uniClient.getContract('factory');
  assert(factoryContract !== null, 'Factory contract not available');

  // Get the NFPM contract address.
  const nfpmContract = await uniClient.getContract('nfpm');
  assert(nfpmContract !== null, 'NFPM contract not available');

  // Watch factory contract.
  await watchContract(indexer, factoryContract.address, 'factory');
  // Watch NFPM contract.
  await watchContract(indexer, nfpmContract.address, 'nfpm');

  // Closing the database.
  await db.close();
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
