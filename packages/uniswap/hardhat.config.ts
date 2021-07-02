import { task, HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";

import './tasks/accounts'
import './tasks/pool-create'

const config: HardhatUserConfig = {
  solidity: "0.7.3",
};

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
export default config;
