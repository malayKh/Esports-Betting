const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Tournament Contracts", function () {
  let MainTournamentContract;
  let TournamentSubContract;
  let mainContract;
  let subContract;
  let paymentToken;
  let owner;
  let addr1;
  let addr2;
  let addr3;
  let addr4;
  let addr5;
  let addr6;

  const ENTRY_FEE = ethers.utils.parseEther("1");
  const TEAM_SIZE = 5;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, addr4, addr5, addr6] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockToken = await ethers.getContractFactory("REKT");
    paymentToken = await MockToken.deploy("Rekt Token", "REKT", 6);
    await paymentToken.deployed();

    // Deploy MainTournamentContract
    MainTournamentContract = await ethers.getContractFactory("MainTournamentContract");
    mainContract = await MainTournamentContract.deploy(paymentToken.address);
    await mainContract.deployed();

    // Deploy TournamentSubContract
    TournamentSubContract = await ethers.getContractFactory("TournamentSubContract");
    subContract = await TournamentSubContract.deploy(paymentToken.address, mainContract.address, ENTRY_FEE);
    await subContract.deployed();

    // Add subContract to mainContract
    await mainContract.addSubContract(subContract.address, TEAM_SIZE);

    // Grant MANAGER_ROLE to addr1
    await mainContract.grantRole(await mainContract.MANAGER_ROLE(), addr1.address);

    // Mint tokens to players
    const mintAmount = ethers.utils.parseEther("100");
    for (const addr of [addr1, addr2, addr3, addr4, addr5, addr6]) {
      await paymentToken.mint(addr.address, mintAmount);
      await paymentToken.connect(addr).approve(subContract.address, mintAmount);
    }
  });

  describe("MainTournamentContract", function () {
    it("Should add a sub-contract", async function () {
      const subContractInfo = await mainContract.subContracts(subContract.address);
      expect(subContractInfo.playerCount).to.equal(TEAM_SIZE);
      expect(subContractInfo.isActive).to.be.true;
    });

    it("Should register a team", async function () {
      const players = [addr2.address, addr3.address, addr4.address, addr5.address, addr6.address];
      await mainContract.connect(addr1).registerTeam(subContract.address, players);
      const managerSubContract = await mainContract.managerToSubContract(addr1.address);
      expect(managerSubContract).to.equal(subContract.address);
    });

    it("Should distribute prizes and collect tax", async function () {
      // Register a team
      const players = [addr2.address, addr3.address, addr4.address, addr5.address, addr6.address];
      await mainContract.connect(addr1).registerTeam(subContract.address, players);

      // Add funds to main contract
      const prizeAmount = ethers.utils.parseEther("10");
      await paymentToken.mint(mainContract.address, prizeAmount);

      // Distribute prizes
      await mainContract.distributePrizes(subContract.address, [addr1.address], [prizeAmount]);

      // Check tax collection
      const taxRate = await mainContract.TAX_RATE();
      const expectedTax = prizeAmount.mul(taxRate).div(10000);
      const mainContractBalance = await paymentToken.balanceOf(mainContract.address);
      expect(mainContractBalance).to.equal(expectedTax);

      // Check prize distribution
      const subContractBalance = await paymentToken.balanceOf(subContract.address);
      expect(subContractBalance).to.equal(prizeAmount.sub(expectedTax));
    });
  });

  describe("TournamentSubContract", function () {
    it("Should register a team and collect entry fee", async function () {
      const players = [addr2.address, addr3.address, addr4.address, addr5.address, addr6.address];
      await subContract.connect(mainContract.signer).registerTeam(addr1.address, players);

      const team = await subContract.managerTeam(addr1.address);
      expect(team.isRegistered).to.be.true;

      const rewardPool = await subContract.rewardPool();
      expect(rewardPool).to.equal(ENTRY_FEE);
    });

    it("Should distribute prizes correctly", async function () {
      // Register a team
      const players = [addr2.address, addr3.address, addr4.address, addr5.address, addr6.address];
      await subContract.connect(mainContract.signer).registerTeam(addr1.address, players);

      // Add funds to reward pool
      const prizeAmount = ethers.utils.parseEther("10");
      await paymentToken.mint(mainContract.address, prizeAmount);
      await paymentToken.connect(mainContract.signer).approve(subContract.address, prizeAmount);
      await subContract.connect(mainContract.signer).addToRewardPool(prizeAmount);

      // Distribute prizes
      await subContract.connect(mainContract.signer).distributePrizes([addr1.address], [prizeAmount]);

      // Check captain's share
      const captainRoyalty = await subContract.CAPTAIN_ROYALTY();
      const expectedCaptainShare = prizeAmount.mul(captainRoyalty).div(100);
      const captainBalance = await paymentToken.balanceOf(addr2.address);
      expect(captainBalance).to.equal(expectedCaptainShare);

      // Check players' shares
      const expectedPlayerShare = prizeAmount.sub(expectedCaptainShare).div(TEAM_SIZE);
      for (const playerAddr of [addr3, addr4, addr5, addr6]) {
        const playerBalance = await paymentToken.balanceOf(playerAddr.address);
        expect(playerBalance).to.equal(expectedPlayerShare);
      }

      // Check reward pool is emptied
      const finalRewardPool = await subContract.rewardPool();
      expect(finalRewardPool).to.equal(0);
    });

    it("Should allow withdrawal of tokens", async function () {
      // Add funds to reward pool
      const amount = ethers.utils.parseEther("5");
      await paymentToken.mint(mainContract.address, amount);
      await paymentToken.connect(mainContract.signer).approve(subContract.address, amount);
      await subContract.connect(mainContract.signer).addToRewardPool(amount);

      // Withdraw tokens
      await subContract.connect(mainContract.signer).withdrawTokens(owner.address, amount);

      const ownerBalance = await paymentToken.balanceOf(owner.address);
      expect(ownerBalance).to.equal(amount);

      const finalRewardPool = await subContract.rewardPool();
      expect(finalRewardPool).to.equal(0);
    });

    it("Should update entry fee", async function () {
      const newEntryFee = ethers.utils.parseEther("2");
      await subContract.connect(mainContract.signer).setEntryFee(newEntryFee);

      const updatedEntryFee = await subContract.entryFee();
      expect(updatedEntryFee).to.equal(newEntryFee);
    });

    it("Should update captain royalty", async function () {
      const newRoyalty = 10; // 10%
      await subContract.connect(mainContract.signer).setCaptainRoyalty(newRoyalty);

      const updatedRoyalty = await subContract.CAPTAIN_ROYALTY();
      expect(updatedRoyalty).to.equal(newRoyalty);
    });

    it("Should clean up tournament", async function () {
      // Register a team
      const players = [addr2.address, addr3.address, addr4.address, addr5.address, addr6.address];
      await subContract.connect(mainContract.signer).registerTeam(addr1.address, players);

      // Clean up tournament
      await subContract.connect(mainContract.signer).cleanupTournament();

      // Check if team is unregistered
      const team = await subContract.managerTeam(addr1.address);
      expect(team.isRegistered).to.be.false;

      // Check if registered managers are cleared
      const registeredManagersCount = await subContract.registeredManagers.length;
      expect(registeredManagersCount).to.equal(0);
    });
  });
});