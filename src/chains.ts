export type ChainName =
  | "Hardhat A"
  | "Hardhat B"
  | "Polygon zkEVM Testnet"
  | "scroll"
  | "goerli"
  | "sepolia"
  | "mantle"
  | "optimism"
  | "filecoin";

export interface ChainData {
  /**
   * the RPC endpoint that a provider should be pointed to. EG, http://localhost:8548 for
   * a default hardhat node
   */
  url: string;
  /**
   * the chainID.
   */
  chainID: ChainID;
  /**
   * The name of the chain. Populates eg, the "Host Network" UI field for channel wallets.
   */
  name: ChainName;
  /**
   * The 'ticker' symbol for the chain. Populates eg, the "Amount (ETH)" field for setting transactions.
   */
  symbol: string; // the 'ticker symbol' for the chain
  /**
   * A link to a block explorer for the chain. (eg, https://etherscan.io for Ethereum)
   */
  explorer: string;
  /**
   * The value of the chain's native token in USD. Permits cross-chain exchange rate calculations.
   */
  exchangeRate: number;
}

export type ChainID = bigint;

export const chains: ChainData[] = [
  {
    name: "Polygon zkEVM Testnet",
    symbol: "polyETH",
    url: "https://rpc.public.zkevm-test.net",
    chainID: 1442n,
    exchangeRate: 1,
    explorer: "https://testnet-zkevm.polygonscan.com/",
  },
  {
    url: "http://localhost:8545",
    chainID: 31337n,
    name: "Hardhat A",
    symbol: "hh1ETH",
    explorer: "",
    exchangeRate: 1,
  },
  {
    url: "http://localhost:8546",
    chainID: 31338n,
    name: "Hardhat B",
    symbol: "hh2ETH",
    explorer: "",
    exchangeRate: 2,
  },
  {
    chainID: 534351n,
    url: "https://sepolia-rpc.scroll.io",
    name: "scroll",
    explorer: "https://sepolia.scrollscan.com/",
    symbol: "scrETH",
    exchangeRate: 1,
  },
  {
    chainID: 5n,
    symbol: "ETH",
    name: "goerli",
    explorer: "https://goerli.etherscan.io",
    exchangeRate: 1,
    url: "https://goerli.blockpi.network/v1/rpc/public",
  },
  {
    chainID: 11155111n,
    symbol: "ETH",
    name: "sepolia",
    explorer: "https://sepolia.etherscan.io",
    exchangeRate: 1,
    url: "https://eth-sepolia.public.blastapi.io",
  },
  {
    chainID: 5001n,
    symbol: "MNT",
    name: "mantle",
    explorer: "https://explorer.testnet.mantle.xyz",
    exchangeRate: 1,
    url: "https://rpc.testnet.mantle.xyz",
  },
  {
    chainID: 420n,
    symbol: "ETH",
    name: "optimism",
    url: "https://optimism-goerli.public.blastapi.io",
    explorer: "https://goerli-optimism.etherscan.io",
    exchangeRate: 1,
  },
  {
    chainID: 314159n,
    symbol: "TFIL",
    name: "filecoin",
    url: "https://filecoin-calibration.chainup.net/rpc/v1",
    explorer: "https://calibration.filfox.info/en",
    exchangeRate: 1,
  },
];
