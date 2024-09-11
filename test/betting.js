const { StakeInstruction } = require("@solana/web3.js");
const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");

describe("Betting", function () {
  let Betting;
  let betting;
  let owner;
  let addr1;
  let addr2;
  let mockToken;
  let mockStakingContract;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockToken = await ethers.getContractFactory("REKT");
    mockToken = await MockToken.deploy("Rekt Token", "REKT");

    // Deploy mock staking contract
    const MockStakingContract = await ethers.getContractFactory("Stakepool");
    mockStakingContract = await MockStakingContract.deploy(mockToken.address, 100);

    // Deploy Betting contract
    Betting = await ethers.getContractFactory("Betting");
    betting = await Betting.deploy(mockToken.address, ethers.utils.parseEther("100"), mockStakingContract.address);
    await mockStakingContract.setBorrowingStatus(betting.address, true);

    // Mint some tokens to users
    await mockToken.mint(addr1.address, ethers.utils.parseEther("1000"));
    await mockToken.mint(addr2.address, ethers.utils.parseEther("1000"));
    await mockToken.mint(owner.address, ethers.utils.parseEther("1000000"))

    // Approve betting contract to spend tokens
    await mockToken.connect(addr1).approve(betting.address, ethers.utils.parseEther("1000"));
    await mockToken.connect(addr2).approve(betting.address, ethers.utils.parseEther("1000"));
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await betting.owner()).to.equal(owner.address);
    });

    it("Should set the correct betting token", async function () {
      expect(await betting.bettingToken()).to.equal(mockToken.address);
    });
  });

  describe("Betting", function () {
    beforeEach(async function () {
      await mockToken.connect(owner).approve(mockStakingContract.address, ethers.constants.MaxUint256)
      await mockStakingContract.stake(ethers.utils.parseEther("100000"))
      await betting.connect(owner).startMatch();
    }); 
    

    it("Should allow placing bets on Team A", async function () {
      console.log(ethers.utils.formatEther((await betting.maxBetAmount())))
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      expect((await betting.betsOnTeamA(addr1.address)).amount).to.equal(ethers.utils.parseEther("10"));
    });

    it("Should allow placing bets on Team B", async function () {
      await betting.connect(addr2).placeBetOnTeamB(ethers.utils.parseEther("10"));
      expect((await betting.betsOnTeamB(addr2.address)).amount).to.equal(ethers.utils.parseEther("10"));
    });

    it("Should update odds after placing bets: less than 1.9", async function () {
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      const oddsAfterBet = await betting.oddsTeamA();
      expect(oddsAfterBet).to.be.lt(ethers.utils.parseEther("1.9"));
    });

    it("Should not allow bets larger than maxBetAmount", async function () {
      await expect(
        betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("101"))
      ).to.be.revertedWith("Invalid bet amount.");
    });

    it("Should handle match end with zero bets gracefully", async function () {
      
      await betting.connect(owner).endMatch(1); // TeamAWin with zero bets
      console.log(mockStakingContract.address)
      await betting.startMatch()
      const borrowedAmount = await betting.getBorrowedAmount();
      expect(borrowedAmount).to.be.equal(ethers.utils.parseEther("80"));
  });
    
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      await mockToken.connect(owner).approve(mockStakingContract.address, ethers.constants.MaxUint256)
      await mockStakingContract.stake(ethers.utils.parseEther("100000"))
      await betting.connect(owner).startMatch();
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
    });

    it("Should allow early withdrawal", async function () {
      await betting.connect(addr1).withdrawBetOnTeamA(ethers.utils.parseEther("5"));
      expect((await betting.betsOnTeamA(addr1.address)).amount).to.equal(ethers.utils.parseEther("5"));
    });

    it("Should not allow withdrawal of more than bet amount", async function () {
      await expect(
        betting.connect(addr1).withdrawBetOnTeamA(ethers.utils.parseEther("15"))
      ).to.be.revertedWith("Insufficient bet amount.");
    });
    it("Should allow users to withdraw their bets without payout in case of a tie", async function () {
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      await betting.connect(addr2).placeBetOnTeamB(ethers.utils.parseEther("10"));
      
      await betting.connect(owner).endMatch(3); // Tie
      
      await expect(betting.connect(addr1).withdrawAfterMatch()).to.be.revertedWith("No payout available");
      await expect(betting.connect(addr2).withdrawAfterMatch()).to.be.revertedWith("No payout available");
    });

  });

  describe("Early Withdrawal Calculation", function () {
    it("Should calculate correct early withdrawal amount when odds worsen", async function () {
      await mockToken.connect(owner).approve(mockStakingContract.address, ethers.constants.MaxUint256)
      await mockStakingContract.stake(ethers.utils.parseEther("200000"))
      await betting.connect(owner).startMatch();
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      
      // Simulate odds improvement
      await betting.connect(addr2).placeBetOnTeamB(ethers.utils.parseEther("20"));
      
      const tx = await betting.connect(addr1).withdrawBetOnTeamA(ethers.utils.parseEther("5"));
      const receipt = await tx.wait()
      const event = receipt.events.find(e => e.event === "BetWithdrawn");
      const [bettor, withdrawnAmount, isTeamA] = event.args;


      // Add assertion to check if withdrawal amount is correct
      expect(BigNumber.from(withdrawnAmount)).to.be.closeTo(
        ethers.utils.parseEther("3.72"),
        ethers.utils.parseEther("0.1")
      );
    });

    it("Should calculate correct early withdrawal amount when odds improve", async function () {
      await mockToken.connect(owner).approve(mockStakingContract.address, ethers.constants.MaxUint256)
      await mockStakingContract.stake(ethers.utils.parseEther("200000"))
      await betting.connect(owner).startMatch();
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      
      // Simulate odds worsening
      await betting.connect(addr2).placeBetOnTeamA(ethers.utils.parseEther("20"));
      // Add assertion to check if withdrawal amount is correct
      const tx = await betting.connect(addr1).withdrawBetOnTeamA(ethers.utils.parseEther("5"));
      const receipt = await tx.wait()
      const event = receipt.events.find(e => e.event === "BetWithdrawn");
      const [bettor, withdrawnAmount, isTeamA] = event.args;

      // Add assertion to check if withdrawal amount is correct
      expect(BigNumber.from(withdrawnAmount)).to.be.closeTo(
        ethers.utils.parseEther("1.056"),
        ethers.utils.parseEther("0.01")
      );

    });
  });

  describe("Owner Functions", function () {
    beforeEach(async function () {
      await mockToken.connect(owner).approve(mockStakingContract.address, ethers.constants.MaxUint256)
      await mockStakingContract.stake(ethers.utils.parseEther("100000"))
      await betting.connect(owner).startMatch();
    });

    it("Should allow owner to set max bet amount", async function () {
      const newMaxBet = ethers.utils.parseEther("200");
      await betting.connect(owner).setMaxBetAmount(newMaxBet);
      expect(await betting.maxBetAmount()).to.equal(newMaxBet);
    });

    it("Should allow owner to set implied probability", async function () {
      const newImpliedProbability = 1050; // 105%
      await betting.connect(owner).setImpliedProbability(newImpliedProbability);
      expect(await betting.impliedProbability()).to.equal(newImpliedProbability);
    });

    it("Should not allow non-owner to set max bet amount", async function () {
      await expect(
        betting.connect(addr1).setMaxBetAmount(ethers.utils.parseEther("200"))
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("Pausing and Unpausing", function () {
    beforeEach(async function () {
      await mockToken.connect(owner).approve(mockStakingContract.address, ethers.constants.MaxUint256)
      await mockStakingContract.stake(ethers.utils.parseEther("100000"))
      await betting.connect(owner).startMatch();
    });
    it("Should not allow withdrawals when paused", async function () {
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      await betting.connect(owner).pauseWithdrawals();
      
      await expect(
        betting.connect(addr1).withdrawBetOnTeamA(ethers.utils.parseEther("5"))
      ).to.be.revertedWith("Paused");
    });

    it("Should allow withdrawals after unpausing", async function () {
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      await betting.connect(owner).pauseWithdrawals();
      await betting.connect(owner).unpauseWithdrawals();
      
      await expect(
        betting.connect(addr1).withdrawBetOnTeamA(ethers.utils.parseEther("5"))
      ).to.not.be.reverted;
    });
    it("Should revert when placing or withdrawing bets during a paused match", async function () {
      await betting.connect(owner).pauseWithdrawals();
      await expect(betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"))).to.be.revertedWith("Paused");
      await expect(betting.connect(addr1).withdrawBetOnTeamA(ethers.utils.parseEther("5"))).to.be.revertedWith("Paused");
  });
  });


  describe("Borrowing and Repaying", function () {
    beforeEach(async function () {
      await mockToken.connect(owner).approve(mockStakingContract.address, ethers.constants.MaxUint256)
      await mockStakingContract.stake(ethers.utils.parseEther("100000"))
      await betting.connect(owner).startMatch();
    });

    it("Should borrow correctly when starting a match", async function () {
      const borrowedAmount = await betting.getBorrowedAmount();
      expect(borrowedAmount).to.be.gt(0);
    });

    it("Should repay borrowed amount when ending a match", async function () {
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      await betting.connect(owner).endMatch(1); // TeamAWin
      
      const borrowedAmount = await betting.getBorrowedAmount();
      expect(borrowedAmount).to.be.gt(0);
    });
  });

  describe("Match End", function () {
    beforeEach(async function () {
      await mockToken.connect(owner).approve(mockStakingContract.address, ethers.constants.MaxUint256)
      await mockStakingContract.stake(ethers.utils.parseEther("100000"))
      await betting.connect(owner).startMatch();
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      await betting.connect(addr2).placeBetOnTeamB(ethers.utils.parseEther("8"));
    });

    it("Should allow owner to end match", async function () {
      await betting.connect(owner).endMatch(1); // TeamAWin
      expect(await betting.matchEnded()).to.be.true;
    });

    it("Should allow winners to withdraw after match end", async function () {
      await betting.connect(owner).endMatch(1); // TeamAWin
      await betting.connect(addr1).withdrawAfterMatch();
      expect((await betting.betsOnTeamA(addr1.address)).amount).to.equal(0);
    });

    it("Should not allow losers to withdraw after match end", async function () {
      await betting.connect(owner).endMatch(1); // TeamAWin
      await expect(
        betting.connect(addr2).withdrawAfterMatch()
      ).to.be.revertedWith("No winning bet to withdraw.");
    });

    it("Should revert when trying to start a new match while one is ongoing", async function () {      
      await expect(
        betting.connect(owner).startMatch()
      ).to.be.revertedWith("Match ongoing currently");
    });
  });


  describe("Setting implied probability", function () {
    beforeEach(async function () {
      await mockToken.connect(owner).approve(mockStakingContract.address, ethers.constants.MaxUint256)
      await mockStakingContract.stake(ethers.utils.parseEther("100000"))
      await betting.connect(owner).startMatch();
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      await betting.connect(addr2).placeBetOnTeamB(ethers.utils.parseEther("8"));
    }); 
    it("Should allow setting impliedProbability within valid range", async function () {
      await betting.connect(owner).setImpliedProbability(1050);
      expect(await betting.impliedProbability()).to.equal(1050);
    });
    
    it("Should revert when setting impliedProbability below 1001", async function () {
      await expect(
        betting.connect(owner).setImpliedProbability(1000)
      ).to.be.revertedWith("Invalid implied probability");
    });
    
    it("Should revert when setting impliedProbability above 1100", async function () {
      await expect(
        betting.connect(owner).setImpliedProbability(1101)
      ).to.be.revertedWith("Invalid implied probability");
    });
  })
  describe("MaxBetAmountPercentage", function () {
    beforeEach(async function () {
      await mockToken.connect(owner).approve(mockStakingContract.address, ethers.constants.MaxUint256)
      await mockStakingContract.stake(ethers.utils.parseEther("100000"))
      await betting.connect(owner).startMatch();
    }); 

    it("Should correctly update maxBetAmount when maxBetAmountPercentage is changed", async function () {
      const newPercentage = 500; // 5%
      await betting.connect(owner).setMaxBetAmountPercentage(newPercentage);
      const totalSupplyValue = await mockStakingContract.totalSupply();
      const newPercentageBigNumber = BigNumber.from(newPercentage);
      const expectedMaxBet = (BigNumber.from(totalSupplyValue).mul(newPercentageBigNumber).div(10000));
      expect(await betting.maxBetAmount()).to.equal(expectedMaxBet);
    });
    
    it("Should revert when setting maxBetAmountPercentage to 0", async function () {
      await expect(
        betting.connect(owner).setMaxBetAmountPercentage(0)
      ).to.be.revertedWith("Invalid percentage");
    });
    
    it("Should revert when setting maxBetAmountPercentage above 1000", async function () {
      await expect(
        betting.connect(owner).setMaxBetAmountPercentage(1001)
      ).to.be.revertedWith("Invalid percentage");
    });
  });
  describe("Events", function () {
    beforeEach(async function () {
      await mockToken.connect(owner).approve(mockStakingContract.address, ethers.constants.MaxUint256)
      await mockStakingContract.stake(ethers.utils.parseEther("100000"))
    }); 

    it("Should emit MatchStarted event when a match is started", async function () {
      await expect(betting.connect(owner).startMatch())
        .to.emit(betting, 'MatchStarted');
    });
    
    it("Should emit BetPlaced event when a user places a bet on Team A", async function () {
      await betting.connect(owner).startMatch();
      await expect(betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10")))
        .to.emit(betting, 'BetPlaced')
        .withArgs(addr1.address, ethers.utils.parseEther("10"), true);
    });
    
    it("Should emit MatchEnded event with correct result", async function () {
      await expect(betting.connect(owner).endMatch(1))
        .to.emit(betting, 'MatchEnded')
        .withArgs(1);
    });
    
    it("Should emit Payout event when a user withdraws after match", async function () {
      await betting.connect(owner).startMatch();
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("5"));

      await betting.connect(owner).endMatch(1);

      await expect(betting.connect(addr1).withdrawAfterMatch())
        .to.emit(betting, 'Payout')
    });
  })

  describe("Additional Betting Tests", function () {
    beforeEach(async function () {
      await mockToken.connect(owner).approve(mockStakingContract.address, ethers.constants.MaxUint256)
      await mockStakingContract.stake(ethers.utils.parseEther("100000"))
      await betting.connect(owner).startMatch();
    }); 
  
    it("Should update maxBetAmount correctly when staking contract balance changes", async function () {
      const initialMaxBet = await betting.maxBetAmount();
      await mockStakingContract.stake(ethers.utils.parseEther("200000"));
      await betting.setMaxBetAmountPercentage(1);
      const newMaxBet = await betting.maxBetAmount();
      expect(newMaxBet).to.be.gt(initialMaxBet);
    });
  
    it("Should not allow placing bets after match has ended", async function () {
      await betting.connect(owner).endMatch(1);
      await expect(betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"))).to.be.revertedWith("Match ended");
    });
  
    it("Should correctly handle multiple bets from the same user", async function () {
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("5"));
      const bet = await betting.betsOnTeamA(addr1.address);
      expect(bet.amount).to.equal(ethers.utils.parseEther("15"));
    });
  
    it("Should correctly update totalBets and team-specific totals", async function () {
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      await betting.connect(addr2).placeBetOnTeamB(ethers.utils.parseEther("5"));
      expect(await betting.totalBets()).to.equal(ethers.utils.parseEther("95"));
      expect(await betting.totalBetsTeamA()).to.equal(ethers.utils.parseEther("50"));
      expect(await betting.totalBetsTeamB()).to.equal(ethers.utils.parseEther("45"));
    });
  
    it("Should correctly handle edge case of equal bets on both teams", async function () {
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      await betting.connect(addr2).placeBetOnTeamB(ethers.utils.parseEther("10"));
      const oddsA = await betting.oddsTeamA();
      const oddsB = await betting.oddsTeamB();
      expect(oddsA).to.equal(oddsB);
    });
  
    it("Should not allow setting early withdrawal percentage above 100", async function () {
      await expect(betting.connect(owner).setEarlyPercentage(101)).to.be.revertedWith("Invalid percentage");
    });
  
  
    it("Should not allow non-owner to pause or unpause withdrawals", async function () {
      await expect(betting.connect(addr1).pauseWithdrawals()).to.be.revertedWith("Only owner");
      await expect(betting.connect(addr1).unpauseWithdrawals()).to.be.revertedWith("Only owner");
    });
  
    it("Should correctly handle a tie result", async function () {
      await betting.connect(addr1).placeBetOnTeamA(ethers.utils.parseEther("10"));
      await betting.connect(addr2).placeBetOnTeamB(ethers.utils.parseEther("10"));
      await betting.connect(owner).endMatch(3); // Assuming 3 represents a tie
      await expect(betting.connect(addr1).withdrawAfterMatch()).to.be.revertedWith("No payout available");
      await expect(betting.connect(addr2).withdrawAfterMatch()).to.be.revertedWith("No payout available");
    });
  });

  });
