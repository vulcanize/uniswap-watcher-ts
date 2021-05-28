import { expect } from "chai";
import hre from "hardhat";

import { getStorageValue } from "../src/lib/storage";

describe("Storage", function() {
  it("get value for integer type", async function() {
    const Integers = await hre.ethers.getContractFactory("TestIntegers");
    const integers = await Integers.deploy();
    await integers.deployed();

    const value = 123;
    await integers.setInt3(value);
    const storageValue = await getStorageValue(hre, "TestIntegers", "int3", integers.address)
    expect(storageValue).to.equal(value)
  });
});
