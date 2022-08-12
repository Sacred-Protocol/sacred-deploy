// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./interfaces/IVerifier.sol";
import "./interfaces/IRewardSwap.sol";
import "./interfaces/ISacredTrees.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface Hasher {
  function poseidon(bytes32[1] calldata inputs) external pure returns (bytes32);
}

interface AaveInterestsProxy {
  function withdraw(uint256 amount, address receiver) external;
}

interface ETHSacred {
  function totalAaveInterests() external pure returns(uint256);
}

interface ERC20Sacred {
  function totalAaveInterests() external pure returns(uint256);
}

struct ReferenceContracts {
  address rewardSwap;
  address governance;
  address sacredTrees;
  address sacredProxy;
  address aaveInterestsProxy;
}

contract Miner is ReentrancyGuard{
  using SafeMath for uint256;

  uint256 constant currencyCnt = 5; 
  IVerifier public rewardVerifier;
  IVerifier public withdrawVerifier;
  IVerifier public treeUpdateVerifier;
  IRewardSwap public immutable rewardSwap;
  address public immutable governance;
  address public immutable sacredProxy;
  ISacredTrees public sacredTrees;
  ShareTrack[currencyCnt] public shareTrack;

  mapping(bytes32 => bool) public accountNullifiers;
  mapping(bytes32 => bool) public rewardNullifiers;
  uint256 public minimumInterests;
  uint256 public aaveInterestFee = 50;// 0.5%, 50 / 10000, value: 0, 1 (0.01%),~ 1000 (10%)
  uint256[currencyCnt] private instanceCount;
  Hasher private hasher;
  address public aaveInterestsProxy;
  mapping(address => uint256) public rates;
  mapping(address => uint256) public currencies;
  mapping(uint256 => address)[currencyCnt] public instances;
  mapping(address => uint256)[currencyCnt] public activeDeposits;
  mapping(bytes32 => uint256[2])[currencyCnt] public totalShareSnapshots;

  uint256 public accountCount;
  uint256 public constant ACCOUNT_ROOT_HISTORY_SIZE = 100;
  bytes32[ACCOUNT_ROOT_HISTORY_SIZE] public accountRoots;

  event NewAccount(bytes32 commitment, bytes32 nullifier, bytes encryptedAccount, uint256 index);
  event RateChanged(address instance, uint256 value);
  event VerifiersUpdated(address reward, address withdraw, address treeUpdate);
  event AaveInterestsAmount(uint256 amount);

  struct ShareTrack {
    uint256 lastUpdated;
    uint256 totalShares;
  }

  struct TreeUpdateArgs {
    bytes32 oldRoot;
    bytes32 newRoot;
    bytes32 leaf;
    uint256 pathIndices;
  }

  struct AccountUpdate {
    bytes32 inputRoot;
    bytes32 inputNullifierHash;
    bytes32 outputRoot;
    uint256 outputPathIndices;
    bytes32 outputCommitment;
  }

  struct RewardExtData {
    address relayer;
    bytes encryptedAccount;
  }

  struct RewardArgs {
    uint256 rate;
    uint256 fee;
    address instance;
    uint256 apAmount;
    uint256 aaveInterestAmount;
    bytes32 rewardNullifier;
    bytes32 extDataHash;
    uint256 symbolIndex;
    bytes32 depositRoot;
    bytes32 withdrawalRoot;
    RewardExtData extData;
    AccountUpdate account;
  }

  struct WithdrawExtData {
    uint256 fee;
    address recipient;
    address relayer;
    bytes encryptedAccount;
  }

  struct WithdrawArgs {
    address instance;
    uint256 apAmount;
    uint256 aaveInterestAmount;
    bytes32 extDataHash;
    WithdrawExtData extData;
    AccountUpdate account;
  }

  struct Rate {
    address instance;
    uint256 currencyIndex;
    uint256 value;
  }

  modifier onlySacredProxy {
    require(msg.sender == sacredProxy, "Not authorized");
    _;
  }

  modifier onlyGovernance() {
    require(msg.sender == governance, "Only governance can perform this action");
    _;
  }

  constructor (
    ReferenceContracts memory contracts,
    address[3] memory _verifiers,
    address _hasher,
    bytes32 _accountRoot,
    Rate[] memory _rates,
    uint256 _minimumInterests,
    uint256 _aaveInterestFee
  ) {
    rewardSwap = IRewardSwap(contracts.rewardSwap);
    governance = contracts.governance;
    sacredProxy = contracts.sacredProxy;
    sacredTrees = ISacredTrees(contracts.sacredTrees);
    minimumInterests = _minimumInterests;
    aaveInterestFee = _aaveInterestFee;
    hasher = Hasher(_hasher);
    aaveInterestsProxy = contracts.aaveInterestsProxy;
    // insert empty tree root without incrementing accountCount counter
    accountRoots[0] = _accountRoot;

    _setRates(_rates);
    // prettier-ignore

    _setVerifiers([
      IVerifier(_verifiers[0]),
      IVerifier(_verifiers[1]),
      IVerifier(_verifiers[2])
    ]);
    for(uint256 i = 0; i < currencyCnt; ++i) {
      shareTrack[i].lastUpdated = block.number;
    }
  }

  function updateShares(address instance, bool byDeposit, bytes32 nullifier) external onlySacredProxy {
    uint256 currencyIndex = currencies[instance];
    _updateShares(currencyIndex);
    if(byDeposit) {
      activeDeposits[currencyIndex][instance]++;
    } else {
      activeDeposits[currencyIndex][instance]--;
      bytes32 key = hasher.poseidon([nullifier]);
      uint256 totalInterests = 0;
      if(currencyIndex == 0) {
        for(uint256 i = 0; i < instanceCount[currencyIndex]; ++i) {
          totalInterests += ETHSacred(instances[i]).totalAaveInterests();
        }
      } else {
        for(uint256 i = 0; i < instanceCount[currencyIndex]; ++i) {
          totalInterests += ERC20Sacred(instances[i]).totalAaveInterests();
        }
      }
      totalShareSnapshots[currencyIndex][key] = [shareTrack[currencyIndex].totalShares, totalInterests];
    }
  }

  function getAaveInterestsAmount(uint256 currencyIndex, bytes32 rewardNullifier, uint256 apAmount) public returns (uint256) {
    uint256 interests = 0;
    if(totalShareSnapshots[currencyIndex][rewardNullifier][0] > 0) {
      interests = totalShareSnapshots[currencyIndex][rewardNullifier][1].mul(apAmount).div(totalShareSnapshots[currencyIndex][rewardNullifier][0]);
    }
    emit AaveInterestsAmount(interests);
    return interests;
  }

  function reward(
    uint[2] memory a, 
    uint[2][2] memory b, 
    uint[2] memory c,  
    RewardArgs memory _args) public {
    uint[2][2] memory emptyB;
    uint[2] memory emptyAC;
    reward(a, b, c, _args, emptyAC, emptyB, emptyAC, TreeUpdateArgs(0, 0, 0, 0));
  }

  function batchReward(bytes[] calldata _rewardArgs) external {
    for (uint256 i = 0; i < _rewardArgs.length; ++i) {
      (uint[2] memory a, 
        uint[2][2] memory b, 
        uint[2] memory c, 
        RewardArgs memory args) = abi.decode(_rewardArgs[i], (uint[2], uint[2][2], uint[2], RewardArgs));
      reward(a, b, c, args);
    }
  }

  function reward (
    uint[2] memory a, 
    uint[2][2] memory b, 
    uint[2] memory c,  
    RewardArgs memory _args,
    uint[2] memory ta, 
    uint[2][2] memory tb, 
    uint[2] memory tc,
    TreeUpdateArgs memory _treeUpdateArgs
  ) public {
    validateAccountUpdate(_args.account, ta, tb, tc, _treeUpdateArgs);
    sacredTrees.validateRoots(_args.depositRoot, _args.withdrawalRoot);
    require(_args.extDataHash == keccak248(abi.encode(_args.extData)), "Incorrect external data hash");
    require(_args.fee < 2**248, "Fee value out of range");
    require(_args.rate == rates[_args.instance] && _args.rate > 0, "Invalid reward rate");
    require(!rewardNullifiers[_args.rewardNullifier], "Reward has been already spent");
    require(_args.aaveInterestAmount == getAaveInterestsAmount(_args.symbolIndex, _args.rewardNullifier, _args.apAmount), "Incorrect value for aave interest amount");
    require(
      rewardVerifier.verifyProof(
        a,
        b,
        c,
        [
          uint256(_args.rate),
          uint256(_args.fee),
          uint256(uint160(_args.instance)),
          uint256(_args.apAmount),
          uint256(_args.aaveInterestAmount),
          uint256(_args.rewardNullifier),
          uint256(_args.extDataHash),
          uint256(_args.symbolIndex),
          uint256(_args.account.inputRoot),
          uint256(_args.account.inputNullifierHash),
          uint256(_args.account.outputRoot),
          uint256(_args.account.outputPathIndices),
          uint256(_args.account.outputCommitment),
          uint256(_args.depositRoot),
          uint256(_args.withdrawalRoot)
        ]
      ),
      "Invalid reward proof"
    );

    accountNullifiers[_args.account.inputNullifierHash] = true;
    rewardNullifiers[_args.rewardNullifier] = true;
    insertAccountRoot(_args.account.inputRoot == getLastAccountRoot() ? _args.account.outputRoot : _treeUpdateArgs.newRoot);
    if (_args.fee > 0) {
      rewardSwap.swap(_args.extData.relayer, _args.fee);
    }

    delete totalShareSnapshots[_args.symbolIndex][_args.rewardNullifier];

    emit NewAccount(
      _args.account.outputCommitment,
      _args.account.inputNullifierHash,
      _args.extData.encryptedAccount,
      accountCount - 1
    );
  }

  function withdraw(
    uint[2] memory a, 
    uint[2][2] memory b, 
    uint[2] memory c, 
    WithdrawArgs memory _args) public {
    uint[2][2] memory emptyB;
    uint[2] memory emptyAC;
    withdraw(a, b, c, _args, emptyAC, emptyB, emptyAC, TreeUpdateArgs(0, 0, 0, 0));
  }

  function withdraw(
    uint[2] memory a, 
    uint[2][2] memory b, 
    uint[2] memory c,
    WithdrawArgs memory _args,
    uint[2] memory ta, 
    uint[2][2] memory tb, 
    uint[2] memory tc,
    TreeUpdateArgs memory _treeUpdateArgs
  ) public nonReentrant {
    validateAccountUpdate(_args.account, ta, tb, tc, _treeUpdateArgs);
    require(_args.extDataHash == keccak248(abi.encode(_args.extData)), "Incorrect external data hash");
    require(_args.apAmount < 2**248, "Amount value out of range");
    require(_args.aaveInterestAmount < 2**248, "AaveInterestAmount value out of range");
    require(
      withdrawVerifier.verifyProof(
        a,
        b,
        c,
        [
          uint256(_args.apAmount),
          uint256(_args.aaveInterestAmount),
          uint256(_args.extDataHash),
          uint256(_args.symbolIndex),
          uint256(_args.account.inputRoot),
          uint256(_args.account.inputNullifierHash),
          uint256(_args.account.outputRoot),
          uint256(_args.account.outputPathIndices),
          uint256(_args.account.outputCommitment)
        ]
      ),
      "Invalid withdrawal proof"
    );

    insertAccountRoot(_args.account.inputRoot == getLastAccountRoot() ? _args.account.outputRoot : _treeUpdateArgs.newRoot);
    accountNullifiers[_args.account.inputNullifierHash] = true;
    // allow submitting noop withdrawals (amount == 0)
    uint256 amount = _args.apAmount.sub(_args.extData.fee, "Amount should be greater than fee");
    if (amount > 0) {
      rewardSwap.swap(_args.extData.recipient, amount);
    }
    // Note. The relayer swap rate always will be worse than estimated
    if (_args.extData.fee > 0) {
      rewardSwap.swap(_args.extData.relayer, _args.extData.fee);
    }
    
    uint256 fee  = _args.aaveInterestAmount * aaveInterestFee / 10000;

    if(_args.symbolIndex == 0) { // eth
      if(_args.aaveInterestAmount - fee > minimumInterests) {
        AaveInterestsProxy(aaveInterestsProxy).withdraw(address(0), _args.aaveInterestAmount - fee, _args.extData.recipient);
        if(fee > minimumInterests) {
          AaveInterestsProxy(aaveInterestsProxy).withdraw(address(0), fee, governance);
        }
      }
    } else {
      AaveInterestsProxy(aaveInterestsProxy).withdraw(address(0), _args.aaveInterestAmount - fee, _args.extData.recipient);
      if(fee > minimumInterests) {
        AaveInterestsProxy(aaveInterestsProxy).withdraw(address(0), fee, governance);
      }
    }

    emit NewAccount(
      _args.account.outputCommitment,
      _args.account.inputNullifierHash,
      _args.extData.encryptedAccount,
      accountCount - 1
    );
  }

  function setMinimumInterests(uint256 _minimumInterests) external onlyGovernance {
    require(_minimumInterests > 0, "miniumInterests has to be larger than zero");
    minimumInterests = _minimumInterests;
  }

  function setAaveInterestFee(uint256 _aaveInterestFee) external onlyGovernance {
    require(_aaveInterestFee <= 1000, "Aave Interest fee has to be smaller than 10%");
    aaveInterestFee = _aaveInterestFee;
  }

  function setRates(Rate[] memory _rates) external onlyGovernance {
    _setRates(_rates);
  }

  function setVerifiers(IVerifier[3] calldata _verifiers) external onlyGovernance {
    _setVerifiers(_verifiers);
  }

  function setSacredTreesContract(ISacredTrees _sacredTrees) external onlyGovernance {
    require(address(_sacredTrees) != address(0), "_sacredTrees cannot be zero address");
    sacredTrees = _sacredTrees;
  }

  function setPoolWeight(uint256 _newWeight) external onlyGovernance {
    rewardSwap.setPoolWeight(_newWeight);
  }

  function setAaveInterestsProxyContract(address _interestsProxy) external onlyGovernance {
    aaveInterestsProxy = _interestsProxy;
  }


  // ------VIEW-------

  /**
    @dev Whether the root is present in the root history
    */
  function isKnownAccountRoot(bytes32 _root, uint256 _index) public view returns (bool) {
    return _root != 0 && accountRoots[_index % ACCOUNT_ROOT_HISTORY_SIZE] == _root;
  }

  /**
    @dev Returns the last root
    */
  function getLastAccountRoot() public view returns (bytes32) {
    return accountRoots[accountCount % ACCOUNT_ROOT_HISTORY_SIZE];
  }

  // -----INTERNAL-------

  function keccak248(bytes memory _data) internal pure returns (bytes32) {
    return keccak256(_data) & 0x00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
  }

  function validateTreeUpdate(
    uint[2] memory a, 
    uint[2][2] memory b, 
    uint[2] memory c,
    TreeUpdateArgs memory _args,
    bytes32 _commitment
  ) internal view {
    require(a[0] != 0 && a[1] != 0, "Outdated account merkle root");
    require(_args.oldRoot == getLastAccountRoot(), "Outdated tree update merkle root");
    require(_args.leaf == _commitment, "Incorrect commitment inserted");
    require(_args.pathIndices == accountCount, "Incorrect account insert index");
    require(
      treeUpdateVerifier.verifyProof(
        a,
        b,
        c,
        [uint256(_args.oldRoot), uint256(_args.newRoot), uint256(_args.leaf), uint256(_args.pathIndices)]
      ),
      "Invalid tree update proof"
    );
  }

  function validateAccountUpdate(
    AccountUpdate memory _account,
    uint[2] memory a, 
    uint[2][2] memory b, 
    uint[2] memory c,
    TreeUpdateArgs memory _treeUpdateArgs
  ) internal view {
    require(!accountNullifiers[_account.inputNullifierHash], "Outdated account state");
    if (_account.inputRoot != getLastAccountRoot()) {
      // _account.outputPathIndices (= last tree leaf index) is always equal to root index in the history mapping
      // because we always generate a new root for each new leaf
      require(isKnownAccountRoot(_account.inputRoot, _account.outputPathIndices), "Invalid account root");
      validateTreeUpdate(a, b, c, _treeUpdateArgs, _account.outputCommitment);
    } else {
      require(_account.outputPathIndices == accountCount, "Incorrect account insert index");
    }
  }

  function insertAccountRoot(bytes32 _root) internal {
    accountRoots[++accountCount % ACCOUNT_ROOT_HISTORY_SIZE] = _root;
  }

  function _setRates(Rate[] memory _rates) internal {
    for (uint256 i = 0; i < _rates.length; ++i) {
      require(_rates[i].value < 2**128, "Incorrect rate");
      address instance = _rates[i].instance;
      rates[instance] = _rates[i].value;
      currencies[indstance] = _rates[i].currencyIndex;
      instances[_rates[i].currencyIndex].push(instance);
      emit RateChanged(instance, _rates[i].value);
    }
  }

  function _setVerifiers(IVerifier[3] memory _verifiers) internal {
    require(address(_verifiers[0]) != address(0), "rewardVerifier cannot be zero address");
    require(address(_verifiers[1]) != address(0), "withdrawVerifier cannot be zero address");
    require(address(_verifiers[2]) != address(0), "treeUpdateVerifier cannot be zero address");
    rewardVerifier = _verifiers[0];
    withdrawVerifier = _verifiers[1];
    treeUpdateVerifier = _verifiers[2];
    emit VerifiersUpdated(address(_verifiers[0]), address(_verifiers[1]), address(_verifiers[2]));
  }

  function _updateShares(uint256 currencyIndex) private {
    uint256 delta = block.number - shareTrack[currencyIndex].lastUpdated;
    for(uint256 i = 0; i < instanceCount[currencyIndex]; ++i) {
      address instance = instances[currencyIndex][i];
      shareTrack[currencyIndex].totalShares += delta * activeDeposits[currencyIndex][instance] * rates[instance];
    }
    shareTrack[currencyIndex].lastUpdated = block.number;
  }
}
