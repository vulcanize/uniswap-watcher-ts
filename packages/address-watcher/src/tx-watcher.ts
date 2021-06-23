import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { Indexer } from './indexer';
import { JobQueue } from './job-queue';

const log = debug('vulcanize:tx-watcher');

export const QUEUE_TX_TRACING = 'tx-tracing';

export class TxWatcher {
  _ethClient: EthClient
  _indexer: Indexer
  _watchTxSubscription: ZenObservable.Subscription | undefined
  _jobQueue: JobQueue

  constructor (ethClient: EthClient, indexer: Indexer, jobQueue: JobQueue) {
    assert(ethClient);
    assert(indexer);
    assert(jobQueue);

    this._ethClient = ethClient;
    this._indexer = indexer;
    this._jobQueue = jobQueue;
  }

  async start (): Promise<void> {
    assert(!this._watchTxSubscription, 'subscription already started');

    log('Started watching upstream tx...');

    this._watchTxSubscription = await this._ethClient.watchTransactions(async (value) => {
      const { txHash, ethHeaderCidByHeaderId: { blockHash, blockNumber } } = _.get(value, 'data.listen.relatedNode');
      log('watchTransaction', JSON.stringify({ txHash, blockHash, blockNumber }, null, 2));
      this._jobQueue.pushJob(QUEUE_TX_TRACING, { txHash });
    });

    // TODO: Move to a different process and use onComplete for pushing events to downstream GQL subscribers.
    this._jobQueue.subscribe(QUEUE_TX_TRACING, async (job) => {
      const { data: { txHash } } = job;

      await this._indexer.traceTxAndIndexAppearances(txHash);

      // TODO: Before publishing, check if trace is "recent".
      return await this._indexer.publishAddressEventToSubscribers(txHash);
    });
  }

  async stop (): Promise<void> {
    if (this._watchTxSubscription) {
      log('Stopped watching upstream tx');
      this._watchTxSubscription.unsubscribe();
    }
  }
}
