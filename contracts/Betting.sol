// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IStakingContract {
    function borrow(uint256 amount) external;
    function totalSupply() external view returns (uint256);
    function borrowers(address) external view returns (bool allowedToBorrow, uint256 borrowedAmount);
    function repay(uint256 amount) external;
}

contract Betting is ReentrancyGuard {
    using SafeERC20 for IERC20;

    //Add a Calculate apyout function. Either on backedn

    address public immutable owner;
    IERC20 public immutable bettingToken;
    IStakingContract public stakingContract;
    uint256 public totalBetsTeamA;
    uint256 public totalBetsTeamB;
    uint256 public totalBets;
    uint256 public netPayoutA;
    uint256 public netPayoutB;
    uint256 public impliedProbability; // 103.5% represented as 1035
    uint256 public maxBetAmount;
    uint256 public borrowedAmount;
    uint16 public maxBetAmountPercentage = 1; // 0.01% represented as 1
    uint16 public earlyWithdrawalLimit;

    bool public paused;
    bool public matchEnded;
    enum MatchResult { Undecided, TeamAWin, TeamBWin, Tie }
    MatchResult public matchResult;

    struct Bet {
        uint256 amount;
        uint256 oddsAtBetTime;
    }

    mapping(address => Bet) public betsOnTeamA;
    mapping(address => Bet) public betsOnTeamB;

    uint256 public oddsTeamA;
    uint256 public oddsTeamB;

    event MatchStarted();
    event BetPlaced(address indexed bettor, uint256 amount, bool isTeamA);
    event BetWithdrawn(address indexed bettor, uint256 amount, bool isTeamA);
    event MatchEnded(MatchResult result);
    event Payout(address indexed bettor, uint256 amount);

    constructor(IERC20 _bettingToken, uint256 _maxBetAmount, address _stakingContract) {
        owner = msg.sender;
        bettingToken = _bettingToken;
        maxBetAmount = _maxBetAmount;
        updateOdds();
        impliedProbability = 1035;
        matchEnded = true;
        earlyWithdrawalLimit = 80;
        stakingContract = IStakingContract(_stakingContract);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    modifier beforeMatchEnd() {
        require(!matchEnded, "Match ended");
        _;
    }

    modifier afterMatchEnd() {
        require(matchEnded, "Match ongoing");
        _;
    }


    function updateMaxBetAmount() internal {
        maxBetAmount = (stakingContract.totalSupply() * maxBetAmountPercentage) / 10000; //0.01% = 1
    }

    function setMaxBetAmountPercentage(uint16 _percentage) external onlyOwner {
        require(_percentage > 0 && _percentage <= 1000, "Invalid percentage");
        maxBetAmountPercentage = _percentage;
        updateMaxBetAmount();
    }

    function setEarlyPercentage(uint16 _percentage) external onlyOwner {
        require(_percentage > 0 && _percentage <= 100, "Invalid percentage");
        earlyWithdrawalLimit = _percentage;
    }

    function startMatch() external onlyOwner {
        require(matchEnded, "Match ongoing currently");
        (, uint256 currentBorrowed) = stakingContract.borrowers(address(this));
        if (currentBorrowed > 0) {
            uint256 contractBalance = bettingToken.balanceOf(address(this));
            if (contractBalance >= currentBorrowed) {
                bettingToken.approve(address(stakingContract), currentBorrowed);
                require(_repay(currentBorrowed), "Failed to repay previous borrowings");
            } else {
                bettingToken.approve(address(stakingContract), contractBalance);
                require(_repay(contractBalance), "Failed to repay previous borrowings");
                // If we couldn't repay everything, we'll handle the rest later
            }
        }
        matchEnded = false;
        updateMaxBetAmount();
        uint256 initialBet = maxBetAmount * 8;
        _borrow(initialBet);
         unchecked {
            totalBetsTeamA = initialBet / 2;
            totalBetsTeamB = initialBet / 2;
            totalBets = initialBet;
        }
        updateOdds();
        emit MatchStarted();
    }

    function placeBetOnTeamA(uint256 amount) external whenNotPaused beforeMatchEnd nonReentrant {
        require(amount > 0 && amount <= maxBetAmount, "Invalid bet amount.");
        bettingToken.safeTransferFrom(msg.sender, address(this), amount);
        betsOnTeamA[msg.sender].oddsAtBetTime = oddsTeamA;
        unchecked {
            betsOnTeamA[msg.sender].amount += amount;
            totalBetsTeamA += amount;
            totalBets += amount;
            netPayoutA += (amount * oddsTeamA) / 1e18;
        }
        updateOdds();
        emit BetPlaced(msg.sender, amount, true);
    }

    function placeBetOnTeamB(uint256 amount) external whenNotPaused beforeMatchEnd nonReentrant {
        require(amount > 0 && amount <= maxBetAmount, "Invalid bet amount.");
        bettingToken.safeTransferFrom(msg.sender, address(this), amount);
        betsOnTeamB[msg.sender].oddsAtBetTime = oddsTeamB;
        unchecked {
            betsOnTeamB[msg.sender].amount += amount;
            totalBetsTeamB += amount;
            totalBets += amount;
            netPayoutB += (amount * oddsTeamB) / 1e18;
        }
        updateOdds();
        emit BetPlaced(msg.sender, amount, false);
    }


    function calculateWithdrawalAmount(uint256 betAmount, uint256 originalOdds, uint256 currentOdds) internal view beforeMatchEnd returns (uint256) {
    unchecked{
    uint256 originalPayout = (betAmount * originalOdds) / 1e18;

    if (currentOdds <= originalOdds) {
        // Odds have improved
        uint256 oddsImprovement = ((originalOdds - currentOdds) * 1e18) / originalOdds;        //Always less than 1
            return (oddsImprovement * originalPayout * earlyWithdrawalLimit) / (1e18 * 100);
    } else {
        // Odds have worsened
        uint256 oddsWorsening = ((currentOdds - originalOdds) * 100) / originalOdds;
            uint256 minPercentage = oddsWorsening >= earlyWithdrawalLimit ? 0 : earlyWithdrawalLimit - oddsWorsening;
            return (betAmount * minPercentage) / 100;
    }}
    }


    function withdrawBetOnTeamA(uint256 amount) external whenNotPaused beforeMatchEnd nonReentrant {
        require(betsOnTeamA[msg.sender].amount >= amount, "Insufficient bet amount.");
        uint256 withdrawAmount = calculateWithdrawalAmount(amount, betsOnTeamA[msg.sender].oddsAtBetTime, oddsTeamA);
        betsOnTeamA[msg.sender].amount -= amount;
        totalBetsTeamA -= amount;
        totalBets -= amount;
        updateOdds();
        netPayoutA -= (amount * betsOnTeamA[msg.sender].oddsAtBetTime) / 1e18 ;
        bettingToken.safeTransfer(msg.sender, withdrawAmount);
        emit BetWithdrawn(msg.sender, withdrawAmount, true);
    }

    function withdrawBetOnTeamB(uint256 amount) external whenNotPaused beforeMatchEnd nonReentrant {
        require(betsOnTeamB[msg.sender].amount >= amount, "Insufficient bet amount.");
        uint256 withdrawAmount = calculateWithdrawalAmount(amount, betsOnTeamB[msg.sender].oddsAtBetTime, oddsTeamB);
        betsOnTeamB[msg.sender].amount -= amount;
        totalBetsTeamB -= amount;
        totalBets -= amount;
        updateOdds();
        netPayoutB -= (amount * betsOnTeamB[msg.sender].oddsAtBetTime) / 1e18;  // Update net payout
        bettingToken.safeTransfer(msg.sender, withdrawAmount);
        emit BetWithdrawn(msg.sender, withdrawAmount, false);
    }

    function updateOdds() internal {
        if (totalBets == 0) {
            oddsTeamA = 0;
            oddsTeamB = 0;
        } else {
              unchecked {
                uint256 pA = (totalBetsTeamA * impliedProbability) / totalBets;
                uint256 pB = (totalBetsTeamB * impliedProbability) / totalBets;
                oddsTeamA = pA > 0 ? (1e18 * 1000) / pA : 0;
                oddsTeamB = pB > 0 ? (1e18 * 1000) / pB : 0;
            }
        }
    }

    function pauseWithdrawals() external onlyOwner {
        paused = true;
    }

    function unpauseWithdrawals() external onlyOwner {
        paused = false;
    }

    function endMatch(MatchResult result) external onlyOwner {
        require(result != MatchResult.Undecided, "Invalid match result");
        matchEnded = true;
        matchResult = result;
        uint256 finalPayout = result == MatchResult.TeamAWin ? netPayoutA : (result == MatchResult.TeamBWin ? netPayoutB : 0);
        uint256 contractBalance = bettingToken.balanceOf(address(this));
        if (contractBalance < finalPayout) {
            require(_borrow(finalPayout - contractBalance), "Failed to borrow for final payout");
        }
        emit MatchEnded(result);
    }

    function withdrawAfterMatch() external afterMatchEnd nonReentrant {
        uint256 payout;
        if (matchResult == MatchResult.TeamAWin && betsOnTeamA[msg.sender].amount > 0) {
            payout = (betsOnTeamA[msg.sender].amount * betsOnTeamA[msg.sender].oddsAtBetTime ) / (1e18);
            betsOnTeamA[msg.sender].amount = 0;
        } else if (matchResult == MatchResult.TeamBWin && betsOnTeamB[msg.sender].amount > 0) {
            payout = (betsOnTeamB[msg.sender].amount * betsOnTeamB[msg.sender].oddsAtBetTime ) / (1e18);
            betsOnTeamB[msg.sender].amount = 0;
        } else if (matchResult == MatchResult.Tie) {
            payout = 0;
            betsOnTeamA[msg.sender].amount = 0;
            betsOnTeamB[msg.sender].amount = 0;
        } else {
            revert("No winning bet to withdraw.");
        }
        require(payout > 0, "No payout available");   
        bettingToken.safeTransfer(msg.sender, payout);
        emit Payout(msg.sender, payout);
    }

    function setMaxBetAmount(uint256 _maxBetAmount) external onlyOwner {
        maxBetAmount = _maxBetAmount;
    }

    function _borrow(uint256 amountNeeded) internal returns(bool) {
        stakingContract.borrow(amountNeeded);
        return true;
        }

    function _repay(uint256 amountRepaid) internal returns(bool) {
        stakingContract.repay(amountRepaid);
        return true;
        }

    function setImpliedProbability(uint256 _impliedProbability) external onlyOwner {
        require(_impliedProbability > 1000 && _impliedProbability <= 1100, "Invalid implied probability");
        impliedProbability = _impliedProbability;
    }

    function getBorrowedAmount() external view returns (uint256) {
        (, uint256 borrowed) = stakingContract.borrowers(address(this));
        return borrowed;
    }

}