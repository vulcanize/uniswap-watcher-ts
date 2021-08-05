import { expect } from 'chai';
import { ethers, Contract, ContractTransaction, Signer } from 'ethers';
import { request } from 'graphql-request';
import 'mocha';

import {
  Config,
  getConfig,
  wait,
  deployTokens,
  deployUniswapV3Callee,
  TESTERC20_ABI,
  createPool,
  initializePool,
  getMinTick,
  getMaxTick,
  approveToken
} from '@vulcanize/util';
import { Client as UniClient, watchEvent } from '@vulcanize/uni-watcher';
import {
  abi as FACTORY_ABI
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json';
import {
  abi as POOL_ABI
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json';

import {
  queryFactory,
  queryBundle,
  queryToken,
  queryPoolsByTokens,
  queryPoolById,
  queryPoolDayData
} from '../test/queries';

const NETWORK_RPC_URL = 'http://localhost:8545';

const TICK_MIN = -887272;

describe('uni-info-watcher', () => {
  let factory: Contract;
  let pool: Contract;
  let token0: Contract;
  let token1: Contract;
  let token0Address: string;
  let token1Address: string;

  let signer: Signer;
  let recipient: string;
  let config: Config;
  let endpoint: string;
  let uniClient: UniClient;

  before(async () => {
    const provider = new ethers.providers.JsonRpcProvider(NETWORK_RPC_URL);
    signer = provider.getSigner();
    recipient = await signer.getAddress();

    const configFile = './environments/local.toml';
    config = await getConfig(configFile);

    const { upstream, server: { host, port } } = config;
    endpoint = `http://${host}:${port}/graphql`;

    const { uniWatcher: { gqlEndpoint, gqlSubscriptionEndpoint } } = upstream;
    uniClient = new UniClient({
      gqlEndpoint,
      gqlSubscriptionEndpoint
    });
  });

  it('should have a Factory entity', async () => {
    // Getting the Factory from uni-info-watcher graphQL endpoint.
    const data = await request(endpoint, queryFactory);
    expect(data.factories).to.not.be.empty;

    // Initializing the factory variable.
    const factoryAddress = data.factories[0].id;
    factory = new ethers.Contract(factoryAddress, FACTORY_ABI, signer);
    expect(factory.address).to.not.be.empty;
  });

  it('should have a Bundle entity', async () => {
    // Getting the Bundle from uni-info-watcher graphQL endpoint.
    const data = await request(endpoint, queryBundle);
    expect(data.bundles).to.not.be.empty;

    const bundleId = '1';
    expect(data.bundles[0].id).to.equal(bundleId);
  });

  describe('PoolCreatedEvent', () => {
    // NOTE Skipping checking entity updates that cannot be gotten using queries.

    const fee = 500;

    before(async () => {
      // Deploy 2 tokens.
      ({ token0Address, token1Address } = await deployTokens(signer));
      expect(token0Address).to.not.be.empty;
      expect(token1Address).to.not.be.empty;
    });

    it('should not have Token entities', async () => {
      // Check that Token entities are absent.
      const data0 = await request(endpoint, queryToken, { id: token0Address });
      expect(data0.token).to.be.null;

      const data1 = await request(endpoint, queryToken, { id: token0Address });
      expect(data1.token).to.be.null;
    });

    it('should create pool', async () => {
      // Create Pool.
      createPool(factory, token0Address, token1Address, fee);

      // Wait for PoolCreatedEvent.
      const eventType = 'PoolCreatedEvent';
      await watchEvent(uniClient, eventType);

      // Sleeping for 5 sec for the entities to be processed.
      await wait(5000);
    });

    it('should create Token entities', async () => {
      // Check that Token entities are present.
      const data0 = await request(endpoint, queryToken, { id: token0Address });
      expect(data0.token).to.not.be.null;

      const data1 = await request(endpoint, queryToken, { id: token0Address });
      expect(data1.token).to.not.be.null;
    });

    it('should create a Pool entity', async () => {
      const variables = {
        tokens: [token0Address, token1Address]
      };
      // Getting the Pool that has the deployed tokens.
      const data = await request(endpoint, queryPoolsByTokens, variables);
      expect(data.pools).to.have.lengthOf(1);

      // Initializing the pool variable.
      const poolAddress = data.pools[0].id;
      pool = new Contract(poolAddress, POOL_ABI, signer);
      expect(pool.address).to.not.be.empty;

      expect(data.pools[0].feeTier).to.be.equal(fee.toString());

      // Initializing the token variables.
      token0Address = await pool.token0();
      token0 = new Contract(token0Address, TESTERC20_ABI, signer);
      token1Address = await pool.token1();
      token1 = new Contract(token1Address, TESTERC20_ABI, signer);
    });
  });

  describe('InitializeEvent', () => {
    const sqrtPrice = '4295128939';
    const tick = TICK_MIN;

    it('should not have pool entity initialized', async () => {
      const data = await request(endpoint, queryPoolById, { id: pool.address });
      expect(data.pool.sqrtPrice).to.not.be.equal(sqrtPrice);
      expect(data.pool.tick).to.be.null;
    });

    it('should initialize pool', async () => {
      initializePool(pool, sqrtPrice);

      // Wait for InitializeEvent.
      const eventType = 'InitializeEvent';
      await watchEvent(uniClient, eventType);

      // Sleeping for 5 sec for the entities to be processed.
      await wait(5000);

      const data = await request(endpoint, queryPoolById, { id: pool.address });
      expect(data.pool.sqrtPrice).to.be.equal(sqrtPrice);
      expect(data.pool.tick).to.be.equal(tick.toString());
    });

    it('should update PoolDayData entity', async () => {
      // Get the latest PoolDayData.
      const variables = {
        first: 1,
        orderBy: 'date',
        orderDirection: 'desc',
        pool: pool.address
      };
      const data = await request(endpoint, queryPoolDayData, variables);
      expect(data.poolDayDatas).to.not.be.empty;

      const dayPoolID: string = data.poolDayDatas[0].id;
      const poolID: string = dayPoolID.split('-')[0];
      const dayID: number = +dayPoolID.split('-')[1];
      const date = data.poolDayDatas[0].date;
      const tvlUSD = data.poolDayDatas[0].tvlUSD;

      const dayStartTimestamp = dayID * 86400;
      const poolData = await request(endpoint, queryPoolById, { id: pool.address });
      const totalValueLockedUSD: string = poolData.pool.totalValueLockedUSD;

      expect(poolID).to.be.equal(pool.address);
      expect(date).to.be.equal(dayStartTimestamp);
      expect(tvlUSD).to.be.equal(totalValueLockedUSD);
    });
  });

  describe('MintEvent', () => {
    const amount = 10;
    const approveAmount = BigInt(1000000000000000000000000);
    // TODO See if this needs to be defined here or outer.
    let poolCallee: Contract;
    let tickLower: number;
    let tickUpper: number;

    // Initial entity values
    let oldFactory: any;
    let oldToken0: any;
    let oldToken1: any;

    before(async () => {
      // Deploy UniswapV3Callee.
      poolCallee = await deployUniswapV3Callee(signer);

      const tickSpacing = await pool.tickSpacing();
      // https://github.com/Uniswap/uniswap-v3-core/blob/main/test/UniswapV3Pool.spec.ts#L196
      tickLower = getMinTick(tickSpacing);
      tickUpper = getMaxTick(tickSpacing);

      await approveToken(token0, poolCallee.address, approveAmount);
      await approveToken(token1, poolCallee.address, approveAmount);

      // Get initial entity values.
      let data: any;

      data = await request(endpoint, queryFactory);
      oldFactory = data.factories[0];
      
      data = await request(endpoint, queryToken, { id: token0Address });
      oldToken0 = data.token;

      data = await request(endpoint, queryToken, { id: token1Address });
      oldToken1 = data.token;
    });

    it('should mint tokens', async () => {
      // Pool mint.
      const transaction: ContractTransaction = await poolCallee.mint(pool.address, recipient, BigInt(tickLower), BigInt(tickUpper), BigInt(amount));
      await transaction.wait();

      // Wait for MintEvent.
      const eventType = 'MintEvent';
      await watchEvent(uniClient, eventType);

      // Sleeping for 15 sec for the entities to be processed.
      await wait(15000);
    });

    it('should update Token entities', async () => {
      let data: any;

      data = await request(endpoint, queryToken, { id: token0Address });
      const newToken0 = data.token;

      data = await request(endpoint, queryToken, { id: token1Address });
      const newToken1 = data.token;

      expect(newToken0.txCount).to.be.equal((BigInt(oldToken0.txCount) + BigInt(1)).toString());
      expect(newToken1.txCount).to.be.equal((BigInt(oldToken1.txCount) + BigInt(1)).toString());
    });

    it('should update Factory entity', async () => {
      const data = await request(endpoint, queryFactory);
      const newFactory = data.factories[0];
      expect(newFactory.txCount).to.be.equal((BigInt(oldFactory.txCount) + BigInt(1)).toString());
    });
  });
});
