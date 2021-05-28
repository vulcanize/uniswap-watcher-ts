// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import hre from "hardhat";

const CONTRACTS = ['TestIntegers']

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // deploy contracts
  const deployPromises = CONTRACTS.map(async (contractName) => {
    // We get the contract to deploy
    const contractFactory = await hre.ethers.getContractFactory(contractName);
    const contract = await contractFactory.deploy();

    await contract.deployed();

    console.log(`${contractName} deployed to: ${contract.address}`);
  })

  await Promise.all(deployPromises);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
