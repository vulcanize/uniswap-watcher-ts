//
// Copyright 2021 Vulcanize, Inc.
//

import { cleanJobs, getConfig, getResetConfig } from '@vulcanize/util';
import debug from 'debug';
import { MoreThan } from 'typeorm';

import { Database } from '../../database';
import { BlockProgress } from '../../entity/BlockProgress';
import { Factory } from '../../entity/Factory';
import { Bundle } from '../../entity/Bundle';
import { Pool } from '../../entity/Pool';
import { Mint } from '../../entity/Mint';
import { Burn } from '../../entity/Burn';
import { Swap } from '../../entity/Swap';
import { PositionSnapshot } from '../../entity/PositionSnapshot';
import { Position } from '../../entity/Position';
import { Token } from '../../entity/Token';

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
    const removeEntitiesPromise = [BlockProgress, Factory, Bundle, Pool, Mint, Burn, Swap, PositionSnapshot, Position, Token].map(async entity => {
      return db.removeEntities<any>(dbTx, entity, { blockNumber: MoreThan(argv.blockNumber) });
    });

    await Promise.all(removeEntitiesPromise);

    dbTx.commitTransaction();
  } catch (error) {
    await dbTx.rollbackTransaction();
    throw error;
  } finally {
    await dbTx.release();
  }

  log('Reset state successfully');
};
