// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

abstract contract TwoStepOwnerable {
  address internal owner;
  address private invited;
	event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
	
  modifier onlyOwner() {
    require(msg.sender == owner, "Not authorized");
    _;
  }

  modifier onlyInvited() {
  	require(msg.sender == invited, "Not authorized");
    _;
  }

  constructor(address _owner) {
    owner = _owner;
  }
  
  function transferOwnership(address newOwner) public onlyOwner {
	  require(newOwner != address(0), "owner cannot be zero address");
  	invited = newOwner;
  }
  
  function ownershipAccepted() public onlyInvited {
	  _transferOwnership(msg.sender);
  	invited = address(0);
  }

  function revokeInvitation() public onlyInvited {
    invited = address(0);
  }
  
  function renounceOwnership() public onlyOwner {
    _transferOwnership(address(0));
  }
  
  function _transferOwnership(address newOwner) internal {
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }
}
