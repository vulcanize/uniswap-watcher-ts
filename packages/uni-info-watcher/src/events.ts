import assert from 'assert';
import debug from 'debug';
import _ from 'lodash';

import { EthClient } from '@vulcanize/ipld-eth-client';

import { Indexer } from './indexer';

const log = debug('vulcanize:events');

const FACTORY_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

interface PoolCreatedEvent {
  token0: string;
  token1: string;
  fee: bigint;
  tickSpacing: bigint;
  pool: string;
}

export class EventWatcher {
  _ethClient: EthClient
  _indexer: Indexer
  _subscription: ZenObservable.Subscription | undefined

  constructor (ethClient: EthClient, indexer: Indexer) {
    assert(ethClient);
    assert(indexer);

    this._ethClient = ethClient;
    this._indexer = indexer;
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');

    log('Started watching upstream logs...');

    this._subscription = await this._ethClient.watchLogs(async (value) => {
      const receipt = _.get(value, 'data.listen.relatedNode');
      log('watchLogs', JSON.stringify(receipt, null, 2));

      // Check if this log is for a contract we care about.
      const { logContracts } = receipt;
      if (logContracts && logContracts.length) {
        for (let logIndex = 0; logIndex < logContracts.length; logIndex++) {
          const contractAddress = logContracts[logIndex];
          const isWatchedContract = await this._indexer.isUniswapContract(contractAddress);
          if (isWatchedContract) {
            // TODO: Move processing to background task runner.

            const { ethTransactionCidByTxId: { ethHeaderCidByHeaderId: { blockHash } } } = receipt;
            await this._indexer.getEvents(blockHash, contractAddress, null);

            // Trigger other indexer methods based on event topic.
            await this._indexer.processEvent(blockHash, contractAddress, receipt, logIndex);
          }
        }
      }
    });
  }

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream logs');
      this._subscription.unsubscribe();
    }
  }

  async handlePoolCreated (blockNumber: number, params: PoolCreatedEvent): Promise<void> {
    const { token0, token1, fee, tickSpacing, pool } = params;

    // load factory
    const factory = await this._indexer.factory(blockNumber, FACTORY_ADDRESS);
    factory.poolCount = factory.poolCount + 1;

    // TODO: Create new Pool entity.

    // TODO: Load Token entities.

    // TODO: Update Token entities.

    // TODO: Update Pool entity.

    // TODO: Save entities to DB.
  }
}
