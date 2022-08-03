//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../Governance.sol";

contract MockGovernance is Governance {
  uint256 public time = block.timestamp;

  function setTimestamp(uint256 time_) public {
    time = time_;
  }

  function getBlockTimestamp() internal override view returns (uint256) {
    // solium-disable-next-line security/no-block-members
    return time;
  }

}
