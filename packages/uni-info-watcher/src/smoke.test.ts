import { expect, assert } from 'chai';
import { ethers, Contract, Signer } from 'ethers';
import { request, gql } from 'graphql-request';
import 'mocha';

import { Config, getConfig, deployTokens, createPool, initializePool } from '@vulcanize/util';
import { Client as UniClient } from '@vulcanize/uni-watcher';
import {
  abi as FACTORY_ABI,
  bytecode as FACTORY_BYTECODE
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json';
import {
  abi as POOL_ABI
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json';

import {
  queryFactory,
  queryToken,
  queryPools
} from '../test/queries';
import { watchEvent } from '../test/utils';

const NETWORK_URL = 'http://localhost:8545';

describe('uni-info-watcher', () => {
  let factory: Contract;
  let pool: Contract;
  let token0Address: string;
  let token1Address: string;

  let signer: Signer;
  let config: Config;
  let endpoint: string;
  let uniClient: UniClient;

  before(async () => {
    const provider = new ethers.providers.JsonRpcProvider(NETWORK_URL);
    signer = provider.getSigner();

    const configFile = './environments/local.toml';
    config = await getConfig(configFile);

    const { upstream, server: { host, port } } = config;
    endpoint = `http://${host}:${port}/graphql`;

    const { uniWatcher: { gqlEndpoint, gqlSubscriptionEndpoint } } = upstream;
    uniClient = new UniClient({
      gqlEndpoint,
      gqlSubscriptionEndpoint
    });

    // Getting the factory from uni-info-watcher graphQL endpoint.
    const data = await request(endpoint, queryFactory);
    expect(data.factories).to.not.be.empty;

    const factoryAddress = data.factories[0].id;
    factory = new ethers.Contract(factoryAddress, FACTORY_ABI, signer);
    expect(factory.address).to.not.be.empty;
  });

  describe('PoolCreatedEvent', () => {
    // NOTE Skipping checking the case where a factory is absent.
    // NOTE Skipping checking entity updates that cannot be gotten using queries.

    const fee = 500;

    before(async () => {
      // Deploy 2 tokens.
      ({ token0Address, token1Address } = await deployTokens(signer));
      expect(token0Address).to.not.be.empty;
      expect(token1Address).to.not.be.empty;
    });

    it('should check for token entities and create pool', async () => {
      // Check that token entities are absent.
      request(endpoint, queryToken, { id: token0Address })
        .then(data => {
          expect(data.token).to.be.empty;
        });
      request(endpoint, queryToken, { id: token1Address })
        .then(data => {
          expect(data.token).to.be.empty;
        });

      // Create Pool.
      await createPool(factory, token0Address, token1Address, fee);

      // Wait for PoolCreatedEvent.
      const eventType = 'PoolCreatedEvent';
      await watchEvent(uniClient, eventType);

      // Sleeping for 5 sec for the entities to be processed.
      await new Promise(resolve => setTimeout(resolve, 5000));
    });

    it('should create token entities', async () => {
      // Check that token entities are present.
      request(endpoint, queryToken, { id: token0Address })
        .then(data => {
          expect(data.token).to.not.be.empty;
        });
      request(endpoint, queryToken, { id: token1Address })
        .then(data => {
          expect(data.token).to.not.be.empty;
        });
    });

    it('should create a pool entity', async () => {
      const variables = {
        tokens: [token0Address, token1Address]
      };

      // Getting the pool having deloyed tokens.
      const data = await request(endpoint, queryPools, variables);
      expect(data.pools).to.have.lengthOf(1);

      // Initializing the pool variable.
      const poolAddress = data.pools[0].id;
      pool = new Contract(poolAddress, POOL_ABI, signer);
      expect(pool.address).to.not.be.empty;

      expect(data.pools[0].feeTier).to.equal(fee.toString());
    });
  });
});
