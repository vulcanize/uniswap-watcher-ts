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

  it("get value for address type", async function() {
    const Address = await hre.ethers.getContractFactory("TestAddress");
    const address = await Address.deploy();
    await address.deployed();

    const [signer] = await hre.ethers.getSigners();
    await address.setAddress1(signer.address);
    const storageValue = await getStorageValue(hre, "TestAddress", "address1", address.address)
    expect(storageValue.toLowerCase()).to.equal(signer.address.toLowerCase())
  });

  describe("string type", function () {
    let strings

    before(async () => {
      const Strings = await hre.ethers.getContractFactory("TestStrings");
      strings = await Strings.deploy();
      await strings.deployed();
    })

    it("get value for string length less than 32 bytes", async function() {
      const value = 'Hello world.'
      await strings.setString1(value);
      const storageValue = await getStorageValue(hre, "TestStrings", "string1", strings.address);
      expect(storageValue).to.equal(value);
    });

    it("get value for string length more than 32 bytes", async function() {
      const value = 'This sentence is more than 32 bytes long.'
      await strings.setString2(value);
      const storageValue = await getStorageValue(hre, "TestStrings", "string2", strings.address);
      expect(storageValue).to.equal(value);
    });
  })
});
