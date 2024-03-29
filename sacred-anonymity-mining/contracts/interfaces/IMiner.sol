// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IMiner {
  function updateShares(address instance, bool byDeposit, bytes32 nullifier) external;
}
