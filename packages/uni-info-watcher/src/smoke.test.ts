import { expect, assert } from 'chai';
import { ethers, Contract, Signer } from 'ethers';
import 'mocha';
import { request, gql } from 'graphql-request';

import { Config, getConfig, deployTokens, createPool, initializePool } from '@vulcanize/util';
import {
  abi as FACTORY_ABI,
  bytecode as FACTORY_BYTECODE
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json';

describe('uni-info-watcher', () => {
  let signer: Signer;
  let config: Config;
  let factory: Contract;
  let pool: Contract;
  let token0Address: string;
  let token1Address: string;

  before(async () => {
    const configFile = './environments/local.toml';
    config = await getConfig(configFile);

    const { server: { host, port } } = config;
    const endpoint = `http://${host}:${port}/graphql`;

    // Getting the factory from uni-info-watcher graphQL endpoint.
    const query = gql`
    {
      factories{id},
    }`;
    const data = await request(endpoint, query);
    const factoryAddress = data.factories[0].id;
    factory = new ethers.Contract(factoryAddress, FACTORY_ABI, signer);
    expect(factory.address).to.not.be.empty;

    const networkURL = 'http://localhost:8545';
    const provider = new ethers.providers.JsonRpcProvider(networkURL);
    signer = provider.getSigner();
  });

  describe('PoolCreatedEvent', () => {
    before(async () => {
      // Deploy 2 tokens.
      ({ token0Address, token1Address } = await deployTokens(signer));

      // Create Pool.
      const fee = 500;
      await createPool(factory, token0Address, token1Address, fee);
    });
    it('', async () => {
      // TODO: Test _handlePoolCreated().
    });
  });
});
