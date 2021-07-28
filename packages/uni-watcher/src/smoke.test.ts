import { expect, assert } from 'chai';
import { ethers } from 'hardhat';
import { Contract } from 'ethers';
import 'reflect-metadata';
import '@nomiclabs/hardhat-ethers';

import { Config, getConfig } from '@vulcanize/util';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import { getCache } from '@vulcanize/cache';
import { EthClient } from '@vulcanize/ipld-eth-client';
import {
  abi as FACTORY_ABI,
  bytecode as FACTORY_BYTECODE
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json';

import { Indexer } from './indexer';
import { Database } from './database';
import { watchContract } from './utils/index';

describe('uni-watcher', () => {
  let factory: Contract;
  let token0: Contract;
  let token1: Contract;
  let pool: string;
  let config: Config;

  before(async () => {
    const configFile = './environments/local.toml';
    config = await getConfig(configFile);
  });

  it('should verify factory deployment', async () => {
    // Deploy factory from uniswap package.
    const [signer] = await ethers.getSigners();
    const Factory = new ethers.ContractFactory(FACTORY_ABI, FACTORY_BYTECODE, signer);
    factory = await Factory.deploy();

    expect(factory.address).to.not.be.empty;
  });

  it('should verify watch contract', async () => {
    // Watch factory contract.
    const { database: dbConfig } = config;
    assert(dbConfig, 'Missing dbConfig');

    const db = new Database(dbConfig);
    await db.init();

    await watchContract(db, factory.address, 'factory', 100);

    // Verifying with the db.
    const { upstream } = config;
    const { ethServer: { gqlApiEndpoint, gqlPostgraphileEndpoint }, cache: cacheConfig } = upstream;
    assert(gqlApiEndpoint, 'Missing upstream ethServer.gqlApiEndpoint');
    assert(gqlPostgraphileEndpoint, 'Missing upstream ethServer.gqlPostgraphileEndpoint');

    const cache = await getCache(cacheConfig);
    const ethClient = new EthClient({
      gqlEndpoint: gqlApiEndpoint,
      gqlSubscriptionEndpoint: gqlPostgraphileEndpoint,
      cache
    });
    const indexer = new Indexer(config, db, ethClient);
    assert(await indexer.isUniswapContract(factory.address), 'Factory contract not added to database.');
  });

  it('should verify token deployment', async () => {
    // Deploy 2 tokens.
    const Token = await ethers.getContractFactory('TestERC20');

    token0 = await Token.deploy(ethers.BigNumber.from(2).pow(255));
    expect(token0.address).to.not.be.empty;

    token1 = await Token.deploy(ethers.BigNumber.from(2).pow(255));
    expect(token1.address).to.not.be.empty;
  });

  it('should detect a PoolCreatedEvent', done => {
    (async () => {
      const fee = 500;
      const { server: { host, port } } = config;
      const endpoint = `http://${host}:${port}/graphql`;
      const gqlEndpoint = endpoint;
      const gqlSubscriptionEndpoint = endpoint;

      // Subscribe using UniClient.
      const uniClient = new UniClient({
        gqlEndpoint,
        gqlSubscriptionEndpoint
      });

      const subscription = await uniClient.watchEvents((value: any) => {
        expect(value.contract).to.equal(factory.address);
        expect(value.eventIndex).to.be.a('number');
        expect(value.event.__typename).to.equal('PoolCreatedEvent');

        const tokens = new Set([token0.address, token1.address]);
        expect(new Set([value.event.token0, value.event.token1])).to.eql(tokens);
        expect(value.event.fee).to.equal(fee.toString());
        expect(value.event.pool).to.not.be.empty;
        pool = value.event.pool;

        if (subscription) {
          subscription.unsubscribe();
        }
        done();
      });

      // Create pool.
      await factory.createPool(token0.address, token1.address, fee);
    })();
  });
});
