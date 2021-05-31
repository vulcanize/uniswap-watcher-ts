import { Contract } from '@ethersproject/contracts';
import { expect } from 'chai';
import hre from 'hardhat';
import '@nomiclabs/hardhat-ethers';

import { getStorageInfo, getStorageValue, StorageLayout } from './storage';
import { getStorageLayout, getStorageAt } from '../test/utils';

const TEST_DATA = [
  {
    name: 'TestBooleans',
    variable: 'bool1',
    output: {
      label: 'bool1',
      offset: 0,
      slot: '0x00',
      type: 't_bool'
    }
  },
  {
    name: 'TestIntegers',
    variable: 'int2',
    output: {
      slot: '0x00',
      offset: 1,
      type: 't_int16',
      label: 'int2'
    }
  },
  {
    name: 'TestUnsignedIntegers',
    variable: 'uint3',
    output: {
      label: 'uint3',
      offset: 0,
      slot: '0x01',
      type: 't_uint256'
    }
  },
  {
    name: 'TestAddress',
    variable: 'address1',
    output: {
      label: 'address1',
      offset: 0,
      slot: '0x00',
      type: 't_address'
    }
  },
  {
    name: 'TestStrings',
    variable: 'string2',
    output: {
      label: 'string2',
      offset: 0,
      slot: '0x01',
      type: 't_string_storage'
    }
  }
];

it('get storage information', async function () {
  const testPromises = TEST_DATA.map(async ({ name, variable, output }) => {
    const Contract = await hre.ethers.getContractFactory(name);
    const contract = await Contract.deploy();
    await contract.deployed();
    const storageLayout = await getStorageLayout(name);

    const storageInfo = getStorageInfo(storageLayout, variable);
    expect(storageInfo).to.include(output);
  });

  await Promise.all(testPromises);
});

describe('Get value from storage', function () {
  it('get value for integer type', async function () {
    const Integers = await hre.ethers.getContractFactory('TestIntegers');
    const integers = await Integers.deploy();
    await integers.deployed();
    const storageLayout = await getStorageLayout('TestIntegers');

    // if (storageLayout)
    const value = 12;
    await integers.setInt1(value);
    const storageValue = await getStorageValue(integers.address, storageLayout, getStorageAt, 'int1');
    expect(storageValue).to.equal(value);
  });

  it('get value for unsigned integer type', async function () {
    const UnsignedIntegers = await hre.ethers.getContractFactory('TestUnsignedIntegers');
    const unsignedIntegers = await UnsignedIntegers.deploy();
    await unsignedIntegers.deployed();
    const storageLayout = await getStorageLayout('TestUnsignedIntegers');

    const value = 123;
    await unsignedIntegers.setUint1(value);
    const storageValue = await getStorageValue(unsignedIntegers.address, storageLayout, getStorageAt, 'uint1');
    expect(storageValue).to.equal(value);
  });

  it('get value for boolean type', async function () {
    const Booleans = await hre.ethers.getContractFactory('TestBooleans');
    const booleans = await Booleans.deploy();
    await booleans.deployed();
    const storageLayout = await getStorageLayout('TestBooleans');

    let value = true;
    await booleans.setBool1(value);
    let storageValue = await getStorageValue(booleans.address, storageLayout, getStorageAt, 'bool1');
    expect(storageValue).to.equal(value);

    value = false;
    await booleans.setBool2(value);
    storageValue = await getStorageValue(booleans.address, storageLayout, getStorageAt, 'bool2');
    expect(storageValue).to.equal(value);
  });

  it('get value for address type', async function () {
    const Address = await hre.ethers.getContractFactory('TestAddress');
    const address = await Address.deploy();
    await address.deployed();
    const storageLayout = await getStorageLayout('TestAddress');

    const [signer] = await hre.ethers.getSigners();
    await address.setAddress1(signer.address);
    const storageValue = await getStorageValue(address.address, storageLayout, getStorageAt, 'address1');
    expect(storageValue).to.be.a('string');
    expect(String(storageValue).toLowerCase()).to.equal(signer.address.toLowerCase());
  });

  describe('string type', function () {
    let strings: Contract, storageLayout: StorageLayout;

    before(async () => {
      const Strings = await hre.ethers.getContractFactory('TestStrings');
      strings = await Strings.deploy();
      await strings.deployed();
      storageLayout = await getStorageLayout('TestStrings');
    });

    it('get value for string length less than 32 bytes', async function () {
      const value = 'Hello world.';
      await strings.setString1(value);
      const storageValue = await getStorageValue(strings.address, storageLayout, getStorageAt, 'string1');
      expect(storageValue).to.equal(value);
    });

    it('get value for string length more than 32 bytes', async function () {
      const value = 'This sentence is more than 32 bytes long.';
      await strings.setString2(value);
      const storageValue = await getStorageValue(strings.address, storageLayout, getStorageAt, 'string2');
      expect(storageValue).to.equal(value);
    });
  });

  it('get value for contract type', async function () {
    const contracts = ['TestContractTypes', 'TestAddress'];

    const contractPromises = contracts.map(async (contractName) => {
      const Contract = await hre.ethers.getContractFactory(contractName);
      const contract = await Contract.deploy();
      return contract.deployed();
    });

    const [testContractTypes, testAddress] = await Promise.all(contractPromises);
    const storageLayout = await getStorageLayout('TestContractTypes');

    await testContractTypes.setAddressContract1(testAddress.address);
    const storageValue = await getStorageValue(testContractTypes.address, storageLayout, getStorageAt, 'addressContract1');
    expect(storageValue).to.equal(testAddress.address.toLowerCase());
  });
});