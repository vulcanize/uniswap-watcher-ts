// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { run, ethers } from "hardhat";
import {
  abi as FACTORY_ABI,
  bytecode as FACTORY_BYTECODE,
} from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'

// TODO: Get fee from uniswap Factory contract.
const FEE = 500;

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await run('compile');

  // We get the contract to deploy
  const [signer] = await ethers.getSigners();
  const Factory = new ethers.ContractFactory(FACTORY_ABI , FACTORY_BYTECODE, signer);
  const factory = await Factory.deploy();

  await factory.deployed();
  console.log("Factory deployed to:", factory.address);

  const token0 = await run('token-create', {
    name: 'Token0',
    symbol: 'TK0'
  })

  const token1 = await run('token-create', {
    name: 'Token1',
    symbol: 'TK1'
  })

  await run('pool-create', {
    factory: factory.address,
    token0: token0.address,
    token1: token1.address,
    fee: FEE
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
