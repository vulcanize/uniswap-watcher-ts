//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { PubSub } from 'apollo-server-express';
import _ from 'lodash';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { JobQueue } from './job-queue';
import { BlockProgressInterface, EventInterface, IndexerInterface } from './types';
import { QUEUE_BLOCK_PROCESSING, MAX_REORG_DEPTH, JOB_KIND_PRUNE, JOB_KIND_INDEX } from './constants';
import { createPruningJob } from './common';
import { wait } from './index';

const log = debug('vulcanize:events');

export const BlockProgressEvent = 'block-progress-event';

export class EventWatcher {
  _ethClient: EthClient
  _postgraphileClient: EthClient
  _indexer: IndexerInterface
  _subscription?: ZenObservable.Subscription
  _pubsub: PubSub
  _jobQueue: JobQueue

  constructor (ethClient: EthClient, postgraphileClient: EthClient, indexer: IndexerInterface, pubsub: PubSub, jobQueue: JobQueue) {
    this._ethClient = ethClient;
    this._postgraphileClient = postgraphileClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._pubsub.asyncIterator([BlockProgressEvent]);
  }

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream blocks');
      this._subscription.unsubscribe();
    }
  }

  async startBlockProcessing (): Promise<void> {
    const syncStatus = await this._indexer.getSyncStatus();

    if (!syncStatus) {
      // Get latest block in chain.
      const { block: currentBlock } = await this._ethClient.getBlockByHash();
      await this._fetchBlocksByNumberAndProcess(currentBlock.number + 1);
      return;
    }

    const block = await this._indexer.getBlockProgress(syncStatus.latestIndexedBlockHash);
    assert(block);
    await this._handleBlockComplete(block);
  }

  async blocksHandler (value: any): Promise<void> {
    const { blockHash, blockNumber, parentHash, timestamp } = _.get(value, 'data.listen.relatedNode');

    await this._indexer.updateSyncStatusChainHead(blockHash, blockNumber);

    log('watchBlock', blockHash, blockNumber);

    await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, { kind: JOB_KIND_INDEX, blockHash, blockNumber, parentHash, timestamp });
  }

  async blockProcessingCompleteHandler (job: any): Promise<void> {
    const { data: { request: { data } } } = job;
    const { kind } = data;

    switch (kind) {
      case JOB_KIND_INDEX:
        this._handleIndexingComplete(data);
        break;

      case JOB_KIND_PRUNE:
        this._handlePruningComplete(data);
        break;

      default:
        throw new Error(`Invalid Job kind ${kind} in complete handler of QUEUE_BLOCK_PROCESSING.`);
    }
  }

  async eventProcessingCompleteHandler (job: any): Promise<EventInterface> {
    const { data: { request } } = job;

    const dbEvent = await this._indexer.getEvent(request.data.id);
    assert(dbEvent);

    await this._indexer.updateBlockProgress(dbEvent.block.blockHash, dbEvent.index);
    const blockProgress = await this._indexer.getBlockProgress(dbEvent.block.blockHash);

    if (blockProgress) {
      await this.publishBlockProgressToSubscribers(blockProgress);

      if (blockProgress.isComplete) {
        await this._indexer.removeUnknownEvents(blockProgress);

        await this._handleBlockComplete(blockProgress);
      }
    }

    return dbEvent;
  }

  async publishBlockProgressToSubscribers (blockProgress: BlockProgressInterface): Promise<void> {
    const { blockHash, blockNumber, numEvents, numProcessedEvents, isComplete } = blockProgress;

    // Publishing the event here will result in pushing the payload to GQL subscribers for `onAddressEvent(address)`.
    await this._pubsub.publish(BlockProgressEvent, {
      onBlockProgressEvent: {
        blockHash,
        blockNumber,
        numEvents,
        numProcessedEvents,
        isComplete
      }
    });
  }

  async _handleIndexingComplete (jobData: any): Promise<void> {
    const { blockHash, blockNumber, priority } = jobData;
    log(`Job onComplete indexing block ${blockHash} ${blockNumber}`);

    // Update sync progress.
    const syncStatus = await this._indexer.updateSyncStatusIndexedBlock(blockHash, blockNumber);

    // Create pruning job if required.
    if (syncStatus && syncStatus.latestIndexedBlockNumber > (syncStatus.latestCanonicalBlockNumber + MAX_REORG_DEPTH)) {
      await createPruningJob(this._jobQueue, syncStatus.latestCanonicalBlockNumber, priority);
    }

    // Publish block progress event.
    const blockProgress = await this._indexer.getBlockProgress(blockHash);
    if (blockProgress) {
      await this.publishBlockProgressToSubscribers(blockProgress);

      if (blockProgress.isComplete) {
        await this._handleBlockComplete(blockProgress);
      }
    }
  }

  async _handlePruningComplete (jobData: any): Promise<void> {
    const { pruneBlockHeight } = jobData;
    log(`Job onComplete pruning at height ${pruneBlockHeight}`);

    const blocks = await this._indexer.getBlocksAtHeight(pruneBlockHeight, false);

    // Only one canonical (not pruned) block should exist at the pruned height.
    assert(blocks.length === 1);
    const [block] = blocks;

    await this._indexer.updateSyncStatusCanonicalBlock(block.blockHash, block.blockNumber);
  }

  /**
   * Method called after blockProgress isComplete is true.
   * @param block
   */
  async _handleBlockComplete (block: BlockProgressInterface): Promise<void> {
    this._fetchBlocksByNumberAndProcess(block.blockNumber + 1);
  }

  /**
   * Method to fetch blocks by number and push to job queue.
   * @param blockNumber
   */
  async _fetchBlocksByNumberAndProcess (blockNumber: number): Promise<void> {
    while (true) {
      const { allEthHeaderCids: { nodes: blocks } } = await this._postgraphileClient.getBlocksByNumber(blockNumber);

      if (blocks.length) {
        blocks.forEach(async (block: any) => {
          const { blockNumber, blockHash, parentHash, timestamp } = block;

          await this._indexer.updateSyncStatusChainHead(blockHash, blockNumber);

          await this._jobQueue.pushJob(QUEUE_BLOCK_PROCESSING, { kind: JOB_KIND_INDEX, blockHash, blockNumber, parentHash, timestamp });
        });

        // Break loop to check for nodes if child blocks are fetched.
        return;
      }

      log(`No blocks fetched for block number ${blockNumber}. Fetching after some time.`);
      // TODO: Get wait time from config.
      await wait(2000);
    }
  }
}
