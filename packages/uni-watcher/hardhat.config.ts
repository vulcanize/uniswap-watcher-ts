import { HardhatUserConfig } from 'hardhat/config';
import '@nomiclabs/hardhat-waffle';

const config: HardhatUserConfig = {
  solidity: '0.7.6',
  paths: {
    sources: './test/Contracts',
    tests: './src'
  },
  mocha: {
    timeout: 50000
  }
};

export default config;
