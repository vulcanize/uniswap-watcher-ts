// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestBytes {
    // Variables are packed together in a slot as they occupy less than 32 bytes together.
    bytes10 bytesTen;
    bytes30 bytesThirty;

    // Dynamically sized byte arrays take one single slot.
    bytes bytesArray;

    // Set variable bytesTen.
    function setBytesTen(bytes10 value) external {
        bytesTen = value;
    }

    // Set variable bytesThirty.
    function setBytesTirty(bytes30 value) external {
        bytesThirty = value;
    }

    // Set variable bytesArray.
    function setBytesArray(bytes calldata value) external {
        bytesArray = value;
    }
}
