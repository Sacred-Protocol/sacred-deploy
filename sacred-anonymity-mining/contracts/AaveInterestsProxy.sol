// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/ISacredInstance.sol";
import "./interfaces/ISacredTrees.sol";
import "./interfaces/IMiner.sol";

contract AaveInterestsProxy {
  address public miner;
  address private immutable owner;
  bool private initialized = false;

  modifier onlyMiner() {
    require(msg.sender == miner, "Not authorized");
    _;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "Not authorized");
    _;
  }

  constructor(address _owner) {
    owner = _owner;
  }

  fallback() external payable { }

  function initialize(address _miner) external onlyOwner {
    if(!initialized) {
      miner = _miner;
      initialized = true;
    }
  }

  function withdraw(
    address asset,
    uint256 amount,
    address payable recipient
  ) external payable onlyMiner {
    if(asset == address(0)) {
      require(address(this).balance >= amount, "Inadequate amount of interests to send");
      (bool success, ) = recipient.call{value: amount}("");
      require(success, "Transfer failed");
    } else {
      require(IERC20(asset).balanceOf(address(this)) >= amount, "Inadequate amount of interests to send");
      require(IERC20(asset).transfer(recipient, amount), "transfer failed");
    }
  }
}
