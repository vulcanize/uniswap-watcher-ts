//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { In } from 'typeorm';

import {
  JobQueueConfig,
  lastBlockNumEvents,
  lastBlockProcessDuration,
  lastProcessedBlockNumber,
  createPruningJob,
  PrefetchedBlock,
  fetchBlocks,
  JOB_KIND_INDEX,
  JOB_KIND_PRUNE,
  JOB_KIND_EVENTS,
  JOB_KIND_CONTRACT,
  MAX_REORG_DEPTH,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING,
  UNKNOWN_EVENT_NAME
} from '@cerc-io/util';

import { JobQueue } from './job-queue';
import { EventInterface, IndexerInterface } from './types';
import { wait } from './misc';

const log = debug('vulcanize:job-runner');

export class JobRunner {
  _indexer: IndexerInterface
  _jobQueue: JobQueue
  _jobQueueConfig: JobQueueConfig
  _blockProcessStartTime?: Date
  _blockNumEvents = 0

  _prefetchedBlocksMap: Map<string, PrefetchedBlock> = new Map()

  constructor (jobQueueConfig: JobQueueConfig, indexer: IndexerInterface, jobQueue: JobQueue) {
    this._jobQueueConfig = jobQueueConfig;
    this._indexer = indexer;
    this._jobQueue = jobQueue;
  }

