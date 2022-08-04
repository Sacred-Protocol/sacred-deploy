// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/ISacredInstance.sol";
import "./interfaces/ISacredTrees.sol";
import "./interfaces/IMiner.sol";

interface AToken {
  function balanceOf(address _user) external view returns (uint256);
  function approve(address spender, uint256 amount) external returns (bool);
  function transfer(address receiver, uint256 amount) external returns (bool);
}

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
    uint256 _amount,
    address payable _receiver
  ) external payable onlyMiner {
    require(address(this).balance >= _amount, "Inadequate amount of interests to send");
    (bool success, ) = _receiver.call{value: _amount}("");
    require(success, "Transfer failed");
  }
}
