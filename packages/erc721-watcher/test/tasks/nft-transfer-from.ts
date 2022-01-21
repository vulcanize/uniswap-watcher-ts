//
// Copyright 2022 Vulcanize, Inc.
//

import { task, types } from 'hardhat/config';
import '@nomiclabs/hardhat-ethers';
import { ContractTransaction } from 'ethers';

task('nft-transfer-from', 'Send tokens as spender')
  .addParam('nft', 'Token contract address', undefined, types.string)
  .addParam('spenderKey', 'Spender private key', undefined, types.string)
  .addParam('to', 'Transfer recipient address', undefined, types.string)
  .addParam('tokenId', 'Token ID to transfer', undefined, types.string)
  .setAction(async (args, hre) => {
    const { nft: nftAddress, to, tokenId, spenderKey } = args;
    await hre.run('compile');
    const [owner] = await hre.ethers.getSigners();
    const wallet = new hre.ethers.Wallet(spenderKey, hre.ethers.provider);
    const NFT = await hre.ethers.getContractFactory('TestNFT');
    let nft = NFT.attach(nftAddress);

    nft = nft.connect(wallet);
    const transaction: ContractTransaction = await nft.transferFrom(owner.address, to, tokenId);

    const receipt = await transaction.wait();

    if (receipt.events) {
      const TransferEvent = receipt.events.find(el => el.event === 'Transfer');

      if (TransferEvent && TransferEvent.args) {
        console.log('Transfer Event');
        console.log('from:', TransferEvent.args.from.toString());
        console.log('to:', TransferEvent.args.to.toString());
        console.log('tokenId:', TransferEvent.args.tokenId.toString());
      }
    }
  });
