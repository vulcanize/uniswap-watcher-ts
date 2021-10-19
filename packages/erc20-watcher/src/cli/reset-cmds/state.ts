//
// Copyright 2021 Vulcanize, Inc.
//

import { cleanJobs, getConfig, getResetConfig } from '@vulcanize/util';
import debug from 'debug';
import { MoreThan } from 'typeorm';

import { Database } from '../../database';
import { BlockProgress } from '../../entity/BlockProgress';

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
  const dbConfig = getResetConfig(config);

  // Initialize database.
  const db = new Database(dbConfig);
  await db.init();

  const dbTx = await db.createTransactionRunner();

  try {
    await db.removeEntities(dbTx, BlockProgress, { blockNumber: MoreThan(argv.blockNumber) });

    dbTx.commitTransaction();
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }

  log('Reset state successfully');
};
