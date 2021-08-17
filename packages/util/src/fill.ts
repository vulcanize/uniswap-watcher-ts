//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { EthClient } from '@vulcanize/ipld-eth-client';

import { JobQueue } from './job-queue';
import { QUEUE_BLOCK_PROCESSING } from './constants';
import { jobQueueConfig } from './config';
import { DatabaseInterface } from './index';

const log = debug('vulcanize:fill');

export const fillBlocks = async (
  db: DatabaseInterface,
  ethClient: EthClient,
  jobQueueConfig: jobQueueConfig,
  { startBlock, endBlock }: { startBlock: number, endBlock: number}
): Promise<any> => {
  const { dbConnectionString, maxCompletionLag } = jobQueueConfig;
  assert(dbConnectionString, 'Missing job queue db connection string');

  const jobQueue = new JobQueue({ dbConnectionString, maxCompletionLag });
  await jobQueue.start();

  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    log(`Fill block ${blockNumber}`);

    // TODO: Add pause between requests so as to not overwhelm the upsteam server.
    const result = await ethClient.getBlockWithTransactions({ blockNumber });
    const { allEthHeaderCids: { nodes: blockNodes } } = result;
    for (let bi = 0; bi < blockNodes.length; bi++) {
      const { blockHash, blockNumber, parentHash, timestamp } = blockNodes[bi];
      const blockProgress = await db.getBlockProgress(blockHash);

      if (blockProgress) {
        log(`Block number ${blockNumber}, block hash ${blockHash} already known, skip filling`);
      } else {
        await jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, { blockHash, blockNumber, parentHash, timestamp });
      }
    }
  }
};
