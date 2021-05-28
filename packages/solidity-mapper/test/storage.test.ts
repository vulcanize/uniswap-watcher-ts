import { expect } from "chai";
import hre from "hardhat";

import { getStorageValue } from "../src/lib/storage";

describe("Storage", function() {
  it("get value for integer type", async function() {
    const Integers = await hre.ethers.getContractFactory("TestIntegers");
    const integers = await Integers.deploy();
    await integers.deployed();

    let value = 12;
    await integers.setInt1(value);
    let storageValue = await getStorageValue(hre, "TestIntegers", "int1", integers.address);
    expect(storageValue).to.equal(value);
  });

  it("get value for unsigned integer type", async function() {
    const UnsignedIntegers = await hre.ethers.getContractFactory("TestUnsignedIntegers");
    const unsignedIntegers = await UnsignedIntegers.deploy();
    await unsignedIntegers.deployed();

    const value = 123;
    await unsignedIntegers.setUint1(value);
    const storageValue = await getStorageValue(hre, "TestUnsignedIntegers", "uint1", unsignedIntegers.address);
    expect(storageValue).to.equal(value);
  });
});
