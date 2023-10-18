import { type Invoice, type scwMessageEvent, MessageType } from "./Messages";
import { ethers, getBytes } from "ethers";
import {
  Participant,
  StateChannelWallet,
  type StateChannelWalletParams,
} from "./StateChannelWallet";
import { type UserOperationStruct } from "../typechain-types/contracts/SCBridgeWallet";
import { fillUserOpDefaults } from "./UserOp";
import { IAccount } from "./utils";
import { hashState } from "./State";

export class OwnerClient extends StateChannelWallet {
  private nonce = 0;
  constructor(params: StateChannelWalletParams) {
    super(params);

    this.attachMessageHandlers();
    console.log("listening on " + this.globalBroadcastChannel.name);
  }

  private attachMessageHandlers(): void {
    // These handlers are for messages from parties outside of our wallet / channel.
    this.globalBroadcastChannel.onmessage = async (ev: scwMessageEvent) => {
      const req = ev.data;
      console.log("received message: " + JSON.stringify(req));

      if (req.type === MessageType.RequestInvoice) {
        const hash = await this.createNewHash();
        const invoice: Invoice = {
          type: MessageType.Invoice,
          hashLock: hash,
          amount: req.amount,
        };

        // return the invoice to the payer on the same channel we received the request
        this.globalBroadcastChannel.postMessage(invoice);
      }
    };

    // These handlers are for messages from the channel/wallet peer (our intermediary).
    this.peerBroadcastChannel.onmessage = async (ev: scwMessageEvent) => {
      const req = ev.data;
      if (req.type === MessageType.ForwardPayment) {
        // claim the payment if it is for us
        const preimage = this.hashStore.get(req.hashLock);

        if (preimage === undefined) {
          throw new Error("Hashlock not found");

          // todo: or forward the payment if it is multihop (not in scope for now)
        }
        const updated = await this.unlockHTLC(preimage);

        this.sendPeerMessage({
          type: MessageType.UnlockHTLC,
          preimage,
          updatedState: updated,
        });
      } else if (req.type === MessageType.UnlockHTLC) {
        // run the preimage through the state update function
        const updated = await this.unlockHTLC(req.preimage);
        const updatedHash = hashState(updated.state);

        // check that the proposed update is correct
        if (updatedHash !== hashState(req.updatedState.state)) {
          throw new Error("Invalid state update");
          // todo: peerMessage to sender with failure
        }
        const signer = ethers.recoverAddress(
          ethers.hashMessage(getBytes(updatedHash)),
          req.updatedState.intermediarySignature,
        );
        if (signer !== this.intermediaryAddress) {
          throw new Error("Invalid signature");
          // todo: peerMessage to sender with failure
        }
      }
    };
  }

  static async create(params: StateChannelWalletParams): Promise<OwnerClient> {
    const instance = new OwnerClient(params);

    if (instance.myRole() !== Participant.Owner) {
      throw new Error("Signer is not owner");
    }

    await OwnerClient.hydrateWithChainData(instance);
    return instance;
  }

  /**
   * Coordinates with the payee to transfer funds to them. Payee is first
   * asked for a hashlock, then the lock is used to forward payment via
   * the intermediary.
   *
   * @param payee the SCBridgeWallet address we want to pay to
   * @param amount the amount we want to pay
   */
  async pay(payee: string, amount: number): Promise<void> {
    // contact `payee` and request an invoice
    const invoice = await this.sendGlobalMessage(payee, {
      type: MessageType.RequestInvoice,
      amount,
      from: this.ownerAddress,
    });

    if (invoice.type !== MessageType.Invoice) {
      throw new Error("Unexpected response");
    }

    // create a state update with the hashlock
    const signedUpdate = this.addHTLC(amount, invoice.hashLock);

    // send the state update to the intermediary
    this.sendPeerMessage({
      type: MessageType.ForwardPayment,
      target: payee,
      amount,
      hashLock: invoice.hashLock,
      timelock: 0, // todo
      updatedState: signedUpdate,
    });
  }

  // Create L1 payment UserOperation and forward to intermediary
  async payL1(payee: string, amount: number): Promise<string> {
    // Only need to encode 'to' and 'amount' fields (i.e. no 'data') for basic eth transfer
    const callData = IAccount.encodeFunctionData("execute", [
      payee,
      ethers.parseEther(amount.toString()),
      "0x", // specifying no data makes sure the call is interpreted as a basic eth transfer
    ]);
    const partialUserOp: Partial<UserOperationStruct> = {
      sender: this.scBridgeWalletAddress,
      callData,
      nonce: this.nonce,
      // TODO: Clean up these defaults
      callGasLimit: 40_000,
      verificationGasLimit: 150000,
      preVerificationGas: 21000,
      maxFeePerGas: 40_000,
      maxPriorityFeePerGas: 40_000,
    };
    const userOp = fillUserOpDefaults(partialUserOp);
    const { signature, hash } = await this.signUserOperation(userOp);
    const signedUserOp: UserOperationStruct = {
      ...userOp,
      signature,
    };
    this.sendPeerMessage({
      type: MessageType.UserOperation,
      ...signedUserOp,
    });

    console.log(
      `Initiated transfer of ${amount} ETH to ${payee} (userOpHash: ${hash})`,
    );

    // Increment nonce for next transfer
    this.nonce++;

    return hash;
  }
}
