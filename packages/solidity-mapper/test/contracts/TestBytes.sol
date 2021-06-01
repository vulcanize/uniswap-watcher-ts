// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestBytes {
    // Variables are packed together in a slot as they occupy less than 32 bytes together.
    bytes10 bytesTen;
    bytes20 bytesTwenty;

    // Variable is stored in the next slot as there is not enough space for it in the previous slot.
    bytes30 bytesThirty;

    // Dynamically sized byte arrays will take the next single slot.
    // If value is 32 or more bytes the data is stored in keccak256(slot).
    // https://docs.soliditylang.org/en/v0.7.4/internals/layout_in_storage.html#bytes-and-string
    bytes bytesArray;

    // Set variable bytesTen.
    function setBytesTen(bytes10 value) external {
        bytesTen = value;
    }

    // Set variable bytesTwenty.
    function setBytesTwenty(bytes20 value) external {
        bytesTwenty = value;
    }

    // Set variable bytesThirty.
    function setBytesThirty(bytes30 value) external {
        bytesThirty = value;
    }

    // Set variable bytesArray.
    function setBytesArray(bytes calldata value) external {
        bytesArray = value;
    }
}
