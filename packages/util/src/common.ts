//
// Copyright 2022 Vulcanize, Inc.
//

import {
  JobQueueConfig,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING,
  JobQueue
} from '@cerc-io/util';

import { IndexerInterface } from './types';
import { JobRunner as BaseJobRunner } from './job-runner';

export class WatcherJobRunner {
  _indexer: IndexerInterface
  _jobQueue: JobQueue
  _baseJobRunner: BaseJobRunner
  _jobQueueConfig: JobQueueConfig

  constructor (jobQueueConfig: JobQueueConfig, indexer: IndexerInterface, jobQueue: JobQueue) {
    this._jobQueueConfig = jobQueueConfig;
    this._indexer = indexer;
    this._jobQueue = jobQueue;
    this._baseJobRunner = new BaseJobRunner(this._jobQueueConfig, this._indexer, this._jobQueue);
  }

  async start (): Promise<void> {
    await this._jobQueue.deleteAllJobs();
    await this._baseJobRunner.resetToPrevIndexedBlock();
    await this.subscribeBlockProcessingQueue();
    await this.subscribeEventProcessingQueue();
  }

  async subscribeBlockProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_BLOCK_PROCESSING, async (job) => {
      await this._baseJobRunner.processBlock(job);
    });
  }

  async subscribeEventProcessingQueue (): Promise<void> {
    await this._jobQueue.subscribe(QUEUE_EVENT_PROCESSING, async (job) => {
      await this._baseJobRunner.processEvent(job);
    });
  }
}
