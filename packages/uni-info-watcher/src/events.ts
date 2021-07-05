import assert from 'assert';
import debug from 'debug';

import { Indexer } from './indexer';
import { UniClient } from './uni-client';

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
  _indexer: Indexer
  _subscriptions: { [key: string]: ZenObservable.Subscription } = {}
  _uniClient: UniClient

  constructor (uniClient: UniClient, indexer: Indexer) {
    assert(indexer);

    this._indexer = indexer;
    this._uniClient = uniClient;
  }

  async start (): Promise<void> {
    assert(!(Object.keys(this._subscriptions).length), 'subscriptions already started');
    log('Started watching upstream events...');
    await this._watchEvents();
  }

  async stop (): Promise<void> {
    Object.values(this._subscriptions)
      .forEach(subscription => subscription.unsubscribe());

    log('Stopped watching upstream events');
  }

  async _watchEvents (): Promise<void> {
    this._subscriptions.poolCreatedEvent = await this._uniClient.watchPoolCreatedEvent(this._handlePoolCreated.bind(this));
  }

  async _handlePoolCreated ({ blockHash, event }: { blockHash: string, event: { proof: string, event: PoolCreatedEvent}}): Promise<void> {
    const { token0: token0Address, token1: token1Address, fee, tickSpacing, pool: poolAddress } = event.event;

    // TODO: Use blockHash or blockNumber? uniswap-info uses blockNumber.
    const blockNumber = 1;

    // Load factory.
    const factory = await this._indexer.factory({ number: blockNumber, hash: blockHash }, FACTORY_ADDRESS);
    factory.poolCount = factory.poolCount + 1;

    // Create new Pool entity.
    const pool = this._indexer.pool({ number: blockNumber, hash: blockHash }, poolAddress);
    const token0 = this._indexer.token({ number: blockNumber, hash: blockHash }, token0Address);
    const token1 = this._indexer.token({ number: blockNumber, hash: blockHash }, token1Address);

    // TODO: Load Token entities.

    // TODO: Update Token entities.

    // TODO: Update Pool entity.

    // TODO: Save entities to DB.
  }
}
