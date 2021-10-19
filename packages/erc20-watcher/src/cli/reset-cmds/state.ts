//
// Copyright 2021 Vulcanize, Inc.
//

import { cleanJobs, getConfig, getResetConfig } from '@vulcanize/util';
import debug from 'debug';
import { MoreThan } from 'typeorm';
import assert from 'assert';

import { Database } from '../../database';
import { BlockProgress } from '../../entity/BlockProgress';
import { Indexer } from '../../indexer';

const log = debug('vulcanize:reset-job-queue');

export const command = 'state';

export const desc = 'Reset state to block number';

export const builder = {
  blockNumber: {
    type: 'number'
  }
};

export const handler = async (argv: any): Promise<void> => {
  const config = await getConfig(argv.configFile);
  await cleanJobs(config);
  const { dbConfig, serverConfig, ethClient, ethProvider } = await getResetConfig(config);

  // Initialize database.
  const db = new Database(dbConfig);
  await db.init();

  const indexer = new Indexer(db, ethClient, ethProvider, serverConfig.mode);

  const syncStatus = await indexer.getSyncStatus();
  assert(syncStatus, 'Missing Sync status');
  const [blockProgress] = await indexer.getBlocksAtHeight(argv.blockNumber, false);
  assert(blockProgress, 'Block missing at specified block number');

  const dbTx = await db.createTransactionRunner();

  try {
    await db.removeEntities(dbTx, BlockProgress, { blockNumber: MoreThan(blockProgress.blockNumber) });

    if (syncStatus.latestIndexedBlockNumber > blockProgress.blockNumber) {
      await indexer.updateSyncStatusIndexedBlock(blockProgress.blockHash, blockProgress.blockNumber, true);
    }

    if (syncStatus.latestCanonicalBlockNumber > blockProgress.blockNumber) {
      await indexer.updateSyncStatusCanonicalBlock(blockProgress.blockHash, blockProgress.blockNumber, true);
    }

    dbTx.commitTransaction();
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }

  log('Reset state successfully');
};
