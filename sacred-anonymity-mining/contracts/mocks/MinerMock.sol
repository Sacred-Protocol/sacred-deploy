// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../Miner.sol";

contract MinerMock is Miner {
  uint256 public timestamp;

  constructor(
    ReferenceContracts memory contracts,
    address[3] memory _verifiers,
    address _hasher,
    bytes32 _accountRoot,
    Rate[] memory _rates,
    uint256 _minimumInterests,
    uint256 _aaveInterestFee
  ) Miner(contracts, _verifiers, _hasher, _accountRoot, _rates, _minimumInterests, _aaveInterestFee) {}

}
