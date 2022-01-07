//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { DeepPartial, In } from 'typeorm';

import { JobQueueConfig } from './config';
import { JOB_KIND_INDEX, JOB_KIND_PRUNE, JOB_KIND_EVENTS, JOB_KIND_CONTRACT, MAX_REORG_DEPTH, QUEUE_BLOCK_PROCESSING, QUEUE_EVENT_PROCESSING, UNKNOWN_EVENT_NAME, JOB_KIND_FETCH_BLOCKS } from './constants';
import { JobQueue } from './job-queue';
import { EventInterface, IndexerInterface } from './types';
import { wait } from './misc';
import { createPruningJob, fetchBatchBlocks } from './common';
import { OrderDirection } from './database';

const DEFAULT_EVENTS_IN_BATCH = 50;

const log = debug('vulcanize:job-runner');

interface PrefetchedBlock {
  block: any;
  events: DeepPartial<EventInterface>[];
}

export class JobRunner {
  _indexer: IndexerInterface
  _jobQueue: JobQueue
  _jobQueueConfig: JobQueueConfig
  _blockProcessStartTime?: Date
  _prefetchedBlocksMap: { [key: string]: PrefetchedBlock } = {}
  _latestPrefetchedBlockNumber = -1

  constructor (jobQueueConfig: JobQueueConfig, indexer: IndexerInterface, jobQueue: JobQueue) {
    this._jobQueueConfig = jobQueueConfig;
    this._indexer = indexer;
    this._jobQueue = jobQueue;
  }

  async processBlock (job: any): Promise<void> {
    const { data: { kind } } = job;

    switch (kind) {
      case JOB_KIND_FETCH_BLOCKS:
        await this._fetchBlocks(job);
        break;

      case JOB_KIND_INDEX:
        await this._indexBlock(job);
        break;

      case JOB_KIND_PRUNE:
        await this._pruneChain(job);
        break;

      default:
        log(`Invalid Job kind ${kind} in QUEUE_BLOCK_PROCESSING.`);
        break;
    }

    await this._jobQueue.markComplete(job);
  }

  async processEvent (job: any): Promise<EventInterface | void> {
    const { data: { kind } } = job;

    switch (kind) {
      case JOB_KIND_EVENTS:
        await this._processEvents(job);
        break;

      case JOB_KIND_CONTRACT:
        await this._updateWatchedContracts(job);
        break;

      default:
        log(`Invalid Job kind ${kind} in QUEUE_EVENT_PROCESSING.`);
        break;
    }

    await this._jobQueue.markComplete(job);
  }

  async _fetchBlocks (job: any): Promise<void> {
    const { blockNumber } = job.data;
    let blocks = [];

    console.time('time:job-runner#processBlock-getSyncStatus');
    const syncStatus = await this._indexer.getSyncStatus();
    console.timeEnd('time:job-runner#processBlock-getSyncStatus');

    // Check if prefetchBlocksInMem flag set.
    if (this._jobQueueConfig.prefetchBlocksInMem) {
      // Dont wait for prefetching blocks.
      this._prefetchBlocks(blockNumber);

      log('size:job-runner#_fetchBlocks-_prefetchBlocksMap-size:', Object.keys(this._prefetchedBlocksMap).length);

      // Get blocks prefetched in memory.
      blocks = Object.values(this._prefetchedBlocksMap)
        .filter(({ block }) => Number(block.blockNumber) === blockNumber);
    }

    if (!blocks.length) {
      const blockProgressEntities = await this._indexer.getBlocksAtHeight(blockNumber, false);

      blocks = blockProgressEntities.map((block: any) => {
        block.timestamp = block.blockTimestamp;

        return block;
      });
    }

    // Fetch blocks from postgraphile.
    while (!blocks.length) {
      console.time('time:common#processBlockByNumber-postgraphile');
      blocks = await this._indexer.getBlocks({ blockNumber });
      console.timeEnd('time:common#processBlockByNumber-postgraphile');
    }

    for (const block of blocks) {
      const { blockHash, blockNumber, parentHash, timestamp } = block;

      // Stop blocks already pushed to job queue. They are already retried after fail.
      if (!syncStatus || syncStatus.chainHeadBlockNumber < blockNumber) {
        await this._jobQueue.pushJob(
          QUEUE_BLOCK_PROCESSING,
          {
            kind: JOB_KIND_INDEX,
            blockNumber: Number(blockNumber),
            blockHash,
            parentHash,
            timestamp
          }
        );
      }
    }

    await this._indexer.updateSyncStatusChainHead(blocks[0].blockHash, blocks[0].blockNumber);
  }

