// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "./TestIntegers.sol";

contract TestBasicMapping {
    // Mapping type variable occupies one single slot but the actual elements are stored at a different storage slot that is computed using a Keccak-256 hash.
    // https://docs.soliditylang.org/en/v0.8.4/internals/layout_in_storage.html#mappings-and-dynamic-arrays
    mapping(address => uint) public addressUintMap;

    // Mapping type variable occupies the next single slot.
    mapping(bool => int) public boolIntMap;

    // Mapping with int128 keys and contract type values;
    mapping(int128 => TestIntegers) public intContractMap;

    // Mapping with uint32 keys and fixed-size byte array values;
    mapping(uint32 => bytes16) public uintBytesMap;

    // Set variable addressUintMap.
    function setAddressUintMap(uint value) external {
        addressUintMap[msg.sender] = value;
    }

    // Set variable boolIntMap.
    function setBoolIntMap(bool key, int value) external {
        boolIntMap[key] = value;
    }

    // Set variable boolIntMap.
    function setIntContractMap(int128 key, TestIntegers value) external {
        intContractMap[key] = value;
    }

    // Set variable boolIntMap.
    function setUintBytesMap(uint32 key, bytes16 value) external {
        uintBytesMap[key] = value;
    }
}
