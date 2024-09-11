const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Stakepool", function () {
  let Stakepool;
  let stakepool;
  let Token;
  let token;
  let owner;
  let addr1;
  let addr2;
  let addr3;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();

    // Deploy mock ERC20 token
    Token = await ethers.getContractFactory("REKT");
    token = await Token.deploy("Rekt Token", "REKT");
    await token.deployed();

    // Deploy Stakepool
    Stakepool = await ethers.getContractFactory("Stakepool");
    stakepool = await Stakepool.deploy(token.address, 100);
    await stakepool.deployed();

    // Mint some tokens to users
    await token.mint(owner.address, ethers.utils.parseEther("1000000"));
    await token.mint(addr1.address, ethers.utils.parseEther("10000"));
    await token.mint(addr2.address, ethers.utils.parseEther("10000"));
    await token.mint(addr3.address, ethers.utils.parseEther("10000"));
    await token.transfer(stakepool.address, ethers.utils.parseEther("100000"));


    // Approve stakepool to spend tokens
    await token.connect(owner).approve(stakepool.address, ethers.constants.MaxUint256);
    await token.connect(addr1).approve(stakepool.address, ethers.constants.MaxUint256);
    await token.connect(addr2).approve(stakepool.address, ethers.constants.MaxUint256);
    await token.connect(addr3).approve(stakepool.address, ethers.constants.MaxUint256);

    await stakepool._setPercentage(100); // 1%
  });

  describe("Borrowing Tests", function(){

    it("Should set borrowing status correctly", async function () {
      await stakepool.setBorrowingStatus(addr1.address, true);
      const borrowerInfo = await stakepool.borrowers(addr1.address);
      expect(borrowerInfo.allowedToBorrow).to.equal(true);
      expect(borrowerInfo.borrowedAmount).to.equal(0);
    });
    
    it("Should set percentage correctly", async function () {
      await stakepool._setPercentage(200); // 0.5%
      expect(await stakepool.setPercentage()).to.equal(200);
    });
    
    it("Should borrow correctly", async function () {
      await stakepool.setBorrowingStatus(addr1.address, true);
      const borrowAmount = ethers.utils.parseEther("100");

      await expect(stakepool.connect(addr1).borrow(borrowAmount))
        .to.emit(stakepool, "Borrowed")
        .withArgs(addr1.address, borrowAmount);
    
      const borrowerInfo = await stakepool.borrowers(addr1.address);
      expect(borrowerInfo.borrowedAmount).to.equal(borrowAmount);
      
      expect(await token.balanceOf(addr1.address)).to.equal((borrowAmount).add(ethers.utils.parseEther("10000")));
    });
    
    it("Should repay correctly", async function () {
      await stakepool.setBorrowingStatus(addr1.address, true);
      const borrowAmount = ethers.utils.parseEther("100");
      await stakepool.connect(addr1).borrow(borrowAmount);
    
      await token.connect(addr1).approve(stakepool.address, borrowAmount);
      
      await expect(stakepool.connect(addr1).repay(borrowAmount))
        .to.emit(stakepool, "Repaid")
        .withArgs(addr1.address, borrowAmount);
    
      const borrowerInfo = await stakepool.borrowers(addr1.address);
      expect(borrowerInfo.borrowedAmount).to.equal(0);
    });
    
    it("Should not allow borrowing more than the limit", async function () {
      await stakepool.setBorrowingStatus(addr1.address, true);
      const borrowAmount = ethers.utils.parseEther("1001"); // More than 1% of 100000
    
      await expect(stakepool.connect(addr1).borrow(borrowAmount))
        .to.be.revertedWith("Exceeds borrowing limit");
    });
    
    it("Should not allow borrowing if not allowed", async function () {
      const borrowAmount = ethers.utils.parseEther("100");
    
      await expect(stakepool.connect(addr1).borrow(borrowAmount))
        .to.be.revertedWith("Not allowed to borrow");
    });
    
    it("Should not allow repaying more than borrowed", async function () {
      await stakepool.setBorrowingStatus(addr1.address, true);
      const borrowAmount = ethers.utils.parseEther("100");
      await stakepool.connect(addr1).borrow(borrowAmount);
    
      await token.connect(addr1).approve(stakepool.address, ethers.utils.parseEther("200"));
      
      await expect(stakepool.connect(addr1).repay(ethers.utils.parseEther("200")))
        .to.be.revertedWith("Repayment amount exceeds borrowed amount");
    });
    
    it("Should update total borrowed amount correctly", async function () {
      await stakepool.setBorrowingStatus(addr1.address, true);
      await stakepool.setBorrowingStatus(addr2.address, true);
    
      const borrowAmount1 = ethers.utils.parseEther("100");
      const borrowAmount2 = ethers.utils.parseEther("200");
    
      await stakepool.connect(addr1).borrow(borrowAmount1);
      await stakepool.connect(addr2).borrow(borrowAmount2);
    
      expect(await stakepool.totalBorrowed()).to.equal(borrowAmount1.add(borrowAmount2));
    
      await token.connect(addr1).approve(stakepool.address, borrowAmount1);
      await stakepool.connect(addr1).repay(borrowAmount1);
    
      expect(await stakepool.totalBorrowed()).to.equal(borrowAmount2);
    });
    
  });

  describe("Deployment", function () {
    it("Should set the right token", async function () {
      expect(await stakepool.token()).to.equal(token.address);
    });

    it("Should set the right owner", async function () {
      expect(await stakepool.hasRole(await stakepool.DEFAULT_ADMIN_ROLE(), owner.address)).to.equal(true);
    });
  });

  describe("Staking", function () {
    it("Should allow users to stake tokens", async function () {
      await stakepool.connect(addr1).stake(ethers.utils.parseEther("100"));
      expect(await stakepool.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther("100"));
      expect(await stakepool.totalSupply()).to.equal(ethers.utils.parseEther("100"));
    });

    it("Should not allow staking 0 tokens", async function () {
      await expect(stakepool.connect(addr1).stake(0)).to.be.revertedWith("Cannot stake 0");
    });
  });

  describe("Withdrawing", function () {
    beforeEach(async function () {
      await stakepool.connect(addr1).stake(ethers.utils.parseEther("100"));
    });

    it("Should allow users to withdraw staked tokens", async function () {
      await stakepool.connect(addr1).withdraw(ethers.utils.parseEther("50"));
      expect(await stakepool.balanceOf(addr1.address)).to.equal(ethers.utils.parseEther("50"));
      expect(await stakepool.totalSupply()).to.equal(ethers.utils.parseEther("50"));
    });

    it("Should not allow withdrawing 0 tokens", async function () {
      await expect(stakepool.connect(addr1).withdraw(0)).to.be.revertedWith("Cannot withdraw 0");
    });

    it("Should not allow withdrawing more than staked", async function () {
      await expect(stakepool.connect(addr1).withdraw(ethers.utils.parseEther("101"))).to.be.reverted;
    });
  });

  describe("Rewards", function () {
    beforeEach(async function () {
      await stakepool.connect(addr1).stake(ethers.utils.parseEther("100"));
      await token.transfer(stakepool.address, ethers.utils.parseEther("1000")); // Add rewards
      await stakepool.connect(owner).notifyRewardAmount(ethers.utils.parseEther("1000"));
    });

    it("Should calculate rewards correctly", async function () {
      await ethers.provider.send("evm_increaseTime", [86400]); // Advance time by 1 day
      await ethers.provider.send("evm_mine");

      const earned = await stakepool.earned(addr1.address);
      expect(earned).to.be.gt(0);
    });

    it("Should allow users to claim rewards", async function () {
      await ethers.provider.send("evm_increaseTime", [86400]); // Advance time by 1 day
      await ethers.provider.send("evm_mine");

      const initialBalance = await token.balanceOf(addr1.address);
      await stakepool.connect(addr1).getReward();
      const finalBalance = await token.balanceOf(addr1.address);

      expect(finalBalance).to.be.gt(initialBalance);
    });
  });

  describe("Exit", function () {
    beforeEach(async function () {
      await stakepool.connect(addr1).stake(ethers.utils.parseEther("100"));
      await token.transfer(stakepool.address, ethers.utils.parseEther("1000")); // Add rewards
      await stakepool.connect(owner).notifyRewardAmount(ethers.utils.parseEther("1000"));
      await ethers.provider.send("evm_increaseTime", [86400]); // Advance time by 1 day
      await ethers.provider.send("evm_mine");
    });

    it("Should allow users to exit and claim all tokens and rewards", async function () {
      const initialBalance = await token.balanceOf(addr1.address);
      await stakepool.connect(addr1).exit();
      const finalBalance = await token.balanceOf(addr1.address);

      expect(finalBalance).to.be.gt(initialBalance);
      expect(await stakepool.balanceOf(addr1.address)).to.equal(0);
    });
  });

  describe("Admin functions", function () {
    it("Should only allow admin to call notifyRewardAmount", async function () {
      await expect(stakepool.connect(addr1).notifyRewardAmount(ethers.utils.parseEther("1000"))).to.be.reverted;
      await expect(stakepool.connect(owner).notifyRewardAmount(ethers.utils.parseEther("1000"))).to.not.be.reverted;
    });
  });

  describe("Reward distribution over time", function () {
    it("Should have no rewards available after 1 year if no new tokens are added", async function () {
      // Stake tokens
      await stakepool.connect(addr1).stake(ethers.utils.parseEther("100"));
  
      // Add initial rewards
      await token.transfer(stakepool.address, ethers.utils.parseEther("365")); // 1 token per day for a year
      await stakepool.connect(owner).notifyRewardAmount(ethers.utils.parseEther("365"));
  
      // Fast forward time by slightly less than a year
      await ethers.provider.send("evm_increaseTime", [364 * 24 * 60 * 60]); // 364 days
      await ethers.provider.send("evm_mine");
  
      // Check rewards just before the year ends
      const rewardsBeforeYearEnd = await stakepool.earned(addr1.address);
      expect(rewardsBeforeYearEnd).to.be.closeTo(
        ethers.utils.parseEther("364"),
        ethers.utils.parseEther("1")
      );
  
      // Fast forward time to just after the year ends
      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]); // 2 more days
      await ethers.provider.send("evm_mine");
  
      // Check rewards after the year ends
      const rewardsAfterYearEnd = await stakepool.earned(addr1.address);
      expect(rewardsAfterYearEnd).to.be.closeTo(
        ethers.utils.parseEther("365"),
        ethers.utils.parseEther("1")
      );
  
      // Fast forward time by another month
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // 30 days
      await ethers.provider.send("evm_mine");
  
      // Check rewards after an additional month
      const rewardsAfterExtraMonth = await stakepool.earned(addr1.address);
      expect(rewardsAfterExtraMonth).to.be.closeTo(
        ethers.utils.parseEther("365"),
        ethers.utils.parseEther("1")
      );
  
      // Verify that no new rewards are being added
      expect(rewardsAfterExtraMonth).to.equal(rewardsAfterYearEnd);
    });
  });
  describe("Reward distribution with mid-year additions", function () {
    it("Should distribute new rewards for only one year and adjust reward rate", async function () {
      // Stake tokens
      await stakepool.connect(addr1).stake(ethers.utils.parseEther("100"));
  
      // Add initial rewards
      await token.transfer(stakepool.address, ethers.utils.parseEther("365")); // 1 token per day for a year
      await stakepool.connect(owner).notifyRewardAmount(ethers.utils.parseEther("365"));
  
      // Fast forward time by half a year
      await ethers.provider.send("evm_increaseTime", [182 * 24 * 60 * 60]); // 182 days
      await ethers.provider.send("evm_mine");
  
      // Check rewards and reward rate at half-year
      const rewardsAtHalfYear = await stakepool.earned(addr1.address);
      const rewardRateAtHalfYear = await stakepool.rewardRate();
      expect(rewardsAtHalfYear).to.be.closeTo(
        ethers.utils.parseEther("182"),
        ethers.utils.parseEther("1")
      );

      // Add more rewards mid-year
      await token.transfer(stakepool.address, ethers.utils.parseEther("365")); // Another 1 token per day for a year
      await stakepool.connect(owner).notifyRewardAmount(ethers.utils.parseEther("365"));

      // Check if reward rate has increased
      const newRewardRate = await stakepool.rewardRate();
      expect(newRewardRate).to.be.gt(rewardRateAtHalfYear);
  
      // Fast forward time to just before the new reward period ends (1.5 years from start)
      await ethers.provider.send("evm_increaseTime", [364 * 24 * 60 * 60]); // 364 days
      await ethers.provider.send("evm_mine");
  
      // Check rewards just before new period ends
      const rewardsBeforeNewPeriodEnds = await stakepool.earned(addr1.address);
      expect(rewardsBeforeNewPeriodEnds).to.be.closeTo(
        ethers.utils.parseEther("729"), // 182 (first half) + 547 (1.5 years - 182 days)
        ethers.utils.parseEther("2")
      );
  
      // Fast forward time to after the new reward period ends
      await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]); // 2 more days
      await ethers.provider.send("evm_mine");
  
      // Check rewards after new period ends
      const rewardsAfterNewPeriodEnds = await stakepool.earned(addr1.address);
      expect(rewardsAfterNewPeriodEnds).to.be.closeTo(
        ethers.utils.parseEther("730"), // All rewards should be distributed
        ethers.utils.parseEther("2")
      );
  
      // Fast forward time by another month
      await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60]); // 30 days
      await ethers.provider.send("evm_mine");
  
      // Check rewards after an additional month
      const rewardsAfterExtraMonth = await stakepool.earned(addr1.address);
      expect(rewardsAfterExtraMonth).to.equal(rewardsAfterNewPeriodEnds);
      console.log(rewardsAfterExtraMonth)
  
      // Verify that reward rate has returned to zero
      await stakepool.connect(addr1).exit()
      expect((await token.balanceOf(addr1.address))).to.be.closeTo(ethers.utils.parseEther("10730"), ethers.utils.parseEther("1"))
    });
  });
  
  describe("Reward distribution with multiple stakers", function () {
    it("Should distribute rewards proportionally when staking for the same duration", async function () {
      // Stake tokens from different addresses
      await stakepool.connect(addr1).stake(ethers.utils.parseEther("100")); // 100 tokens
      await stakepool.connect(addr2).stake(ethers.utils.parseEther("300")); // 300 tokens
  
      // Add rewards
      await token.transfer(stakepool.address, ethers.utils.parseEther("400")); // 400 tokens as reward
      await stakepool.connect(owner).notifyRewardAmount(ethers.utils.parseEther("400"));
  
      // Fast forward time by half a year
      await ethers.provider.send("evm_increaseTime", [182 * 24 * 60 * 60]); // 182 days
      await ethers.provider.send("evm_mine");
  
      // Check rewards
      const rewardsAddr1 = await stakepool.earned(addr1.address);
      const rewardsAddr2 = await stakepool.earned(addr2.address);
  
      // addr1 should have 1/4 of the rewards, addr2 should have 3/4
      expect(rewardsAddr1).to.be.closeTo(
        ethers.utils.parseEther("50"), // 200 * 1/4
        ethers.utils.parseEther("1")
      );
      expect(rewardsAddr2).to.be.closeTo(
        ethers.utils.parseEther("150"), // 200 * 3/4
        ethers.utils.parseEther("1")
      );
  
      // The sum of rewards should be close to 200 (half of the total rewards for half a year)
      const totalRewards = rewardsAddr1.add(rewardsAddr2);
      expect(totalRewards).to.be.closeTo(
        ethers.utils.parseEther("200"),
        ethers.utils.parseEther("2")
      );
    });
  
    it("Should distribute rewards proportionally when staking for different durations", async function () {
      // Stake tokens from addr1
      await stakepool.connect(addr1).stake(ethers.utils.parseEther("200")); // 200 tokens
  
      // Add initial rewards
      await token.transfer(stakepool.address, ethers.utils.parseEther("365")); // 1 token per day for a year
      await stakepool.connect(owner).notifyRewardAmount(ethers.utils.parseEther("365"));
  
      // Fast forward time by a quarter year
      await ethers.provider.send("evm_increaseTime", [91 * 24 * 60 * 60]); // 91 days
      await ethers.provider.send("evm_mine");
  
      // Stake tokens from addr2
      await stakepool.connect(addr2).stake(ethers.utils.parseEther("100")); // 100 tokens

      // Stake tokens from addr2
      await stakepool.connect(addr3).stake(ethers.utils.parseEther("100")); // 100 tokens
      
  
      // Fast forward time by another quarter year
      await ethers.provider.send("evm_increaseTime", [91 * 24 * 60 * 60]); // 91 days
      await ethers.provider.send("evm_mine");
  
      // Check rewards
      const rewardsAddr1 = await stakepool.earned(addr1.address);
      const rewardsAddr2 = await stakepool.earned(addr2.address);
      const rewardsAddr3 = await stakepool.earned(addr3.address);
  
      // addr1 should have more rewards than addr2
      expect(rewardsAddr1).to.be.gt(rewardsAddr2);
      expect(rewardsAddr1).to.be.gt(rewardsAddr3);

      // addr1 should have approximately 136.5 tokens (91 + 45.5)
      expect(rewardsAddr1).to.be.closeTo(
        ethers.utils.parseEther("136.3"),
        ethers.utils.parseEther("1")
      );
  
      // addr2 should have approximately 30.3 tokens
      expect(rewardsAddr2).to.be.closeTo(
        ethers.utils.parseEther("22.75"),
        ethers.utils.parseEther("1")
      );

      expect(rewardsAddr3).to.be.closeTo(
        ethers.utils.parseEther("22.75"),
        ethers.utils.parseEther("1")
      );
  
      // The sum of rewards should be close to 182 (half of the total rewards for half a year)
      const totalRewards = rewardsAddr1.add(rewardsAddr2).add(rewardsAddr3);
      expect(totalRewards).to.be.closeTo(
        ethers.utils.parseEther("182"),
        ethers.utils.parseEther("1")
      );

      await stakepool.connect(addr1).exit() 
      await stakepool.connect(addr3).exit() 

      // Fast forward time by another quarter year
      await ethers.provider.send("evm_increaseTime", [91 * 24 * 60 * 60]); // 91 days
      await ethers.provider.send("evm_mine");

      expect(await stakepool.earned(addr2.address)).to.be.closeTo(
        ethers.utils.parseEther("113.75"),
        ethers.utils.parseEther("1")
      );
    });
  });
});