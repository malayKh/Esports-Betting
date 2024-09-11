const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("REKT Token Role Management", function () {
  let REKT;
  let rekt;
  let owner;
  let addr1;
  let addr2;
  let addrs;

  beforeEach(async function () {
    REKT = await ethers.getContractFactory("REKT");
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    rekt = await REKT.deploy("REKT Token", "REKT");
    await rekt.deployed();
  });
  

  const allowanceAmount = ethers.utils.parseEther("100");
  const transferAmount = ethers.utils.parseEther("50");
  const initialSupply = ethers.utils.parseEther("1000");


  describe("Initial Role Setup", function () {
    it("Should set the deployer as DEFAULT_ADMIN_ROLE", async function () {
      expect(await rekt.hasRole(await rekt.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.true;
    });

    it("Should set the deployer as MINTER_ROLE", async function () {
      expect(await rekt.hasRole(await rekt.MINTER_ROLE(), owner.address)).to.be.true;
    });

    it("Should set the deployer as PAUSER_ROLE", async function () {
      expect(await rekt.hasRole(await rekt.PAUSER_ROLE(), owner.address)).to.be.true;
    });
  });

  describe("MINTER_ROLE Management", function () {
    it("Should allow DEFAULT_ADMIN_ROLE to grant MINTER_ROLE", async function () {
      await rekt.grantRole(await rekt.MINTER_ROLE(), addr1.address);
      expect(await rekt.hasRole(await rekt.MINTER_ROLE(), addr1.address)).to.be.true;
    });

    it("Should allow DEFAULT_ADMIN_ROLE to revoke MINTER_ROLE", async function () {
      await rekt.grantRole(await rekt.MINTER_ROLE(), addr1.address);
      await rekt.revokeRole(await rekt.MINTER_ROLE(), addr1.address);
      expect(await rekt.hasRole(await rekt.MINTER_ROLE(), addr1.address)).to.be.false;
    });

    it("Should not allow non-admin to grant MINTER_ROLE", async function () {
      await expect(
        rekt.connect(addr1).grantRole(await rekt.MINTER_ROLE(), addr2.address)
      ).to.be.revertedWith("AccessControlUnauthorizedAccount");
    });
  });

  describe("PAUSER_ROLE Management", function () {
    it("Should allow DEFAULT_ADMIN_ROLE to grant PAUSER_ROLE", async function () {
      await rekt.grantRole(await rekt.PAUSER_ROLE(), addr1.address);
      expect(await rekt.hasRole(await rekt.PAUSER_ROLE(), addr1.address)).to.be.true;
    });

    it("Should allow DEFAULT_ADMIN_ROLE to revoke PAUSER_ROLE", async function () {
      await rekt.grantRole(await rekt.PAUSER_ROLE(), addr1.address);
      await rekt.revokeRole(await rekt.PAUSER_ROLE(), addr1.address);
      expect(await rekt.hasRole(await rekt.PAUSER_ROLE(), addr1.address)).to.be.false;
    });

    it("Should not allow non-admin to grant PAUSER_ROLE", async function () {
      await expect(
        rekt.connect(addr1).grantRole(await rekt.PAUSER_ROLE(), addr2.address)
      ).to.be.revertedWith("AccessControlUnauthorizedAccount");
    });
  });

  describe("DEFAULT_ADMIN_ROLE Management", function () {
    it("Should allow admin to grant DEFAULT_ADMIN_ROLE to another address", async function () {
      await rekt.grantRole(await rekt.DEFAULT_ADMIN_ROLE(), addr1.address);
      expect(await rekt.hasRole(await rekt.DEFAULT_ADMIN_ROLE(), addr1.address)).to.be.true;
    });

    it("Should allow admin to revoke their own DEFAULT_ADMIN_ROLE", async function () {
      await rekt.renounceRole(await rekt.DEFAULT_ADMIN_ROLE(), owner.address);
      expect(await rekt.hasRole(await rekt.DEFAULT_ADMIN_ROLE(), owner.address)).to.be.false;
    });

    it("Should not allow non-admin to grant DEFAULT_ADMIN_ROLE", async function () {
      await expect(
        rekt.connect(addr1).grantRole(await rekt.DEFAULT_ADMIN_ROLE(), addr2.address)
      ).to.be.revertedWith("AccessControlUnauthorizedAccount");
    });
  });

  describe("Role Interactions", function () {
    it("MINTER_ROLE should be able to mint, but not pause", async function () {
      await rekt.grantRole(await rekt.MINTER_ROLE(), addr1.address);
      await rekt.connect(addr1).mint(addr2.address, 100);
      expect(await rekt.balanceOf(addr2.address)).to.equal(100);
      await expect(rekt.connect(addr1).pause()).to.be.revertedWith("AccessControlUnauthorizedAccount");
    });

    it("PAUSER_ROLE should be able to pause, but not mint", async function () {
      await rekt.grantRole(await rekt.PAUSER_ROLE(), addr1.address);
      await rekt.connect(addr1).pause();
      expect(await rekt.paused()).to.be.true;
      await expect(rekt.connect(addr1).mint(addr2.address, 100)).to.be.revertedWith("AccessControlUnauthorizedAccount");
    });

    it("DEFAULT_ADMIN_ROLE without other roles should not be able to mint or pause", async function () {
      await rekt.grantRole(await rekt.DEFAULT_ADMIN_ROLE(), addr1.address);
      await rekt.renounceRole(await rekt.MINTER_ROLE(), owner.address);
      await rekt.renounceRole(await rekt.PAUSER_ROLE(), owner.address);
      
      await expect(rekt.connect(addr1).mint(addr2.address, 100)).to.be.revertedWith("AccessControlUnauthorizedAccount");
      await expect(rekt.connect(addr1).pause()).to.be.revertedWith("AccessControlUnauthorizedAccount");
    });
  });
  describe("Deployment", function () {
    it("Should set the right name and symbol", async function () {
      expect(await rekt.name()).to.equal("REKT Token");
      expect(await rekt.symbol()).to.equal("REKT");
    });

    it("Should grant PAUSER_ROLE and MINTER_ROLE to the deployer", async function () {
      expect(await rekt.hasRole(await rekt.PAUSER_ROLE(), owner.address)).to.be.true;
      expect(await rekt.hasRole(await rekt.MINTER_ROLE(), owner.address)).to.be.true;
    });
  });

  describe("Minting", function () {
    it("Should allow minting by MINTER_ROLE", async function () {
      await rekt.mint(addr1.address, 100);
      expect(await rekt.balanceOf(addr1.address)).to.equal(100);
    });

    it("Should not allow minting by non-MINTER_ROLE", async function () {
      await expect(rekt.connect(addr1).mint(addr2.address, 100)).to.be.revertedWith("AccessControlUnauthorizedAccount");
    });

    it("Should not allow minting when paused", async function () {
      await rekt.pause();
      await expect(rekt.mint(addr1.address, 100)).to.be.revertedWith("EnforcedPause");
    });

    it("Should not allow minting beyond MAX_SUPPLY", async function () {
      const maxSupply = await rekt.MAX_SUPPLY();
      await expect(rekt.mint(addr1.address, maxSupply.add(1))).to.be.revertedWith("Exceeds maximum supply");
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      await rekt.mint(addr1.address, 1000);
    });

    it("Should allow burning", async function () {
      await rekt.connect(addr1).burn(100);
      expect(await rekt.balanceOf(addr1.address)).to.equal(900);
    });
  });

  describe("Pausing", function () {
    it("Should allow pausing by PAUSER_ROLE", async function () {
      await rekt.pause();
      expect(await rekt.paused()).to.be.true;
    });

    it("Should not allow pausing by non-PAUSER_ROLE", async function () {
      await expect(rekt.connect(addr1).pause()).to.be.revertedWith("AccessControlUnauthorizedAccount");
    });

    it("Should allow unpausing by PAUSER_ROLE", async function () {
      await rekt.pause();
      await rekt.unpause();
      expect(await rekt.paused()).to.be.false;
    });
  });
  describe("Allowance", function () {



    it("Should set correct allowance after approval", async function () {
      await rekt.mint(owner.address, ethers.utils.parseEther("1000"));
      await rekt.approve(addr1.address, allowanceAmount);
      expect(await rekt.allowance(owner.address, addr1.address)).to.equal(allowanceAmount);
    });

    it("Should emit Approval event on allowance change", async function () {
      await rekt.mint(owner.address, ethers.utils.parseEther("1000"));
      await expect(rekt.approve(addr1.address, allowanceAmount))
        .to.emit(rekt, "Approval")
        .withArgs(owner.address, addr1.address, allowanceAmount);
    });

    it("Should allow changing allowance", async function () {
      await rekt.mint(owner.address, ethers.utils.parseEther("1000"));
      await rekt.approve(addr1.address, allowanceAmount);
      await rekt.approve(addr1.address, transferAmount);
      expect(await rekt.allowance(owner.address, addr1.address)).to.equal(transferAmount);
    });
  });

  describe("TransferFrom", function () {
    beforeEach(async function () {
      await rekt.mint(owner.address, ethers.utils.parseEther("1000"));
      await rekt.approve(addr2.address, allowanceAmount);
    });

    it("Should allow transferFrom within allowance", async function () {
      await rekt.connect(addr2).transferFrom(owner.address, addr1.address, transferAmount);
      expect(await rekt.balanceOf(addr1.address)).to.equal(transferAmount);
      expect(await rekt.allowance(owner.address, addr2.address)).to.equal(allowanceAmount.sub(transferAmount));
    });

    it("Should not allow transferFrom above allowance", async function () {
      await expect(
        rekt.connect(addr2).transferFrom(owner.address, addr1.address, allowanceAmount.add(1))
      ).to.be.revertedWith("ERC20InsufficientAllowance");
    });

    it("Should not allow transferFrom if owner has insufficient balance", async function () {
      await rekt.transfer(addr1.address, initialSupply.sub(transferAmount)); // Leave only transferAmount in owner's balance
      await expect(
        rekt.connect(addr2).transferFrom(owner.address, addr1.address, allowanceAmount)
      ).to.be.revertedWith("ERC20InsufficientBalance");
    });
  });

  describe("Transfer", function () {
    beforeEach(async function () {
      await rekt.mint(owner.address, ethers.utils.parseEther("1000"));
    });
    it("Should transfer tokens between accounts", async function () {
      // Transfer tokens from owner to addr1
      await rekt.transfer(addr1.address, transferAmount);

      const addr1Balance = await rekt.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(transferAmount);

      // Transfer tokens from addr1 to addr2
      await rekt.connect(addr1).transfer(addr2.address, transferAmount.div(2));

      const addr2Balance = await rekt.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(transferAmount.div(2));
    });

    it("Should emit Transfer event", async function () {
      await expect(rekt.transfer(addr1.address, transferAmount))
        .to.emit(rekt, "Transfer")
        .withArgs(owner.address, addr1.address, transferAmount);
    });

    it("Should fail if sender doesn't have enough tokens", async function () {
      const initialOwnerBalance = await rekt.balanceOf(owner.address);
      await expect(
        rekt.connect(addr1).transfer(owner.address, 1)
      ).to.be.revertedWith("ERC20InsufficientBalance");

      expect(await rekt.balanceOf(owner.address)).to.equal(initialOwnerBalance);
    });

    it("Should update balances after transfers", async function () {
      const initialOwnerBalance = await rekt.balanceOf(owner.address);

      // Transfer to addr1
      await rekt.transfer(addr1.address, transferAmount);

      // Transfer to addr2
      await rekt.transfer(addr2.address, transferAmount);

      // Check balances
      const finalOwnerBalance = await rekt.balanceOf(owner.address);
      expect(finalOwnerBalance).to.equal(initialOwnerBalance.sub(transferAmount.mul(2)));

      const addr1Balance = await rekt.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(transferAmount);

      const addr2Balance = await rekt.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(transferAmount);
    });

    it("Should fail when transferring to the zero address", async function () {
      await expect(
        rekt.transfer(ethers.constants.AddressZero, transferAmount)
      ).to.be.revertedWith("ERC20InvalidReceiver");
    });

    it("Should allow transferring zero tokens", async function () {
      await expect(rekt.transfer(addr1.address, 0)).to.not.be.reverted;
      expect(await rekt.balanceOf(addr1.address)).to.equal(0);
    });

    describe("Unpause", function () {
      it("Should unpause the contract when paused", async function () {
        await rekt.pause();
        await rekt.unpause();
        expect(await rekt.paused()).to.be.false;
      });
  
      it("Should emit an Unpaused event", async function () {
        await rekt.pause();
        await expect(rekt.unpause())
          .to.emit(rekt, "Unpaused")
          .withArgs(owner.address);
      });
  
      it("Should not unpause when not paused", async function () {
        await expect(rekt.unpause()).to.be.revertedWith("ExpectedPause");
      });
  
      it("Should only allow the owner to unpause", async function () {
        await rekt.pause();
        await expect(rekt.connect(addr1).unpause()).to.be.revertedWith("AccessControlUnauthorizedAccount");
      });
  
      it("Should maintain correct paused state after multiple pause/unpause cycles", async function () {
        await rekt.pause();
        await rekt.unpause();
        await rekt.pause();
        await rekt.unpause();
        expect(await rekt.paused()).to.be.false;
      });
    });

  });
});