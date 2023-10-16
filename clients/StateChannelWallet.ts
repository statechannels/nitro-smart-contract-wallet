import { ethers } from "ethers";
import {
  type UserOperationStruct,
  type HTLCStruct,
  type StateStruct,
  type NitroSmartContractWallet,
} from "../typechain-types/Nitro-SCW.sol/NitroSmartContractWallet";
import { signUserOp } from "./UserOp";
import { NitroSmartContractWallet__factory } from "../typechain-types";
import { hashState } from "../test/State";

const HTLC_TIMEOUT = 5 * 60; // 5 minutes

export class StateChannelWallet {
  private readonly chainProvider: ethers.Provider;
  private readonly signer: ethers.Wallet;
  private readonly entrypointAddress: string;
  private intermediaryAddress: string;
  private intermediaryBalance: bigint;
  private readonly scwAddress: string;
  private readonly contract: NitroSmartContractWallet;
  private readonly hashStore: Map<string, Uint8Array>; // maps hash-->preimage

  constructor(params: {
    signingKey: string;
    chainRpcUrl: string;
    entrypointAddress: string;
    scwAddress: string;
  }) {
    this.hashStore = new Map<string, Uint8Array>();
    this.entrypointAddress = params.entrypointAddress;
    this.scwAddress = params.scwAddress;
    this.chainProvider = new ethers.JsonRpcProvider(params.chainRpcUrl);

    const wallet = new ethers.Wallet(params.signingKey);
    this.signer = wallet.connect(this.chainProvider);

    this.contract = NitroSmartContractWallet__factory.connect(
      this.scwAddress,
      this.chainProvider,
    );

    // These values should be set in 'create' method
    this.intermediaryAddress = "0x0";
    this.intermediaryBalance = BigInt(0);
  }

  static async create(params: {
    signingKey: string;
    chainRpcUrl: string;
    entrypointAddress: string;
    scwAddress: string;
  }): Promise<StateChannelWallet> {
    const instance = new StateChannelWallet(params);

    instance.intermediaryAddress = await instance.contract.intermediary();
    instance.intermediaryBalance =
      await instance.contract.intermediaryBalance();

    return instance;
  }

  async getBalance(): Promise<number> {
    // todo: caching, block event based updating, etc
    const balance = await this.chainProvider.getBalance(this.scwAddress);
    const balanceEther = ethers.formatEther(balance);
    return Number(balanceEther);
  }

  async getIntermediaryBalance(): Promise<number> {
    return Number(this.intermediaryBalance);
  }

  async getOwnerBalance(): Promise<number> {
    const walletBalance = await this.getBalance();
    return walletBalance - (await this.getIntermediaryBalance());
  }

  async getCurrentBlockNumber(): Promise<number> {
    const blockNumber = await this.chainProvider.getBlockNumber();
    return blockNumber;
  }

  async signUserOperation(userOp: UserOperationStruct): Promise<string> {
    const network = await this.chainProvider.getNetwork();
    const signature = signUserOp(
      userOp,
      this.signer,
      this.entrypointAddress,
      Number(network.chainId),
    );
    return signature;
  }

  async createNewHash(): Promise<string> {
    const preimage = ethers.randomBytes(32);
    const hash = ethers.keccak256(preimage);
    this.hashStore.set(hash, preimage);
    return hash;
  }

  // Craft an HTLC struct, put it inside a state, hash the state, sign and return it
  async createHTLCPayment(
    toAddress: string,
    amount: number,
    hash: string,
  ): Promise<string> {
    const currentTimestamp: number = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    const htlc: HTLCStruct = {
      to: toAddress,
      amount,
      hashLock: hash,
      timelock: currentTimestamp + HTLC_TIMEOUT * 2, // payment creator always uses TIMEOUT * 2
    };

    const htlcState: StateStruct = {
      owner: this.signer.address,
      intermediary: this.intermediaryAddress,
      turnNum: 0,
      intermediaryBalance: this.intermediaryBalance,
      htlcs: [htlc],
    };

    const stateHash = hashState(htlcState);
    const signature = await this.signer.signMessage(stateHash);

    return signature;
  }
  // ingestSignedStateAndPreimage(signedState, preimage); // returns a signed state with updated balances and one fewer HTLC
}