  async processBlock (job: any): Promise<void> {
    const { data: { kind } } = job;

    switch (kind) {
      case JOB_KIND_INDEX: {
        const blocksToBeIndexed = await fetchBlocks(
          job,
          this._indexer,
          this._jobQueueConfig,
          this._prefetchedBlocksMap
        );
        const indexBlockPromises = blocksToBeIndexed.map(blockToBeIndexed => this._indexBlock(job, blockToBeIndexed));
        await Promise.all(indexBlockPromises);
        break;
      }

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

  async _pruneChain (job: any): Promise<void> {
    console.time('time:job-runner#_pruneChain');

    const syncStatus = await this._indexer.getSyncStatus();
    assert(syncStatus);

    const { pruneBlockHeight } = job.data;

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
    console.timeEnd('time:job-runner#_pruneChain');
  }

  async _indexBlock (job: any, blockToBeIndexed: any): Promise<void> {
    const syncStatus = await this._indexer.getSyncStatus();
    assert(syncStatus);

    const { data: { priority } } = job;
    const { cid, blockHash, blockNumber, parentHash, blockTimestamp } = blockToBeIndexed;

    const indexBlockStartTime = new Date();

    // Log time taken to complete processing of previous block.
    if (this._blockProcessStartTime) {
      const blockProcessDuration = indexBlockStartTime.getTime() - this._blockProcessStartTime.getTime();
      log(`time:job-runner#_indexBlock-process-block-${blockNumber - 1}: ${blockProcessDuration}ms`);
      log(`Total block process time (${blockNumber - 1}): ${blockProcessDuration}ms`);

      // Update metrics
      lastProcessedBlockNumber.set(blockNumber - 1);
      lastBlockProcessDuration.set(blockProcessDuration);
      lastBlockNumEvents.set(this._blockNumEvents);
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

        const [{ cid: parentCid, blockNumber: parentBlockNumber, parentHash: grandparentHash, timestamp: parentTimestamp }] = blocks;

        await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, {
          kind: JOB_KIND_INDEX,
          cid: parentCid,
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
          cid: parentBlock.cid,
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
      const prefetchedBlock = this._prefetchedBlocksMap.get(blockHash);
      const block = { blockHash, blockNumber, parentHash, blockTimestamp };
      let events;

      if (prefetchedBlock) {
        ({ events } = prefetchedBlock);
      } else {
        // Delay required to process block.
        const { jobDelayInMilliSecs = 0 } = this._jobQueueConfig;
        await wait(jobDelayInMilliSecs);

        events = await this._indexer.fetchBlockEvents(block);
      }

      console.time('time:job-runner#_indexBlock-saveBlockProgress');
      blockProgress = await this._indexer.saveBlockProgress({
        cid,
        blockHash,
        blockNumber,
        parentHash,
        blockTimestamp,
        numEvents: events.length,
        isComplete: events.length === 0
      });
      console.timeEnd('time:job-runner#_indexBlock-saveBlockProgress');
    }

    await this._indexer.processBlock(blockProgress);
    this._blockNumEvents = blockProgress.numEvents;

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

    if (!this._prefetchedBlocksMap.has(block.blockHash)) {
      const events = await this._indexer.fetchBlockEvents(block);
      this._prefetchedBlocksMap.set(block.blockHash, { block, events });
    }

    const prefetchedBlock = this._prefetchedBlocksMap.get(block.blockHash);
    assert(prefetchedBlock);

    const { events } = prefetchedBlock;

    let dbEvents = events.map(event => {
      event.block = block;
      return event as EventInterface;
    });

    if (events.length) {
      log(`Processing events for block ${block.blockNumber} hash ${block.blockHash}`);
    }

    console.time('time:job-runner#_processEvents-processing_events');
    const { subgraphEventsOrder = false } = this._jobQueueConfig;
    const unwatchedContractEvents: EventInterface[] = [];

    // In subgraph, events from contract created in the same block are processed after all other events.
    // Divide the events into watched | unwatched contract events.
    if (subgraphEventsOrder) {
      // Processing events out of order causes issue with restarts/kill at arbitrary times.
      // Events of contract, added to watch in processing an event, may not be processed at end after restart/kill.
      const watchedContractEvents: EventInterface[] = [];

      dbEvents.forEach(dbEvent => {
        if (this._indexer.isWatchedContract(dbEvent.contract)) {
          watchedContractEvents.push(dbEvent);
        } else {
          unwatchedContractEvents.push(dbEvent);
        }
      });

      dbEvents = watchedContractEvents;
    }

    for (const dbEvent of dbEvents) {
      if (dbEvent.index <= block.lastProcessedEventIndex) {
        continue;
      }
      // Process events in loop

      const eventIndex = dbEvent.index;
      // log(`Processing event ${event.id} index ${eventIndex}`);

      if (!subgraphEventsOrder) {
        // Check if previous event in block has been processed exactly before this and abort if not.
        // Skip check incase of subgraphEventsOrder.
        if (eventIndex > 0) { // Skip the first event in the block.
          const prevIndex = eventIndex - 1;

          if (prevIndex !== block.lastProcessedEventIndex) {
            throw new Error(`Events received out of order for block number ${block.blockNumber} hash ${block.blockHash},` +
            ` prev event index ${prevIndex}, got event index ${dbEvent.index} and lastProcessedEventIndex ${block.lastProcessedEventIndex}, aborting`);
          }
        }
      }

      const watchedContract = this._indexer.isWatchedContract(dbEvent.contract);

      if (watchedContract) {
        // We might not have parsed this event yet. This can happen if the contract was added
        // as a result of a previous event in the same block.
        if (dbEvent.eventName === UNKNOWN_EVENT_NAME) {
          const logObj = JSON.parse(dbEvent.extraInfo);

          assert(this._indexer.parseEventNameAndArgs);
          assert(typeof watchedContract !== 'boolean');
          const { eventName, eventInfo } = this._indexer.parseEventNameAndArgs(watchedContract.kind, logObj);

          dbEvent.eventName = eventName;
          dbEvent.eventInfo = JSON.stringify(eventInfo);
        }

        await this._indexer.processEvent(dbEvent);
      }

      // Check for lazy update blockProgress.
      if (this._jobQueueConfig.lazyUpdateBlockProgress) {
        block.lastProcessedEventIndex = dbEvent.index;
        block.numProcessedEvents++;
      } else {
        block = await this._indexer.updateBlockProgress(block, dbEvent.index);
      }
    }

    if (subgraphEventsOrder) {
      // Process events from contracts not watched initially.
      // Note: events not "unknown" even if for unwatched contracts.
      // (uni-watcher has already parsed the events for unwatched contracts)
      for (const dbEvent of unwatchedContractEvents) {
        const watchedContract = this._indexer.isWatchedContract(dbEvent.contract);

        if (watchedContract) {
          // Events of contract added in same block might be processed multiple times.
          // This is because there is no check for lastProcessedEventIndex against these events.
          await this._indexer.processEvent(dbEvent);
        }

        block = await this._indexer.updateBlockProgress(
          block,
          Math.max(block.lastProcessedEventIndex + 1, dbEvent.index)
        );
      }

      dbEvents = dbEvents.concat(unwatchedContractEvents);
    }

    console.timeEnd('time:job-runner#_processEvents-processing_events');
    block.isComplete = true;

    // Save events and update block after block processing complete.
    console.time('time:job-runner#_processEvents-updateBlockProgress-saveEvents');
    await Promise.all([
      this._indexer.updateBlockProgress(block, block.lastProcessedEventIndex),
      this._indexer.saveEvents(dbEvents.filter(event => event.eventName !== UNKNOWN_EVENT_NAME))
    ]);
    console.timeEnd('time:job-runner#_processEvents-updateBlockProgress-saveEvents');
    this._prefetchedBlocksMap.delete(block.blockHash);
    log('size:job-runner#_processEvents-_prefetchedBlocksMap:', this._prefetchedBlocksMap.size);

    console.timeEnd('time:job-runner#_processEvents-events');
  }

  async _updateWatchedContracts (job: any): Promise<void> {
    const { data: { contract } } = job;

    assert(this._indexer.cacheContract);
    this._indexer.cacheContract(contract);
  }
}
