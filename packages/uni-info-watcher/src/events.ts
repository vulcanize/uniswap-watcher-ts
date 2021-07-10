import assert from 'assert';
import debug from 'debug';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { Client as ERC20Client } from '@vulcanize/erc20-watcher';
import { BigNumber } from 'ethers';

import { Database } from './database';
import { findEthPerToken, getEthPriceInUSD, WHITELIST_TOKENS } from './utils/pricing';
import { updatePoolDayData, updatePoolHourData } from './utils/intervalUpdates';
import { Token } from './entity/Token';
import { convertTokenToDecimal } from './utils';

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

interface MintEvent {
  sender: string;
  owner: string;
  tickLower: bigint;
  tickUpper: bigint;
  amount: bigint;
  amount0: bigint;
  amount1: bigint;
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

      case 'MintEvent':
        log('Pool Mint event', contract);
        this._handleMint(blockHash, blockNumber, contract, eventValues as MintEvent);
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

    // Create Tokens if not present.
    if (!token0) {
      token0 = await this._createToken(blockHash, blockNumber, token0Address);
    }

    if (!token1) {
      token1 = await this._createToken(blockHash, blockNumber, token1Address);
    }

    // Create new Pool entity.
    // Skipping adding createdAtTimestamp field as it is not queried in frontend subgraph.
    const pool = await this._db.loadPool({
      blockNumber,
      id: poolAddress,
      token0: token0,
      token1: token1,
      feeTier: BigInt(fee)
    });

    // Update white listed pools.
    if (WHITELIST_TOKENS.includes(token0.id)) {
      token1.whitelistPools.push(pool);
      await this._db.saveToken(token1, blockNumber);
    }

    if (WHITELIST_TOKENS.includes(token1.id)) {
      token0.whitelistPools.push(pool);
      await this._db.saveToken(token0, blockNumber);
    }

