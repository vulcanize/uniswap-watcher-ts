// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.7.0;

contract TestBooleans {
    // Boolean type variables are packed together in a slot as they occupy less than 32 bytes together.
    bool bool1;
    bool bool2;

    // Set variable bool1.
    function setBool1(bool value) external {
        bool1 = value;
    }

    // Set variable bool2.
    function setBool2(bool value) external {
        bool2 = value;
    }
}
