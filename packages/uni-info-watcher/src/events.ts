import assert from 'assert';
import debug from 'debug';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { BigNumber } from 'ethers';

import { Database } from './database';
import { getEthPriceInUSD } from './utils/pricing';
import { updatePoolDayData, updatePoolHourData } from './utils/intervalUpdates';

const log = debug('vulcanize:events');

interface PoolCreatedEvent {
  token0: string;
  token1: string;
  fee: bigint;
  tickSpacing: bigint;
  pool: string;
}

interface InitializeEvent {
  sqrtPriceX96: bigint;
  tick: bigint;
}

interface ResultEvent {
  proof: {
    data: string
  }
  event: {
    __typename: string;
    [key: string]: any;
  }
}

export class EventWatcher {
  _db: Database
  _subscription?: ZenObservable.Subscription
  _uniClient: UniClient
  _erc20Client: ERC20Client

  constructor (db: Database, uniClient: UniClient, erc20Client: ERC20Client) {
    assert(db);

    this._db = db;
    this._uniClient = uniClient;
    this._erc20Client = erc20Client;
  }

  async start (): Promise<void> {
    assert(!this._subscription, 'subscription already started');
    log('Started watching upstream events...');
    this._subscription = await this._uniClient.watchEvents(this._handleEvents.bind(this));
  }

  async stop (): Promise<void> {
    if (this._subscription) {
      log('Stopped watching upstream events');
      this._subscription.unsubscribe();
    }
  }

  async _handleEvents ({ blockHash, blockNumber, contract, event }: { blockHash: string, blockNumber: number, contract: string, event: ResultEvent}): Promise<void> {
    // TODO: Process proof (proof.data) in event.
    const { event: { __typename: eventType, ...eventValues } } = event;

    switch (eventType) {
      case 'PoolCreatedEvent':
        log('Factory PoolCreated event', contract);
        this._handlePoolCreated(blockHash, blockNumber, contract, eventValues as PoolCreatedEvent);
        break;

      case 'InitializeEvent':
        log('Pool Initialize event', contract);
        this._handleInitialize(blockHash, blockNumber, contract, eventValues as InitializeEvent);
        break;

      default:
        break;
    }
  }

  async _handlePoolCreated (blockHash: string, blockNumber: number, contractAddress: string, poolCreatedEvent: PoolCreatedEvent): Promise<void> {
    const { token0: token0Address, token1: token1Address, fee, pool: poolAddress } = poolCreatedEvent;

    // Load factory.
    const factory = await this._db.loadFactory({ blockNumber, id: contractAddress });

    // Update Factory.
    let factoryPoolCount = BigNumber.from(factory.poolCount);
    factoryPoolCount = factoryPoolCount.add(1);
    factory.poolCount = BigInt(factoryPoolCount.toHexString());

    // Get Tokens.
    let [token0, token1] = await Promise.all([
      this._db.getToken({ blockNumber, id: token0Address }),
      this._db.getToken({ blockNumber, id: token1Address })
    ]);

    // Create Token.
    const createToken = async (tokenAddress: string) => {
      const { value: symbol } = await this._erc20Client.getSymbol(blockHash, tokenAddress);
      const { value: name } = await this._erc20Client.getName(blockHash, tokenAddress);
      const { value: totalSupply } = await this._erc20Client.getTotalSupply(blockHash, tokenAddress);

      // TODO: decimals not implemented by erc20-watcher.
      // const { value: decimals } = await this._erc20Client.getDecimals(blockHash, tokenAddress);

      return this._db.loadToken({
        blockNumber,
        id: token1Address,
        symbol,
        name,
        totalSupply
      });
    };

    // Create Tokens if not present.
    if (!token0) {
      token0 = await createToken(token0Address);
    }

    if (!token1) {
      token1 = await createToken(token1Address);
    }

    // Create new Pool entity.
    // Skipping adding createdAtTimestamp field as it is not queried in frontend subgraph.
    await this._db.loadPool({
      blockNumber,
      id: poolAddress,
      token0: token0,
      token1: token1,
      feeTier: BigInt(fee)
    });

    // Skipping updating token whitelistPools field as it is not queried in frontend subgraph.

    // Save entities to DB.
    await this._db.saveFactory(factory, blockNumber);
  }

  async _handleInitialize (blockHash: string, blockNumber: number, contractAddress: string, initializeEvent: InitializeEvent): Promise<void> {
    const { sqrtPriceX96, tick } = initializeEvent;
    const pool = await this._db.loadPool({ id: contractAddress, blockNumber });

    pool.sqrtPrice = BigInt(sqrtPriceX96);
    pool.tick = BigInt(tick);

    // Update ETH price now that prices could have changed.
    const bundle = await this._db.loadBundle({ id: '1', blockNumber });
    bundle.ethPriceUSD = await getEthPriceInUSD(this._db);
    this._db.saveBundle(bundle, blockNumber);

    // TODO: Fix duplicate key error when saving Pool data after update.
    // await updatePoolDayData(this._db, { contractAddress, blockNumber });
    // await updatePoolHourData(this._db, { contractAddress, blockNumber });

    // TODO: update token prices
    // const token0 = pool.token0;
    // const token1 = pool.token1;
    // token0.derivedETH = findEthPerToken(token0 as Token)
    // token1.derivedETH = findEthPerToken(token1 as Token)
    // this._db.saveToken(token0, blockNumber);
    // this._db.saveToken(token1, blockNumber);
  }
}
