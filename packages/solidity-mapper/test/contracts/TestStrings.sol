// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestStrings {
    string string1;

    // Variable takes the next single slot.
    // If value is 32 or more bytes the data is stored in keccak256(slot).
    // https://docs.soliditylang.org/en/v0.7.4/internals/layout_in_storage.html#bytes-and-string
    string string2;

    // Set variable string1.
    function setString1(string memory value) external {
        string1 = value;
    }

    // Set variable string2.
    function setString2(string memory value) external {
        string2 = value;
    }
}
