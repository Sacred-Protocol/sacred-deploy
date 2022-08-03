// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract TwoStepOwnerShipMgr {
  address internal owner;
  mapping (address => bool) private invited;
	event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
	
  modifier onlyOwner() {
    require(msg.sender == owner, "Not authorized");
    _;
  }

  modifier onlyInvited() {
  	require(invited[msg.sender] == true, "Not authorized");
    _;
  }

  constructor(address _owner) {
    owner = _owner;
  }
  
  function transferOwnership(address newOwner) public onlyOwner {
	  require(newOwner != address(0), "owner cannot be zero address");
  	invited[newOwner] = true;
  }
  
  function ownershipAccepted() public onlyInvited {
	  _transferOwnership(msg.sender);
  	delete invited[msg.sender];
  }
  
  function renounceOwnership() public onlyOwner {
    _transferOwnership(address(0));
  }
  
  function _transferOwnership(address newOwner) internal {
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }
}
