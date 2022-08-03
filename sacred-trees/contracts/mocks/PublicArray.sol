// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

contract PublicArray {
  uint256[] public deposits;
  uint256[] public withdrawals;

  function lastProcessedDepositLeaf() external view returns (uint256) {}

  function lastProcessedWithdrawalLeaf() external view returns (uint256) {}

  function depositRoot() external view returns (bytes32) {}

  function withdrawalRoot() external view returns (bytes32) {}

  function setDeposits(uint256[] memory _deposits) public {
    for (uint256 i = 0; i < _deposits.length; i++) {
      deposits.push(_deposits[i]);
    }
  }

  function setWithdrawals(uint256[] memory _withdrawals) public {
    for (uint256 i = 0; i < _withdrawals.length; i++) {
      withdrawals.push(_withdrawals[i]);
    }
  }
}
