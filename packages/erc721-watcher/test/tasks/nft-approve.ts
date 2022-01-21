//
// Copyright 2022 Vulcanize, Inc.
//

import { task, types } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';
import { ContractTransaction } from 'ethers';

task('nft-approve', 'Approve tokens for recipient')
  .addParam('nft', 'Contract address', undefined, types.string)
  .addParam('to', 'Approve for account address', undefined, types.string)
  .addParam('tokenId', 'Token ID to approve', undefined, types.string)
  .setAction(async (args, hre) => {
    const { nft: contractAddress, tokenId, to } = args;
    await hre.run('compile');
    const NFT = await hre.ethers.getContractFactory('TestNFT');
    const nft = NFT.attach(contractAddress);

    const transaction: ContractTransaction = await nft.approve(to, tokenId);
    const receipt = await transaction.wait();

    if (receipt.events) {
      const ApprovalEvent = receipt.events.find(el => el.event === 'Approval');

      if (ApprovalEvent && ApprovalEvent.args) {
        console.log('Approval Event');
        console.log('owner:', ApprovalEvent.args.owner.toString());
        console.log('approved:', ApprovalEvent.args.approved.toString());
        console.log('tokenId:', ApprovalEvent.args.tokenId.toString());
      }
    }
  });
