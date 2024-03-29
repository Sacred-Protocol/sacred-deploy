//SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

abstract contract Core {
  /// @notice Locked token balance for each account
  mapping(address => uint256) public lockedBalance;
}
