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

  const Token = await ethers.getContractFactory('ERC20Token');
  const token0 = await Token.deploy();
  const token1 = await Token.deploy();

  await run('pool-create', {
    factory: factory.address,
    token0: token0.address,
    token1: token1.address,
    fee: 123
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
