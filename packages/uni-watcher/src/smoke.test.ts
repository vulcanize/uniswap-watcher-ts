import { expect } from 'chai';
import '@nomiclabs/hardhat-ethers';
import { ethers } from 'hardhat';
import { watch } from './utils/index';

import {
  abi as FACTORY_ABI,
  bytecode as FACTORY_BYTECODE
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json';

before(async () => {
  // Deploy factory from uniswap package
  const [signer] = await ethers.getSigners();
  const Factory = new ethers.ContractFactory(FACTORY_ABI, FACTORY_BYTECODE, signer);
  const factory = await Factory.deploy();

  console.log('Factory deployed to:', factory.address);

  // Watch factory contract
  await watch('./environments/local.toml', factory.address, 'factory', 100);
});

describe('uni-watcher', () => {
  it('should do nothing for now', () => {
    console.log('empty test');
  });
});
