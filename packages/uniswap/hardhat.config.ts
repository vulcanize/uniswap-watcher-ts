import 'dotenv/config';
import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";

import './tasks/accounts'
import './tasks/token-create'
import './tasks/pool-create'

const config: HardhatUserConfig = {
  solidity: "0.8.0",
  networks: {
    private: {
      url: process.env.ETH_RPC_URL
    }
  },
};

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
export default config;