  async _pruneChain (job: any): Promise<void> {
    const { pruneBlockHeight } = job.data;

    console.time('time:job-runner#processBlock-getSyncStatus');
    const syncStatus = await this._indexer.getSyncStatus();
    console.timeEnd('time:job-runner#processBlock-getSyncStatus');
    assert(syncStatus);

    log(`Processing chain pruning at ${pruneBlockHeight}`);

    // Assert we're at a depth where pruning is safe.
    assert(syncStatus.latestIndexedBlockNumber >= (pruneBlockHeight + MAX_REORG_DEPTH));

    // Check that we haven't already pruned at this depth.
    if (syncStatus.latestCanonicalBlockNumber >= pruneBlockHeight) {
      log(`Already pruned at block height ${pruneBlockHeight}, latestCanonicalBlockNumber ${syncStatus.latestCanonicalBlockNumber}`);
    } else {
      // Check how many branches there are at the given height/block number.
      const blocksAtHeight = await this._indexer.getBlocksAtHeight(pruneBlockHeight, false);

      // Should be at least 1.
      assert(blocksAtHeight.length);

      let newCanonicalBlockHash;
      // We have more than one node at this height, so prune all nodes not reachable from indexed block at max reorg depth from prune height.
      // This will lead to orphaned nodes, which will get pruned at the next height.
      if (blocksAtHeight.length > 1) {
        const [indexedBlock] = await this._indexer.getBlocksAtHeight(pruneBlockHeight + MAX_REORG_DEPTH, false);

        // Get ancestor blockHash from indexed block at prune height.
        const ancestorBlockHash = await this._indexer.getAncestorAtDepth(indexedBlock.blockHash, MAX_REORG_DEPTH);
        newCanonicalBlockHash = ancestorBlockHash;

        const blocksToBePruned = blocksAtHeight.filter(block => ancestorBlockHash !== block.blockHash);

        if (blocksToBePruned.length) {
          // Mark blocks pruned which are not the ancestor block.
          await this._indexer.markBlocksAsPruned(blocksToBePruned);
        }
      } else {
        newCanonicalBlockHash = blocksAtHeight[0].blockHash;
      }

      // Update the canonical block in the SyncStatus.
      await this._indexer.updateSyncStatusCanonicalBlock(newCanonicalBlockHash, pruneBlockHeight);
    }
  }