    // Save entities to DB.
    await this._db.saveFactory(factory, blockNumber);
  }

  /**
   * Create new Token.
   * @param tokenAddress
   */
  async _createToken (blockHash: string, blockNumber: number, tokenAddress: string): Promise<Token> {
    const { value: symbol } = await this._erc20Client.getSymbol(blockHash, tokenAddress);
    const { value: name } = await this._erc20Client.getName(blockHash, tokenAddress);
    const { value: totalSupply } = await this._erc20Client.getTotalSupply(blockHash, tokenAddress);

    // TODO: Decimals not implemented by erc20-watcher.
    // const { value: decimals } = await this._erc20Client.getDecimals(blockHash, tokenAddress);

    return this._db.loadToken({
      blockNumber,
      id: tokenAddress,
      symbol,
      name,
      totalSupply
    });
  }

  async _handleInitialize (blockHash: string, blockNumber: number, contractAddress: string, initializeEvent: InitializeEvent): Promise<void> {
    const { sqrtPriceX96, tick } = initializeEvent;
    const pool = await this._db.getPool({ id: contractAddress, blockNumber });
    assert(pool, `Pool ${contractAddress} not found.`);

    // Update Pool.
    pool.sqrtPrice = BigInt(sqrtPriceX96);
    pool.tick = BigInt(tick);
    this._db.savePool(pool, blockNumber);

    // Update ETH price now that prices could have changed.
    const bundle = await this._db.loadBundle({ id: '1', blockNumber });
    bundle.ethPriceUSD = await getEthPriceInUSD(this._db);
    this._db.saveBundle(bundle, blockNumber);

    await updatePoolDayData(this._db, { contractAddress, blockNumber });
    await updatePoolHourData(this._db, { contractAddress, blockNumber });

    const [token0, token1] = await Promise.all([
      this._db.getToken({ id: pool.token0.id, blockNumber }),
      this._db.getToken({ id: pool.token1.id, blockNumber })
    ]);

    assert(token0 && token1, 'Pool tokens not found.');

    // Update token prices.
    token0.derivedETH = await findEthPerToken(token0);
    token1.derivedETH = await findEthPerToken(token1);

    await Promise.all([
      this._db.saveToken(token0, blockNumber),
      this._db.saveToken(token1, blockNumber)
    ]);
  }

  async _handleMint (blockHash: string, blockNumber: number, contractAddress: string, initializeEvent: MintEvent): Promise<void> {
    console.log('mint event', initializeEvent);
    const bundle = await this._db.loadBundle({ id: '1', blockNumber });
    const poolAddress = contractAddress;
    const pool = await this._db.loadPool({ id: poolAddress, blockNumber });

    // TODO: In subgraph factory is fetched by hardcoded factory address
    // Currently fetching first factory in database as only one exists.
    const [factory] = await this._db.getFactories({ blockNumber }, { limit: 1 });

    const token0 = pool.token0;
    const token1 = pool.token1;
    const amount0 = convertTokenToDecimal(initializeEvent.amount0, BigInt(token0.decimals));
    const amount1 = convertTokenToDecimal(initializeEvent.amount1, BigInt(token1.decimals));

    const amountUSD = amount0
      .times(token0.derivedETH.times(bundle.ethPriceUSD))
      .plus(amount1.times(token1.derivedETH.times(bundle.ethPriceUSD)));

    // Reset tvl aggregates until new amounts calculated.
    factory.totalValueLockedETH = factory.totalValueLockedETH.minus(pool.totalValueLockedETH);

    // Update globals.
    factory.txCount = BigInt(factory.txCount) + BigInt(1);

    // Update token0 data.
    token0.txCount = BigInt(token0.txCount) + BigInt(1);
    token0.totalValueLocked = token0.totalValueLocked.plus(amount0);
    token0.totalValueLockedUSD = token0.totalValueLocked.times(token0.derivedETH.times(bundle.ethPriceUSD));

    // Update token1 data.
    token1.txCount = BigInt(token1.txCount) + BigInt(1);
    token1.totalValueLocked = token1.totalValueLocked.plus(amount1);
    token1.totalValueLockedUSD = token1.totalValueLocked.times(token1.derivedETH.times(bundle.ethPriceUSD));

    // Pool data.
    pool.txCount = BigInt(pool.txCount) + BigInt(1);

    // Pools liquidity tracks the currently active liquidity given pools current tick.
    // We only want to update it on mint if the new position includes the current tick.
    if (pool.tick !== null) {
      if (
        BigInt(initializeEvent.tickLower) <= BigInt(pool.tick) &&
        BigInt(initializeEvent.tickUpper) > BigInt(pool.tick)
      ) {
        pool.liquidity = BigInt(pool.liquidity) + initializeEvent.amount;
      }
    }

    pool.totalValueLockedToken0 = pool.totalValueLockedToken0.plus(amount0);
    pool.totalValueLockedToken1 = pool.totalValueLockedToken1.plus(amount1);

    pool.totalValueLockedETH = pool.totalValueLockedToken0.times(token0.derivedETH)
      .plus(pool.totalValueLockedToken1.times(token1.derivedETH));

    pool.totalValueLockedUSD = pool.totalValueLockedETH.times(bundle.ethPriceUSD);

    // Reset aggregates with new amounts.
    factory.totalValueLockedETH = factory.totalValueLockedETH.plus(pool.totalValueLockedETH);
    factory.totalValueLockedUSD = factory.totalValueLockedETH.times(bundle.ethPriceUSD);

    // let transaction = loadTransaction(event)
    // let mint = new Mint(transaction.id.toString() + '#' + pool.txCount.toString())
    // mint.transaction = transaction.id
    // mint.timestamp = transaction.timestamp
    // mint.pool = pool.id
    // mint.token0 = pool.token0
    // mint.token1 = pool.token1
    // mint.owner = event.params.owner
    // mint.sender = event.params.sender
    // mint.origin = event.transaction.from
    // mint.amount = event.params.amount
    // mint.amount0 = amount0
    // mint.amount1 = amount1
    // mint.amountUSD = amountUSD
    // mint.tickLower = BigInt.fromI32(event.params.tickLower)
    // mint.tickUpper = BigInt.fromI32(event.params.tickUpper)
    // mint.logIndex = event.logIndex

    // // tick entities
    // let lowerTickIdx = event.params.tickLower
    // let upperTickIdx = event.params.tickUpper

    // let lowerTickId = poolAddress + '#' + BigInt.fromI32(event.params.tickLower).toString()
    // let upperTickId = poolAddress + '#' + BigInt.fromI32(event.params.tickUpper).toString()

    // let lowerTick = Tick.load(lowerTickId)
    // let upperTick = Tick.load(upperTickId)

    // if (lowerTick === null) {
    //   lowerTick = createTick(lowerTickId, lowerTickIdx, pool.id, event)
    // }

    // if (upperTick === null) {
    //   upperTick = createTick(upperTickId, upperTickIdx, pool.id, event)
    // }

    // let amount = event.params.amount
    // lowerTick.liquidityGross = lowerTick.liquidityGross.plus(amount)
    // lowerTick.liquidityNet = lowerTick.liquidityNet.plus(amount)
    // upperTick.liquidityGross = upperTick.liquidityGross.plus(amount)
    // upperTick.liquidityNet = upperTick.liquidityNet.minus(amount)

    // // TODO: Update Tick's volume, fees, and liquidity provider count. Computing these on the tick
    // // level requires reimplementing some of the swapping code from v3-core.

    // updateUniswapDayData(event)
    // updatePoolDayData(event)
    // updatePoolHourData(event)
    // updateTokenDayData(token0 as Token, event)
    // updateTokenDayData(token1 as Token, event)
    // updateTokenHourData(token0 as Token, event)
    // updateTokenHourData(token1 as Token, event)

    // token0.save()
    // token1.save()
    // pool.save()
    // factory.save()
    // mint.save()

    // // Update inner tick vars and save the ticks
    // updateTickFeeVarsAndSave(lowerTick!, event)
    // updateTickFeeVarsAndSave(upperTick!, event)
  }
}
