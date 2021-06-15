// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

contract TestDynamicArrays {
    // Dynamic sized array variable will use 1 single slot which contains number of array elements.
    int[] intArray;

    // Dynamic sized array always uses the next consecutive single slot.
    uint128[] uintArray;

    bool[] boolArray;

    // Set variable intArray.
    function setIntArray(int[] calldata value) external {
        intArray = value;
    }

    // Set variable uintArray.
    function setUintArray(uint128[] calldata value) external {
        uintArray = value;
    }

    // Set variable boolArray.
    function setBoolArray(bool[] calldata value) external {
        boolArray = value;
    }
}
