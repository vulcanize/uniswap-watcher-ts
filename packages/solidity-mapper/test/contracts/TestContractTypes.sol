// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

import "./TestAddress.sol";

contract TestContractTypes {
    TestAddress addressContract1;

    TestAddress addressContract2;

    // Set variable addressContract1.
    function setAddressContract1 (TestAddress value) external {
        addressContract1 = value;
    }

    // Set variable addressContract2.
    function setAddressContract2 (TestAddress value) external {
        addressContract2 = value;
    }
}
