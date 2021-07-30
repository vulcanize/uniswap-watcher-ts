import { expect, assert } from 'chai';
import { ethers, Contract, ContractTransaction, Signer, constants } from 'ethers';
import 'reflect-metadata';
import 'mocha';

import { Config, getConfig } from '@vulcanize/util';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';
import {
  abi as FACTORY_ABI,
  bytecode as FACTORY_BYTECODE
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json';
import {
  abi as POOL_ABI
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json';
import {
  abi as NFTD_ABI,
  bytecode as NFTD_BYTECODE
} from '@uniswap/v3-periphery/artifacts/contracts/libraries/NFTDescriptor.sol/NFTDescriptor.json';
import {
  abi as NFTPD_ABI,
  bytecode as NFTPD_BYTECODE,
  linkReferences as NFTPD_LINKREFS
} from '@uniswap/v3-periphery/artifacts/contracts/NonfungibleTokenPositionDescriptor.sol/NonfungibleTokenPositionDescriptor.json';
import {
  abi as NFPM_ABI,
  bytecode as NFPM_BYTECODE
} from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';

import { Indexer } from './indexer';
import { Database } from './database';
import { watchContract } from './utils/index';
import { linkLibraries, testCreatePool, testInitialize } from '../test/utils';
import {
  abi as TESTERC20_ABI,
  bytecode as TESTERC20_BYTECODE
} from '../artifacts/test/contracts/TestERC20.sol/TestERC20.json';
import {
  abi as TESTUNISWAPV3CALLEE_ABI,
  bytecode as TESTUNISWAPV3CALLEE_BYTECODE
} from '../artifacts/test/contracts/TestUniswapV3Callee.sol/TestUniswapV3Callee.json';
import {
  abi as WETH9_ABI,
  bytecode as WETH9_BYTECODE
} from '../artifacts/test/contracts/WETH9.sol/WETH9.json';

const TICK_MIN = -887272;
const TICK_MAX = 887272;
const getMinTick = (tickSpacing: number) => Math.ceil(TICK_MIN / tickSpacing) * tickSpacing;
const getMaxTick = (tickSpacing: number) => Math.floor(TICK_MAX / tickSpacing) * tickSpacing;

describe('uni-watcher', () => {
  let factory: Contract;
  let token0: Contract;
  let token1: Contract;
  let pool: Contract;
  let weth9: Contract;
  let nfpm: Contract;

  let poolAddress: string;
  let tickLower: number;
  let tickUpper: number;
  let config: Config;
  let db: Database;
  let uniClient: UniClient;
  let ethClient: EthClient;
  let signer: Signer;
  let recipient: string;

  before(async () => {
    const configFile = './environments/local.toml';
    config = await getConfig(configFile);

    const { database: dbConfig, upstream, server: { host, port } } = config;
    assert(dbConfig, 'Missing dbConfig.');
    assert(upstream, 'Missing upstream.');
    assert(host, 'Missing host.');
    assert(port, 'Missing port.');

    const { ethServer: { gqlApiEndpoint, gqlPostgraphileEndpoint }, cache: cacheConfig } = upstream;
    assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint.');
    assert(gqlPostgraphileEndpoint, 'Missing upstream ethServer.gqlPostgraphileEndpoint.');
    assert(cacheConfig, 'Missing dbConfig.');

    db = new Database(dbConfig);
    await db.init();

    const cache = await getCache(cacheConfig);
    ethClient = new EthClient({
      gqlEndpoint: gqlApiEndpoint,
      gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
      cache
    });

    const endpoint = `http://${host}:${port}/graphql`;
    const gqlEndpoint = endpoint;
    const gqlSubscriptionEndpoint = endpoint;
    uniClient = new UniClient({
      gqlEndpoint,
      gqlSubscriptionEndpoint
    });

    const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
    signer = provider.getSigner();
    recipient = await signer.getAddress();
  });

  after(async () => {
    await db.close();
  });

  it('should deploy contract factory', async () => {
    // Deploy factory from uniswap package.
    const Factory = new ethers.ContractFactory(FACTORY_ABI, FACTORY_BYTECODE, signer);
    factory = await Factory.deploy();

    expect(factory.address).to.not.be.empty;
  });

  it('should watch factory contract', async () => {
    // Watch factory contract.
    await watchContract(db, factory.address, 'factory', 100);

    // Verifying with the db.
    const indexer = new Indexer(config, db, ethClient);
    assert(await indexer.isUniswapContract(factory.address), 'Factory contract not added to database.');
  });

  it('should deploy 2 tokens', async () => {
    // Deploy 2 tokens.
    const Token = new ethers.ContractFactory(TESTERC20_ABI, TESTERC20_BYTECODE, signer);

    token0 = await Token.deploy(ethers.BigNumber.from(2).pow(255));
    expect(token0.address).to.not.be.empty;

    token1 = await Token.deploy(ethers.BigNumber.from(2).pow(255));
    expect(token1.address).to.not.be.empty;
  });

  it('should create pool', async () => {
    const fee = 500;

    pool = await testCreatePool(uniClient, factory, token0, token1, POOL_ABI, signer, fee);
    poolAddress = pool.address;
  });

  it('should initialize pool', async () => {
    const sqrtPrice = '4295128939';

    await testInitialize(uniClient, pool, TICK_MIN, sqrtPrice);
  });

  it('should mint specified amount', done => {
    (async () => {
      const amount = '10';
      const approveAmount = BigInt(1000000000000000000000000);

      const TestUniswapV3Callee = new ethers.ContractFactory(TESTUNISWAPV3CALLEE_ABI, TESTUNISWAPV3CALLEE_BYTECODE, signer);
      const poolCallee = await TestUniswapV3Callee.deploy();

      const tickSpacing = await pool.tickSpacing();
      // https://github.com/Uniswap/uniswap-v3-core/blob/main/test/UniswapV3Pool.spec.ts#L196
      tickLower = getMinTick(tickSpacing);
      tickUpper = getMaxTick(tickSpacing);

      // Approving tokens for TestUniswapV3Callee contract.
      // https://github.com/Uniswap/uniswap-v3-core/blob/main/test/shared/utilities.ts#L187
      const t0 = await token0.approve(poolCallee.address, approveAmount);
      await t0.wait();

      const t1 = await token1.approve(poolCallee.address, approveAmount);
      await t1.wait();

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'MintEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(pool.address);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('MintEvent');
          expect(value.event.sender).to.equal(poolCallee.address);
          expect(value.event.owner).to.equal(recipient);
          expect(value.event.tickLower).to.equal(tickLower.toString());
          expect(value.event.tickUpper).to.equal(tickUpper.toString());
          expect(value.event.amount).to.equal(amount);
          expect(value.event.amount0).to.not.be.empty;
          expect(value.event.amount1).to.not.be.empty;

          expect(value.proof).to.not.be.empty;

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Pool mint.
      await poolCallee.mint(pool.address, recipient, BigInt(tickLower), BigInt(tickUpper), BigInt(amount));
    })().catch((error) => {
      done(error);
    });
  });

  it('should burn specified amount', done => {
    (async () => {
      const amount = '10';

      const tickSpacing = await pool.tickSpacing();
      // https://github.com/Uniswap/uniswap-v3-core/blob/main/test/UniswapV3Pool.spec.ts#L196
      const tickLower = getMinTick(tickSpacing);
      const tickUpper = getMaxTick(tickSpacing);

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'BurnEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(pool.address);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('BurnEvent');
          expect(value.event.owner).to.equal(recipient);
          expect(value.event.tickLower).to.equal(tickLower.toString());
          expect(value.event.tickUpper).to.equal(tickUpper.toString());
          expect(value.event.amount).to.equal(amount);
          expect(value.event.amount0).to.not.be.empty;
          expect(value.event.amount1).to.not.be.empty;

          expect(value.proof).to.not.be.empty;

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Pool burn.
      await pool.burn(BigInt(tickLower), BigInt(tickUpper), BigInt(amount));
    })().catch((error) => {
      done(error);
    });
  });

  it('should swap pool tokens', done => {
    (async () => {
      const sqrtPrice = '4295128938';

      const TestUniswapV3Callee = new ethers.ContractFactory(TESTUNISWAPV3CALLEE_ABI, TESTUNISWAPV3CALLEE_BYTECODE, signer);
      const poolCallee = await TestUniswapV3Callee.deploy();

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'SwapEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(poolAddress);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('SwapEvent');
          expect(value.event.sender).to.equal(poolCallee.address);
          expect(value.event.recipient).to.equal(recipient);
          expect(value.event.amount0).to.not.be.empty;
          expect(value.event.amount1).to.not.be.empty;
          expect(value.event.sqrtPriceX96).to.equal(sqrtPrice);
          expect(value.event.liquidity).to.not.be.empty;
          expect(value.event.tick).to.equal(TICK_MIN.toString());

          expect(value.proof).to.not.be.empty;

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      await poolCallee.swapToLowerSqrtPrice(poolAddress, BigInt(sqrtPrice), recipient);
    })().catch((error) => {
      done(error);
    });
  });

  it('should deploy a WETH9 token', async () => {
    // Deploy weth9 token.
    const WETH9 = new ethers.ContractFactory(WETH9_ABI, WETH9_BYTECODE, signer);
    weth9 = await WETH9.deploy();

    expect(weth9.address).to.not.be.empty;
  });

  it('should deploy NonfungiblePositionManager', async () => {
    // Deploy NonfungiblePositionManager.
    // https://github.com/Uniswap/uniswap-v3-periphery/blob/main/test/shared/completeFixture.ts#L31
    const nftDescriptorLibraryFactory = new ethers.ContractFactory(NFTD_ABI, NFTD_BYTECODE, signer);
    const nftDescriptorLibrary = await nftDescriptorLibraryFactory.deploy();

    // Linking NFTDescriptor library to NFTPD before deploying
    const linkedNFTPDBytecode = linkLibraries({
      bytecode: NFTPD_BYTECODE,
      linkReferences: NFTPD_LINKREFS
    }, {
      NFTDescriptor: nftDescriptorLibrary.address
    }
    );

    const positionDescriptorFactory = new ethers.ContractFactory(
      NFTPD_ABI,
      linkedNFTPDBytecode,
      signer);
    const nftDescriptor = await positionDescriptorFactory.deploy(weth9.address);

    const positionManagerFactory = new ethers.ContractFactory(
      NFPM_ABI,
      NFPM_BYTECODE,
      signer);
    nfpm = await positionManagerFactory.deploy(factory.address, weth9.address, nftDescriptor.address);

    expect(nfpm.address).to.not.be.empty;
  });

  it('should watch NonfungiblePositionManager contract', async () => {
    // Watch factory contract.
    await watchContract(db, nfpm.address, 'nfpm', 100);

    // Verifying with the db.
    const indexer = new Indexer(config, db, ethClient);
    assert(await indexer.isUniswapContract(nfpm.address), 'NonfungiblePositionManager contract not added to database.');
  });

  it('should mint specified amount: nfpm', done => {
    (async () => {
      const fee = 3000;
      pool = await testCreatePool(uniClient, factory, token0, token1, POOL_ABI, signer, fee);

      const sqrtPrice = '79228162514264337593543950336';
      await testInitialize(uniClient, pool, 0, sqrtPrice);

      const amount0Desired = 17;
      const amount1Desired = 14;
      const amount0Min = 0;
      const amount1Min = 1;
      const deadline = 1634367993;

      const tickSpacing = await pool.tickSpacing();
      // https://github.com/Uniswap/uniswap-v3-core/blob/main/test/UniswapV3Pool.spec.ts#L196
      tickLower = getMinTick(tickSpacing);
      tickUpper = getMaxTick(tickSpacing);

      // Approving tokens for NonfungiblePositionManager contract.
      // https://github.com/Uniswap/uniswap-v3-periphery/blob/main/test/NonfungiblePositionManager.spec.ts#L44
      const transactions: ContractTransaction[] = await Promise.all([
        token0.approve(nfpm.address, constants.MaxUint256),
        token1.approve(nfpm.address, constants.MaxUint256)
      ]);

      await Promise.all(transactions.map(tx => tx.wait()));

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        // TODO Verify what should amount values be checked against
        if (value.event.__typename === 'MintEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(pool.address);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('MintEvent');
          expect(value.event.sender).to.equal(nfpm.address);
          expect(value.event.owner).to.equal(nfpm.address);
          expect(value.event.tickLower).to.equal(tickLower.toString());
          expect(value.event.tickUpper).to.equal(tickUpper.toString());
          expect(value.event.amount).to.equal(amount1Desired.toString());
          expect(value.event.amount0).to.equal(amount1Desired.toString());
          expect(value.event.amount1).to.equal(amount1Desired.toString());

          expect(value.proof).to.not.be.empty;
        }
        if (value.event.__typename === 'TransferEvent') {
          const expectedFrom = '0x0000000000000000000000000000000000000000';
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(nfpm.address);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('TransferEvent');
          expect(value.event.from).to.equal(expectedFrom);
          expect(value.event.to).to.equal(recipient);
          expect(value.event.tokenId).to.equal('1');

          expect(value.proof).to.not.be.empty;
        }
        if (value.event.__typename === 'IncreaseLiquidityEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(nfpm.address);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('IncreaseLiquidityEvent');
          expect(value.event.tokenId).to.equal('1');
          expect(value.event.liquidity).to.equal(amount1Desired.toString());
          expect(value.event.amount0).to.equal(amount1Desired.toString());
          expect(value.event.amount1).to.equal(amount1Desired.toString());

          expect(value.proof).to.not.be.empty;

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Position manger mint.
      await nfpm.mint({
        token0: token0.address,
        token1: token1.address,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        recipient,
        deadline,
        fee
      });
    })().catch((error) => {
      done(error);
    });
  });

  it('should increase liquidity', done => {
    (async () => {
      const tokenId = 1;
      const amount0Desired = 14;
      const amount1Desired = 16;
      const amount0Min = 0;
      const amount1Min = 1;
      const deadline = 1634367993;

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'MintEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(pool.address);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('MintEvent');
          expect(value.event.sender).to.equal(nfpm.address);
          expect(value.event.owner).to.equal(nfpm.address);
          expect(value.event.tickLower).to.equal(tickLower.toString());
          expect(value.event.tickUpper).to.equal(tickUpper.toString());
          expect(value.event.amount).to.equal(amount0Desired.toString());
          expect(value.event.amount0).to.equal(amount0Desired.toString());
          expect(value.event.amount1).to.equal(amount0Desired.toString());

          expect(value.proof).to.not.be.empty;
        }
        if (value.event.__typename === 'IncreaseLiquidityEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(nfpm.address);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('IncreaseLiquidityEvent');
          expect(value.event.tokenId).to.equal('1');
          expect(value.event.liquidity).to.equal(amount0Desired.toString());
          expect(value.event.amount0).to.equal(amount0Desired.toString());
          expect(value.event.amount1).to.equal(amount0Desired.toString());

          expect(value.proof).to.not.be.empty;

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Position manger increase liquidity.
      await nfpm.increaseLiquidity({
        tokenId,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        deadline
      });
    })().catch((error) => {
      done(error);
    });
  });

  it('should decrease liquidity', done => {
    (async () => {
      const tokenId = 1;
      const liquidity = 5;
      const amount0Min = 0;
      const amount1Min = 2;
      const deadline = 1634367993;

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'BurnEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(pool.address);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('BurnEvent');
          expect(value.event.owner).to.equal(nfpm.address);
          expect(value.event.tickLower).to.equal(tickLower.toString());
          expect(value.event.tickUpper).to.equal(tickUpper.toString());
          expect(value.event.amount).to.equal(liquidity.toString());
          expect(value.event.amount0).to.not.be.empty;
          expect(value.event.amount1).to.not.be.empty;

          expect(value.proof).to.not.be.empty;
        }
        if (value.event.__typename === 'DecreaseLiquidityEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(nfpm.address);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('DecreaseLiquidityEvent');
          expect(value.event.tokenId).to.equal('1');
          expect(value.event.liquidity).to.equal(liquidity.toString());
          expect(value.event.amount0).to.not.be.empty;
          expect(value.event.amount1).to.not.be.empty;

          expect(value.proof).to.not.be.empty;

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Position manger decrease liquidity.
      await nfpm.decreaseLiquidity({
        tokenId,
        liquidity,
        amount0Min,
        amount1Min,
        deadline
      });
    })().catch((error) => {
      done(error);
    });
  });

  it('should collect fees', done => {
    (async () => {
      const tokenId = 1;
      const amount0Max = 15;
      const amount1Max = 15;

      // Subscribe using UniClient.
      const subscription = await uniClient.watchEvents((value: any) => {
        if (value.event.__typename === 'BurnEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(pool.address);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('BurnEvent');
          expect(value.event.owner).to.equal(nfpm.address);
          expect(value.event.tickLower).to.equal(tickLower.toString());
          expect(value.event.tickUpper).to.equal(tickUpper.toString());
          expect(value.event.amount).to.equal('0');
          expect(value.event.amount0).to.equal('0');
          expect(value.event.amount1).to.equal('0');

          expect(value.proof).to.not.be.empty;
        }
        if (value.event.__typename === 'CollectEvent') {
          expect(value.block).to.not.be.empty;
          expect(value.tx).to.not.be.empty;
          expect(value.contract).to.equal(nfpm.address);
          expect(value.eventIndex).to.be.a('number');

          expect(value.event.__typename).to.equal('CollectEvent');
          expect(value.event.tokenId).to.equal('1');
          expect(value.event.recipient).to.equal(recipient);
          expect(value.event.amount0).to.not.be.empty;
          expect(value.event.amount1).to.not.be.empty;

          expect(value.proof).to.not.be.empty;

          if (subscription) {
            subscription.unsubscribe();
          }
          done();
        }
      });

      // Position manger increase liquidity.
      await nfpm.collect({
        tokenId,
        recipient,
        amount0Max,
        amount1Max
      });
    })().catch((error) => {
      done(error);
    });
  });
});
