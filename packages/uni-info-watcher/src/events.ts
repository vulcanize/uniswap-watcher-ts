//
// Copyright 2021 Vulcanize, Inc.
//

import assert from 'assert';
import debug from 'debug';
import { PubSub } from 'apollo-server-express';

import { EthClient } from '@vulcanize/ipld-eth-client';
import { EventWatcher as BaseEventWatcher, EventWatcherInterface, JobQueue, QUEUE_BLOCK_PROCESSING, QUEUE_EVENT_PROCESSING, QUEUE_CHAIN_PRUNING } from '@vulcanize/util';

import { Indexer } from './indexer';

const log = debug('vulcanize:events');

export interface PoolCreatedEvent {
  __typename: 'PoolCreatedEvent';
  token0: string;
  token1: string;
  fee: string;
  tickSpacing: string;
  pool: string;
}

export interface InitializeEvent {
  __typename: 'InitializeEvent';
  sqrtPriceX96: string;
  tick: string;
}

export interface MintEvent {
  __typename: 'MintEvent';
  sender: string;
  owner: string;
  tickLower: string;
  tickUpper: string;
  amount: string;
  amount0: string;
  amount1: string;
}

export interface BurnEvent {
  __typename: 'BurnEvent';
  owner: string;
  tickLower: string;
  tickUpper: string;
  amount: string;
  amount0: string;
  amount1: string;
}

export interface SwapEvent {
  __typename: 'SwapEvent';
  sender: string;
  recipient: string;
  amount0: string;
  amount1: string;
  sqrtPriceX96: string;
  liquidity: string;
  tick: string;
}

export interface IncreaseLiquidityEvent {
  __typename: 'IncreaseLiquidityEvent';
  tokenId: string;
  liquidity: string;
  amount0: string;
  amount1: string;
}

export interface DecreaseLiquidityEvent {
  __typename: 'DecreaseLiquidityEvent';
  tokenId: string;
  liquidity: string;
  amount0: string;
  amount1: string;
}

export interface CollectEvent {
  __typename: 'CollectEvent';
  tokenId: string;
  recipient: string;
  amount0: string;
  amount1: string;
}

export interface TransferEvent {
  __typename: 'TransferEvent';
  from: string;
  to: string;
  tokenId: string;
}

export interface Block {
  number: number;
  hash: string;
  timestamp: number;
  parentHash: string;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  index: number;
}

export interface ResultEvent {
  block: Block;
  tx: Transaction;
  contract: string;
  eventIndex: number;
  event: PoolCreatedEvent | InitializeEvent | MintEvent | BurnEvent | SwapEvent | IncreaseLiquidityEvent | DecreaseLiquidityEvent | CollectEvent | TransferEvent;
  proof: {
    data: string;
  }
}

export class EventWatcher implements EventWatcherInterface {
  _ethClient: EthClient
  _indexer: Indexer
  _subscription?: ZenObservable.Subscription
  _pubsub: PubSub
  _jobQueue: JobQueue
  _eventWatcher: BaseEventWatcher

  constructor (ethClient: EthClient, indexer: Indexer, pubsub: PubSub, jobQueue: JobQueue) {
    this._ethClient = ethClient;
    this._indexer = indexer;
    this._pubsub = pubsub;
    this._jobQueue = jobQueue;
    this._eventWatcher = new BaseEventWatcher(this._ethClient, this._indexer, this._pubsub, this._jobQueue);
  }

  getBlockProgressEventIterator (): AsyncIterator<any> {
    return this._eventWatcher.getBlockProgressEventIterator();
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');
    log('Started watching upstream events...');

    await this.watchBlocksAtChainHead();
    await this.initBlockProcessingOnCompleteHandler();
    await this.initEventProcessingOnCompleteHandler();
    await this.initChainPruningOnCompleteHandler();
  }

  async stop (): Promise<void> {
    this._eventWatcher.stop();
  }

  async watchBlocksAtChainHead (): Promise<void> {
    this._subscription = await this._ethClient.watchBlocks(async (value) => {
      await this._eventWatcher.blocksHandler(value);
    });
  }

  async initBlockProcessingOnCompleteHandler (): Promise<void> {
    await this._jobQueue.onComplete(QUEUE_BLOCK_PROCESSING, async (job) => {
      await this._eventWatcher.blockProcessingCompleteHandler(job);
    });
  }

  async initEventProcessingOnCompleteHandler (): Promise<void> {
    await this._jobQueue.onComplete(QUEUE_EVENT_PROCESSING, async (job) => {
      await this._eventWatcher.eventProcessingCompleteHandler(job);
    });
  }

  async initChainPruningOnCompleteHandler (): Promise<void> {
    this._jobQueue.onComplete(QUEUE_CHAIN_PRUNING, async (job) => {
      await this._eventWatcher.chainPruningCompleteHandler(job);
    });
  }
}
