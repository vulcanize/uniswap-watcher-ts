//
// Copyright 2022 Vulcanize, Inc.
//

import assert from 'assert';
import 'reflect-metadata';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import debug from 'debug';
import { PubSub } from 'apollo-server-express';
import fs from 'fs';
import path from 'path';

import { getConfig, JobQueue, DEFAULT_CONFIG_PATH, Config, initClients, StateKind } from '@cerc-io/util';
import { fillBlocks } from '@vulcanize/util';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import * as codec from '@ipld/dag-cbor';

import { Database } from '../database';
import { Indexer } from '../indexer';
import { EventWatcher } from '../events';
import { State } from '../entity/State';

const log = debug('vulcanize:import-state');

export const main = async (): Promise<any> => {
  const argv = await yargs(hideBin(process.argv)).parserConfiguration({
    'parse-numbers': false
  }).options({
    configFile: {
      alias: 'f',
      type: 'string',
      demandOption: true,
      describe: 'configuration file path (toml)',
      default: DEFAULT_CONFIG_PATH
    },
    importFile: {
      alias: 'i',
      type: 'string',
      demandOption: true,
      describe: 'Import file path (JSON)'
    }
  }).argv;

  const config: Config = await getConfig(argv.configFile);
  const { ethClient, ethProvider } = await initClients(config);

  const db = new Database(config.database);
  await db.init();

  // Note: In-memory pubsub works fine for now, as each watcher is a single process anyway.
  // Later: https://www.apollographql.com/docs/apollo-server/data/subscriptions/#production-pubsub-libraries
  const pubsub = new PubSub();

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

  const indexer = new Indexer(config.server, db, uniClient, erc20Client, ethClient, ethProvider, jobQueue);
  await indexer.init();

  const eventWatcher = new EventWatcher(config.upstream, ethClient, indexer, pubsub, jobQueue);

  // Import data.
  const importFilePath = path.resolve(argv.importFile);
  const encodedImportData = fs.readFileSync(importFilePath);
  const importData = codec.decode(Buffer.from(encodedImportData)) as any;

  // Fill the snapshot block.
  await fillBlocks(
    jobQueue,
    indexer,
    eventWatcher,
    config.upstream.ethServer.blockDelayInMilliSecs,
    {
      prefetch: true,
      startBlock: importData.snapshotBlock.blockNumber,
      endBlock: importData.snapshotBlock.blockNumber
    }
  );

  // Fill the Contracts.
  for (const contract of importData.contracts) {
    await indexer.watchContract(contract.address, contract.kind, contract.checkpoint, contract.startingBlock);
  }

  // Get the snapshot block.
  const block = await indexer.getBlockProgress(importData.snapshotBlock.blockHash);
  assert(block);

  // Fill the IPLDBlocks.
  for (const checkpoint of importData.ipldCheckpoints) {
    let ipldBlock = new State();

    ipldBlock = Object.assign(ipldBlock, checkpoint);
    ipldBlock.block = block;

    ipldBlock.data = Buffer.from(codec.encode(ipldBlock.data));

    ipldBlock = await indexer.saveOrUpdateState(ipldBlock);
    await indexer.updateEntitiesFromIPLDState(ipldBlock);
  }

  // Mark snapshot block as completely processed.
  block.isComplete = true;
  await indexer.updateBlockProgress(block, block.lastProcessedEventIndex);
  await indexer.updateSyncStatusChainHead(block.blockHash, block.blockNumber);
  await indexer.updateSyncStatusIndexedBlock(block.blockHash, block.blockNumber);
  await indexer.updateStateSyncStatusIndexedBlock(block.blockNumber);
  await indexer.updateStateSyncStatusCheckpointBlock(block.blockNumber);

  // The 'diff_staged' and 'init' IPLD blocks are unnecessary as checkpoints have been already created for the snapshot block.
  await indexer.removeStates(block.blockNumber, StateKind.Init);
  await indexer.removeStates(block.blockNumber, StateKind.DiffStaged);

  log(`Import completed for snapshot block at height ${block.blockNumber}`);
};

main().catch(err => {
  log(err);
}).finally(() => {
  process.exit(0);
});
