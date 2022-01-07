import debug from 'debug';

import { JOB_KIND_PRUNE, QUEUE_BLOCK_PROCESSING, JOB_KIND_FETCH_BLOCKS } from './constants';
import { JobQueue } from './job-queue';
import { IndexerInterface } from './types';
import { wait } from './misc';

const log = debug('vulcanize:common');

/**
 * Create pruning job in QUEUE_BLOCK_PROCESSING.
 * @param jobQueue
 * @param latestCanonicalBlockNumber
 * @param priority
 */
export const createPruningJob = async (jobQueue: JobQueue, latestCanonicalBlockNumber: number, priority = 0): Promise<void> => {
  const pruneBlockHeight = latestCanonicalBlockNumber + 1;
  const newPriority = priority + 1;

  // Create a job to prune at block height (latestCanonicalBlockNumber + 1).
  return jobQueue.pushJob(
    QUEUE_BLOCK_PROCESSING,
    {
      kind: JOB_KIND_PRUNE,
      pruneBlockHeight,
      priority: newPriority
    },
    {
      priority: newPriority
    }
  );
};

/**
 * Method to fetch block by number and push to job queue.
 * @param jobQueue
 * @param indexer
 * @param ethClient
 * @param blockNumber
 */
export const processBlockByNumber = async (
  jobQueue: JobQueue,
  indexer: IndexerInterface,
  blockNumber: number
): Promise<void> => {
  log(`Process block ${blockNumber}`);

  await jobQueue.pushJob(
    QUEUE_BLOCK_PROCESSING,
    {
      kind: JOB_KIND_FETCH_BLOCKS,
      blockNumber
    }
  );
};

export const fetchBatchBlocks = async (indexer: IndexerInterface, blockDelayInMilliSecs: number, startBlock: number, endBlock: number): Promise<any[]> => {
  let blockNumbers = [...Array(endBlock - startBlock).keys()].map(n => n + startBlock);
  let blocks = [];

  // Fetch blocks again if there are missing blocks.
  while (true) {
    console.time('time:common#fetchBatchBlocks-getBlocks-postgraphile');
    const blockPromises = blockNumbers.map(async blockNumber => indexer.getBlocks({ blockNumber }));
    console.timeEnd('time:common#fetchBatchBlocks-getBlocks-postgraphile');

    const res = await Promise.all(blockPromises);
    const missingIndex = res.findIndex(blocks => blocks.length === 0);

    if (missingIndex < 0) {
      blocks = blocks.concat(res);
      break;
    }

    log('missing block number:', blockNumbers[missingIndex]);

    blocks.push(res.slice(0, missingIndex));
    blockNumbers = blockNumbers.slice(missingIndex);
    await wait(blockDelayInMilliSecs);
  }

  blocks = blocks.flat();

  const blockAndEventPromises = blocks.map(async block => {
    block.blockTimestamp = block.timestamp;
    const events = await indexer.fetchBlockEvents(block);

    return { block, events };
  });

  return Promise.all(blockAndEventPromises);
};
