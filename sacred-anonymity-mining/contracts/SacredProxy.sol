// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/ISacredInstance.sol";
import "./interfaces/ISacredTrees.sol";
import "./interfaces/IMiner.sol";
import "sacred-contracts-eth/contracts/TwoStepOwnerShipMgr.sol";

contract SacredProxy is TwoStepOwnerShipMgr{
  using SafeERC20 for IERC20;

  event EncryptedNote(address indexed sender, bytes encryptedNote);
  event InstanceStateUpdated(ISacredInstance indexed instance, InstanceState state);
  event SacredTreesUpdated(ISacredTrees addr);

  enum InstanceState { DISABLED, ENABLED, MINEABLE }

  struct Instance {
    bool isERC20;
    IERC20 token;
    InstanceState state;
  }

  struct Sacred {
    ISacredInstance addr;
    Instance instance;
  }

  struct SacredParam {
    address addr;
    Instance instance;
  }

  ISacredTrees public sacredTrees;
  address public immutable governance;
  address public miner;
  bool private initialized = false;
  mapping(ISacredInstance => Instance) public instances;

  modifier onlyGovernance() {
    require(msg.sender == governance, "Not authorized");
    _;
  }

  constructor(
    address _owner,
    address _sacredTrees,
    address _governance,
    SacredParam[] memory _instances
  ) TwoStepOwnerShipMgr(_owner) {
    sacredTrees = ISacredTrees(_sacredTrees);
    governance = _governance;
    for (uint256 i = 0; i < _instances.length; ++i) {
      Sacred memory instance;
      instance.addr =  ISacredInstance(_instances[i].addr);
      instance.instance = _instances[i].instance;
      _updateInstance(instance);
    }
  }

  function initialize(address _miner) external onlyOwner {
    if(!initialized) {
      miner = _miner;
      initialized = true;
    }
  }

  function deposit(
    address _sacredAddr,
    bytes32 _commitment,
    bytes calldata _encryptedNote
  ) public payable virtual {
    ISacredInstance _sacred = ISacredInstance(_sacredAddr);
    Instance memory instance = instances[_sacred];
    require(instance.state != InstanceState.DISABLED, "The instance is not supported");

    if (instance.isERC20) {
      instance.token.safeTransferFrom(msg.sender, address(this), _sacred.denomination());
    }
    _sacred.deposit{ value: msg.value }(_commitment);

    if (instance.state == InstanceState.MINEABLE) {
      sacredTrees.registerDeposit(address(_sacred), _commitment);
    }
    IMiner(miner).updateShares(_sacredAddr, true, 0);
    emit EncryptedNote(msg.sender, _encryptedNote);
  }

  function withdraw(
    address _sacredAddr,
    bytes calldata _proof,
    bytes32 _root,
    bytes32 _nullifierHash,
    address payable _recipient,
    address payable _relayer,
    uint256 _fee,
    uint256 _refund
  ) public payable virtual {
    ISacredInstance _sacred = ISacredInstance(_sacredAddr);
    Instance memory instance = instances[_sacred];
    require(instance.state != InstanceState.DISABLED, "The instance is not supported");

    _sacred.withdraw{ value: msg.value }(_proof, _root, _nullifierHash, _recipient, _relayer, _fee, _refund);
    if (instance.state == InstanceState.MINEABLE) {
      sacredTrees.registerWithdrawal(address(_sacred), _nullifierHash);
    }
    IMiner(miner).updateShares(_sacredAddr, false, _nullifierHash);
  }

  function backupNotes(bytes[] calldata _encryptedNotes) external virtual {
    for (uint256 i = 0; i < _encryptedNotes.length; ++i) {
      emit EncryptedNote(msg.sender, _encryptedNotes[i]);
    }
  }

  function updateInstance(Sacred calldata _sacred) external virtual onlyGovernance {
    _updateInstance(_sacred);
  }

  function setSacredTreesContract(ISacredTrees _sacredTrees) external virtual onlyGovernance {
    require(address(_sacredTrees) != address(0), "_sacredTrees cannot be zero address");
    sacredTrees = _sacredTrees;
    emit SacredTreesUpdated(_sacredTrees);
  }

  /// @dev Method to claim junk and accidentally sent tokens
  function rescueTokens(
    IERC20 _token,
    address payable _to,
    uint256 _amount
  ) external virtual onlyGovernance {
    require(_to != address(0), "SACRED: can not send to zero address");

    if (_token == IERC20(address(0))) {
      // for Ether
      uint256 totalBalance = address(this).balance;
      uint256 balance = Math.min(totalBalance, _amount);
      _to.transfer(balance);
    } else {
      // any other erc20
      uint256 totalBalance = _token.balanceOf(address(this));
      uint256 balance = Math.min(totalBalance, _amount);
      require(balance > 0, "SACRED: trying to send 0 balance");
      _token.safeTransfer(_to, balance);
    }
  }

  function _updateInstance(Sacred memory _sacred) internal {
    require(address(_sacred.addr) != address(0), "SacredInstance cannot be zero address");
    instances[_sacred.addr] = _sacred.instance;
    if (_sacred.instance.isERC20) {
      IERC20 token = IERC20(_sacred.addr.token());
      require(token == _sacred.instance.token, "Incorrect token");
      uint256 allowance = token.allowance(address(this), address(_sacred.addr));

      if (_sacred.instance.state != InstanceState.DISABLED && allowance == 0) {
        token.safeApprove(address(_sacred.addr), uint256(int256(-1)));
      } else if (_sacred.instance.state == InstanceState.DISABLED && allowance != 0) {
        token.safeApprove(address(_sacred.addr), 0);
      }
    }
    emit InstanceStateUpdated(_sacred.addr, _sacred.instance.state);
  }
}
