import { HardhatUserConfig } from 'hardhat/config';
import '@nomiclabs/hardhat-waffle';

const config: HardhatUserConfig = {
  solidity: '0.7.3',
  paths: {
    tests: './src'
  }
};

export default config;
