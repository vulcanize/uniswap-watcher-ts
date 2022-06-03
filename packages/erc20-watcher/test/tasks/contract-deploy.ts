//
// Copyright 2022 Vulcanize, Inc.
//

import { task } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';

task('contract-deploy', 'Deploys PhisherRegistry contract')
  .setAction(async (args, hre) => {
    await hre.run('compile');
    const Contract = await hre.ethers.getContractFactory('PhisherRegistry');
    const contract = await Contract.deploy();

    console.log('PhisherRegistry deployed to:', contract.address);
  });
