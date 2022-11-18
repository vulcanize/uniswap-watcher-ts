//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import { PubSub } from 'graphql-subscriptions';

import { EthClient } from '@cerc-io/ipld-eth-client';
import {
  EventWatcher as BaseEventWatcher,
  QUEUE_BLOCK_PROCESSING,
  QUEUE_EVENT_PROCESSING,
  JobQueue,
  EventWatcherInterface
} from '@cerc-io/util';
import { UpstreamConfig } from '@vulcanize/util';

import { Indexer } from './indexer';

export class EventWatcher implements EventWatcherInterface {
  _ethClient: EthClient
  _indexer: Indexer
  _subscription?: ZenObservable.Subscription
  _pubsub: PubSub
  _jobQueue: JobQueue
  _baseEventWatcher: BaseEventWatcher

  constructor (upstreamConfig: UpstreamConfig, ethClient: EthClient, indexer: Indexer, pubsub: PubSub, jobQueue: JobQueue) {
    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
    this._baseEventWatcher = new BaseEventWatcher(upstreamConfig, this._ethClient, this._indexer, this._pubsub, this._jobQueue);
  }

  getEventIterator (): AsyncIterator<any> {
    return this._baseEventWatcher.getEventIterator();
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._baseEventWatcher.getBlockProgressEventIterator();
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');

    await this.initBlockProcessingOnCompleteHandler();
    await this.initEventProcessingOnCompleteHandler();
    this._baseEventWatcher.startBlockProcessing();
  }

  async stop (): Promise<void> {
    this._baseEventWatcher.stop();
  }

  async initBlockProcessingOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(QUEUE_BLOCK_PROCESSING, async (job) => {
      await this._baseEventWatcher.blockProcessingCompleteHandler(job);
    });
  }

  async initEventProcessingOnCompleteHandler (): Promise<void> {
    await this._jobQueue.onComplete(QUEUE_EVENT_PROCESSING, async (job) => {
      await this._baseEventWatcher.eventProcessingCompleteHandler(job);
    });
  }
}
