// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestStructs {
    struct SingleSlotStruct {
        int16 int1;
        uint8 uint1;
    }

    // Struct variable will use one single slot as size of the members is less than 32 bytes.
    SingleSlotStruct singleSlotStruct;

    struct MultipleSlotStruct {
        uint128 uint1;
        bool bool1;
        int192 int1;
    }

    // Struct variable will use multiple slots as size of the members is more than 32 bytes.
    MultipleSlotStruct multipleSlotStruct;

    // Set variable singleSlotStruct.
    function setSingleSlotStruct(int16 int1Value, uint8 uint1Value) external {
        singleSlotStruct.int1 = int1Value;
        singleSlotStruct.uint1 = uint1Value;
    }

    // Set variable multipleSlotStruct.
    function setMultipleSlotStruct(uint128 uint1Value, bool bool1Value, int192 int1Value) external {
        multipleSlotStruct.uint1 = uint1Value;
        multipleSlotStruct.bool1 = bool1Value;
        multipleSlotStruct.int1 = int1Value;
    }
}
