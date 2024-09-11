// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract Stakepool is AccessControl {
    using SafeERC20 for IERC20;

    IERC20 public token;
    uint256 public constant DURATION = 365 days;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;
    mapping(address => BorrowInfo) public borrowers;
    uint256 public totalBorrowed;
    uint256 public borrowLimit;
    uint32 public setPercentage;

    struct BorrowInfo {
        bool allowedToBorrow;
        uint256 borrowedAmount;
    }

    event RewardAdded(uint256 reward);
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event BorrowingStatusChanged(address indexed user, bool allowed);


    constructor(address _token, uint32 _defaultPercentage)  {
        token = IERC20(_token);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        setPercentage = _defaultPercentage;
    }

    function setBorrowingStatus(address user, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        borrowers[user].allowedToBorrow = allowed;
        emit BorrowingStatusChanged(user, allowed);
    }

    function _setPercentage (uint32 divideBy) external onlyRole (DEFAULT_ADMIN_ROLE){ //Tell what %of contract balance can be borrowed at a time
        setPercentage = divideBy ;
        _setBorrowLimit();
    }

    function _setBorrowLimit() internal {
    uint256 contractBalance = token.balanceOf(address(this));
    borrowLimit = contractBalance / setPercentage; //Ex: Divide by 100 for 1% of the contract balance
    }



    function borrow(uint256 amount) external {

        require(amount > 0, "Cannot borrow 0");
        BorrowInfo storage borrower = borrowers[msg.sender];
        require(borrower.allowedToBorrow, "Not allowed to borrow");
        require(token.balanceOf(address(this)) >= amount, "Insufficient funds in pool");
        require(totalBorrowed + amount <= borrowLimit, "Exceeds borrowing limit");

        borrower.borrowedAmount += amount;
        totalBorrowed += amount;  // Update total borrowed amount

        token.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
        _setBorrowLimit();
    }


    function repay(uint256 amount) external {
        require(amount > 0, "Cannot repay 0");
        
        BorrowInfo storage borrower = borrowers[msg.sender];
        require(borrower.borrowedAmount > 0, "No active loan");
        require(amount <= borrower.borrowedAmount, "Repayment amount exceeds borrowed amount");

        borrower.borrowedAmount -= amount;
        totalBorrowed -= amount;

        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Repaid(msg.sender, amount);
         _setBorrowLimit();
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return _min(block.timestamp, periodFinish);
    }

    function rewardPerToken() public view returns (uint256) {
        if (_totalSupply == 0) {
            return rewardPerTokenStored;
        }
        return rewardPerTokenStored + ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18 / _totalSupply);
    }

    function earned(address account) public view returns (uint256) {
        return _balances[account] * (rewardPerToken() - userRewardPerTokenPaid[account]) / 1e18 + rewards[account];
    }

    function stake(uint256 amount) external updateReward(msg.sender) {
        require(amount > 0, "Cannot stake 0");
        _totalSupply += amount;
        _balances[msg.sender] += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        _setBorrowLimit(); 
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) public updateReward(msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        _totalSupply -= amount;
        _balances[msg.sender] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function exit() external {
        withdraw(_balances[msg.sender]);
        getReward();
    }

    function getReward() public updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            token.safeTransfer(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    function notifyRewardAmount(uint256 reward) external onlyRole(DEFAULT_ADMIN_ROLE) updateReward(address(0)) {        
    if (block.timestamp >= periodFinish) {
        rewardRate = reward / DURATION;
    } else {
        uint256 remaining = periodFinish - block.timestamp;
        uint256 leftover = remaining * rewardRate;
        rewardRate = (reward + leftover) / DURATION;
    }
    lastUpdateTime = block.timestamp;
    periodFinish = block.timestamp + DURATION;
    emit RewardAdded(reward);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}