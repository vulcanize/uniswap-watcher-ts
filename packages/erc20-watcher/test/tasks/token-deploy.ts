//
// Copyright 2021 Vulcanize, Inc.
//

// import { task, types } from 'hardhat/config';
// import '@nomiclabs/hardhat-ethers';

// const DEFAULT_INITIAL_SUPPLY = '1000000000000000000000';

// task('token-deploy', 'Deploys GLD token')
//   .addOptionalParam('initialSupply', 'Set total supply', DEFAULT_INITIAL_SUPPLY, types.string)
//   .setAction(async (args, hre) => {
//     const { initialSupply } = args;
//     await hre.run('compile');
//     const Token = await hre.ethers.getContractFactory('GLDToken');
//     const token = await Token.deploy(hre.ethers.BigNumber.from(initialSupply));

//     console.log('GLD Token deployed to:', token.address);
//   });

import { task } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';

task('contract-deploy', 'Deploys PhisherRegistry contract').setAction(
  async (args, hre) => {
    await hre.run('compile');
    const Contract = await hre.ethers.getContractFactory('PhisherRegistry');
    const contract = await Contract.deploy();

    console.log('PhisherRegistry deployed to:', contract.address);
  }
);
