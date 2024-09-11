require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
const { ethers } = require("ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
      accounts: {
        count: 20,
        accountsBalance: ethers.utils.parseEther("50000").toString()// Increase the number of accounts for more bettors
      },
    },
  },
};
