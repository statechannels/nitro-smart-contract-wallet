import { type HardhatUserConfig } from "hardhat/config";

import "@typechain/hardhat";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";

const config: HardhatUserConfig = {
  networks: {
    // Used for the origin chain started by `yarn chain:a`
    a: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Used for the destination chain started by `yarn chain:b`
    b: {
      url: "http://127.0.0.1:8546",
      chainId: 31338,
    },
    scroll: {
      url: "https://sepolia-rpc.scroll.io",
      accounts:
        process.env.DEPLOY_KEY !== undefined ? [process.env.DEPLOY_KEY] : [],
    },
    polygonzkevm: {
      url: "https://rpc.public.zkevm-test.net",
      accounts:
        process.env.DEPLOY_KEY !== undefined ? [process.env.DEPLOY_KEY] : [],
    },
    goerli: {
      url: "https://goerli.blockpi.network/v1/rpc/public",
      accounts:
        process.env.DEPLOY_KEY !== undefined ? [process.env.DEPLOY_KEY] : [],
    },
    sepolia: {
      url: "https://eth-sepolia.public.blastapi.io",
      accounts:
        process.env.DEPLOY_KEY !== undefined ? [process.env.DEPLOY_KEY] : [],
    },
    mantle: {
      url: "https://rpc.testnet.mantle.xyz",
      accounts:
        process.env.DEPLOY_KEY !== undefined ? [process.env.DEPLOY_KEY] : [],
    },
    optimism: {
      url: "https://optimism-goerli.public.blastapi.io",
      accounts:
        process.env.DEPLOY_KEY !== undefined ? [process.env.DEPLOY_KEY] : [],
    },
    filecoin: {
      url: "https://api.calibration.node.glif.io/rpc/v1",
      accounts:
        process.env.DEPLOY_KEY !== undefined ? [process.env.DEPLOY_KEY] : [],
    },
    // Used for testing
    hardhat: {
      chainId:
        // Unfortunately hardhat node doesn't support specifying a chainId or network; it just uses the default hardhat network.
        // To work around this we use an environment variable to specify which chain we're on, and then set the chainId accordingly.
        (process.env.IS_DESTINATION ?? "").toLowerCase() === "true"
          ? 31338
          : 31337,
    },
  },
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
};

export default config;
