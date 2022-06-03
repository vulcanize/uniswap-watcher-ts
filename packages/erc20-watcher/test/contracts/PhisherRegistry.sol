// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

// contract PhisherRegistry is Ownable, RevokableOwnerableEnforcer {
contract PhisherRegistry is Ownable {
    // constructor(string memory name) RevokableOwnerableEnforcer(name) {}
    mapping(string => bool) public isPhisher;

    event PhisherStatusUpdated(string indexed entity, bool isPhisher);

    function claimIfPhisher(string calldata identifier, bool isAccused)
        public
        onlyOwner
    {
        isPhisher[identifier] = isAccused;
        emit PhisherStatusUpdated(identifier, isAccused);
    }
}
