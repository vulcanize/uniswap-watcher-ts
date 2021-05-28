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

  it("get value for boolean type", async function() {
    const Booleans = await hre.ethers.getContractFactory("TestBooleans");
    const booleans = await Booleans.deploy();
    await booleans.deployed();

    let value = true
    await booleans.setBool1(value);
    let storageValue = await getStorageValue(hre, "TestBooleans", "bool1", booleans.address)
    expect(storageValue).to.equal(value)

    value = false
    await booleans.setBool2(value);
    storageValue = await getStorageValue(hre, "TestBooleans", "bool2", booleans.address)
    expect(storageValue).to.equal(value)
  });
});