  async _indexBlock (job: any): Promise<void> {
    const { data: { blockHash, blockNumber, parentHash, priority, timestamp } } = job;
    const indexBlockStartTime = new Date();

    console.time('time:job-runner#processBlock-getSyncStatus');
    const syncStatus = await this._indexer.getSyncStatus();
    console.timeEnd('time:job-runner#processBlock-getSyncStatus');
    assert(syncStatus);

    // Log time taken to complete processing of previous block.
    if (this._blockProcessStartTime) {
      const blockProcessDuration = indexBlockStartTime.getTime() - this._blockProcessStartTime.getTime();
      log(`time:job-runner#_indexBlock-process-block-${blockNumber - 1}: ${blockProcessDuration}ms`);
      log(`Total block process time (${blockNumber - 1}): ${blockProcessDuration}ms`);
    }

    this._blockProcessStartTime = indexBlockStartTime;
    log(`Processing block number ${blockNumber} hash ${blockHash} `);

    // Check if chain pruning is caught up.
    if ((syncStatus.latestIndexedBlockNumber - syncStatus.latestCanonicalBlockNumber) > MAX_REORG_DEPTH) {
      await createPruningJob(this._jobQueue, syncStatus.latestCanonicalBlockNumber, priority);

      const message = `Chain pruning not caught up yet, latest canonical block number ${syncStatus.latestCanonicalBlockNumber} and latest indexed block number ${syncStatus.latestIndexedBlockNumber}`;
      log(message);
      throw new Error(message);
    }

    console.time('time:job-runner#_indexBlock-getBlockProgressEntities');
    let [parentBlock, blockProgress] = await this._indexer.getBlockProgressEntities(
      {
        blockHash: In([parentHash, blockHash])
      },
      {
        order: {
          blockNumber: 'ASC'
        }
      }
    );
    console.timeEnd('time:job-runner#_indexBlock-getBlockProgressEntities');

    // Check if parent block has been processed yet, if not, push a high priority job to process that first and abort.
    // However, don't go beyond the `latestCanonicalBlockHash` from SyncStatus as we have to assume the reorg can't be that deep.
    if (blockHash !== syncStatus.latestCanonicalBlockHash) {
      // Create a higher priority job to index parent block and then abort.
      // We don't have to worry about aborting as this job will get retried later.
      const newPriority = (priority || 0) + 1;

      if (!parentBlock || parentBlock.blockHash !== parentHash) {
        const blocks = await this._indexer.getBlocks({ blockHash: parentHash });

        if (!blocks.length) {
          const message = `No blocks at parentHash ${parentHash}, aborting`;
          log(message);

          throw new Error(message);
        }

        const [{ blockNumber: parentBlockNumber, parentHash: grandparentHash, timestamp: parentTimestamp }] = blocks;

        await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, {
          kind: JOB_KIND_INDEX,
          blockHash: parentHash,
          blockNumber: parentBlockNumber,
          parentHash: grandparentHash,
          timestamp: parentTimestamp,
          priority: newPriority
        }, { priority: newPriority });

        const message = `Parent block number ${parentBlockNumber} hash ${parentHash} of block number ${blockNumber} hash ${blockHash} not fetched yet, aborting`;
        log(message);

        throw new Error(message);
      }

      if (!parentBlock.isComplete) {
        // Parent block indexing needs to finish before this block can be indexed.
        const message = `Indexing incomplete for parent block number ${parentBlock.blockNumber} hash ${parentHash} of block number ${blockNumber} hash ${blockHash}, aborting`;
        log(message);

        await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, {
          kind: JOB_KIND_INDEX,
          blockHash: parentHash,
          blockNumber: parentBlock.blockNumber,
          parentHash: parentBlock.parentHash,
          timestamp: parentBlock.blockTimestamp,
          priority: newPriority
        }, { priority: newPriority });

        throw new Error(message);
      } else {
        // Remove the unknown events of the parent block if it is marked complete.
        await this._indexer.removeUnknownEvents(parentBlock);
      }
    } else {
      blockProgress = parentBlock;
    }

    if (!blockProgress) {
      const prefetchedBlock = this._prefetchedBlocksMap[blockHash];
      const block = { blockHash, blockNumber, parentHash, blockTimestamp: timestamp };
      let events;

      if (prefetchedBlock) {
        ({ events } = prefetchedBlock);
      } else {
        // Delay required to process block.
        const { jobDelayInMilliSecs = 0 } = this._jobQueueConfig;
        await wait(jobDelayInMilliSecs);

        events = await this._indexer.fetchBlockEvents(block);
      }

      blockProgress = await this._indexer.saveBlockEvents(block, events);
      delete this._prefetchedBlocksMap[blockProgress.blockHash];
    }

    // Check if block has unprocessed events.
    if (blockProgress.numProcessedEvents < blockProgress.numEvents) {
      await this._jobQueue.pushJob(QUEUE_EVENT_PROCESSING, { kind: JOB_KIND_EVENTS, blockHash: blockProgress.blockHash, publish: true });
    }

    const indexBlockDuration = new Date().getTime() - indexBlockStartTime.getTime();
    log(`time:job-runner#_indexBlock: ${indexBlockDuration}ms`);
  }

  async _processEvents (job: any): Promise<void> {
    const { blockHash } = job.data;

    console.time('time:job-runner#_processEvents-get-block-progress');
    let block = await this._indexer.getBlockProgress(blockHash);
    console.timeEnd('time:job-runner#_processEvents-get-block-progress');
    assert(block);

    console.time('time:job-runner#_processEvents-events');

    while (!block.isComplete) {
      console.time('time:job-runner#_processEvents-fetching_events_batch');

      // Fetch events in batches
      const events: EventInterface[] = await this._indexer.getBlockEvents(
        blockHash,
        {
          index: [
            { value: block.lastProcessedEventIndex + 1, operator: 'gte', not: false }
          ]
        },
        {
          limit: this._jobQueueConfig.eventsInBatch || DEFAULT_EVENTS_IN_BATCH,
          orderBy: 'index',
          orderDirection: OrderDirection.asc
        }
      );

      console.timeEnd('time:job-runner#_processEvents-fetching_events_batch');

      if (events.length) {
        log(`Processing events batch from index ${events[0].index} to ${events[0].index + events.length - 1}`);
      }

      console.time('time:job-runner#_processEvents-processing_events_batch');

      for (let event of events) {
        // Process events in loop

        const eventIndex = event.index;
        // log(`Processing event ${event.id} index ${eventIndex}`);

        // Check if previous event in block has been processed exactly before this and abort if not.
        if (eventIndex > 0) { // Skip the first event in the block.
          const prevIndex = eventIndex - 1;

          if (prevIndex !== block.lastProcessedEventIndex) {
            throw new Error(`Events received out of order for block number ${block.blockNumber} hash ${block.blockHash},` +
            ` prev event index ${prevIndex}, got event index ${event.index} and lastProcessedEventIndex ${block.lastProcessedEventIndex}, aborting`);
          }
        }

        let watchedContract;

        if (!this._indexer.isWatchedContract) {
          // uni-info-watcher indexer doesn't have watched contracts implementation.
          watchedContract = true;
        } else {
          watchedContract = await this._indexer.isWatchedContract(event.contract);
        }

        if (watchedContract) {
          // We might not have parsed this event yet. This can happen if the contract was added
          // as a result of a previous event in the same block.
          if (event.eventName === UNKNOWN_EVENT_NAME) {
            const logObj = JSON.parse(event.extraInfo);

            assert(this._indexer.parseEventNameAndArgs);
            assert(typeof watchedContract !== 'boolean');
            const { eventName, eventInfo } = this._indexer.parseEventNameAndArgs(watchedContract.kind, logObj);

            event.eventName = eventName;
            event.eventInfo = JSON.stringify(eventInfo);
            event = await this._indexer.saveEventEntity(event);
          }

          await this._indexer.processEvent(event);
        }

        // Check for lazy update blockProgress.
        if (this._jobQueueConfig.lazyUpdateBlockProgress) {
          block.lastProcessedEventIndex = event.index;
          block.numProcessedEvents++;

          if (block.numProcessedEvents >= block.numEvents) {
            block.isComplete = true;
          }
        } else {
          block = await this._indexer.updateBlockProgress(block, event.index);
        }
      }

      console.timeEnd('time:job-runner#_processEvents-processing_events_batch');
    }

    if (this._jobQueueConfig.lazyUpdateBlockProgress) {
      // Update in database at end of all events processing.
      await this._indexer.updateBlockProgress(block, block.lastProcessedEventIndex);
    }

    console.timeEnd('time:job-runner#_processEvents-events');
  }

  async _updateWatchedContracts (job: any): Promise<void> {
    const { data: { contract } } = job;

    assert(this._indexer.cacheContract);
    this._indexer.cacheContract(contract);
  }

  async _prefetchBlocks (blockNumber: number): Promise<void> {
    const halfPrefetchBlockCount = this._jobQueueConfig.prefetchBlockCount / 2;

    if (this._latestPrefetchedBlockNumber < 0) {
      // Set latest prefetched block number for the first time.
      this._latestPrefetchedBlockNumber = blockNumber + 1;
    }

    // Check if prefetched blocks are less than half.
    if (Object.keys(this._prefetchedBlocksMap).length < halfPrefetchBlockCount) {
      const blocksWithEvents = await fetchBatchBlocks(
        this._indexer,
        this._jobQueueConfig.blockDelayInMilliSecs,
        this._latestPrefetchedBlockNumber + 1,
        this._latestPrefetchedBlockNumber + halfPrefetchBlockCount
      );

      blocksWithEvents.forEach(({ block, events }) => {
        this._prefetchedBlocksMap[block.blockHash] = { block, events };
        this._latestPrefetchedBlockNumber = Number(block.blockNumber);
      });
    }
  }
}
