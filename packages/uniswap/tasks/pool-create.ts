import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { task, types } from "hardhat/config";
import {
  abi as FACTORY_ABI,
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'

task("pool-create", "Creates pool using Factory contract")
  .addParam('factory', 'Address of factory contract', undefined, types.string)
  .addParam('token0', 'Address of first token contract', undefined, types.string)
  .addParam('token1', 'Address of second token contract', undefined, types.string)
  .addParam('fee', "The pool's fee", undefined, types.int)
  .setAction(async (args, hre) => {
    const { factory: factoryAddress, token0, token1, fee } = args
    const [signer] = await hre.ethers.getSigners();
    const factory = new hre.ethers.Contract(factoryAddress, FACTORY_ABI, signer );
    const transaction = await factory.createPool(token0, token1, fee)
    const receipt = await transaction.wait();
    console.log('logs', receipt.logs)
  });
