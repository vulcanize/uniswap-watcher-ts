//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import Decimal from 'decimal.js';
import { ValueTransformer } from 'typeorm';

import { getConfig } from './config';
import { JobQueue } from './job-queue';

/**
 * Method to wait for specified time.
 * @param time Time to wait in milliseconds
 */
export const wait = async (time: number): Promise<void> => new Promise(resolve => setTimeout(resolve, time));

/**
 * Transformer used by typeorm entity for Decimal type fields.
 */
export const decimalTransformer: ValueTransformer = {
  to: (value?: Decimal) => {
    if (value) {
      return value.toString();
    }

    return value;
  },
  from: (value?: string) => {
    if (value) {
      return new Decimal(value);
    }

    return value;
  }
};

/**
 * Transformer used by typeorm entity for bigint type fields.
 */
export const bigintTransformer: ValueTransformer = {
  to: (value?: bigint) => {
    if (value) {
      return value.toString();
    }

    return value;
  },
  from: (value?: string) => {
    if (value) {
      return BigInt(value);
    }

    return value;
  }
};

export const cleanJobs = async (configFile: string): Promise<void> => {
  const config = await getConfig(configFile);

  assert(config.server, 'Missing server config');

  const { jobQueue: jobQueueConfig } = config;

  const { dbConnectionString, maxCompletionLagInSecs } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag: maxCompletionLagInSecs });
  await jobQueue.start();
  await jobQueue.deleteAllJobs();
};

export const resetState = async (configFile: string, blockNumber: number): Promise<void> => {
  const config = await getConfig(configFile);
  assert(config.server, 'Missing server config');
  assert(blockNumber, 'Missing block number');
};
