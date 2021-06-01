// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract TestEnums {
    enum Choices { Choice0, Choice1, Choice2, Choice3 }

    Choices choicesEnum1;

    Choices choicesEnum2;

    // Set variable choicesEnum1.
    function setChoicesEnum1(Choices value) external {
        choicesEnum1 = value;
    }
}
