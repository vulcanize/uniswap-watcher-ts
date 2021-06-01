// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestBytes {
    bytes10 bytesTen;

    bytes30 bytesThirty;

    bytes bytesArray;

    function setBytesTen(bytes10 value) external {
        bytesTen = value;
    }

    function setBytesTirty(bytes30 value) external {
        bytesThirty = value;
    }

    function setBytesArray(bytes calldata value) external {
        bytesArray = value;
    }
}
