pragma solidity 0.8.19;

// SPDX-License-Identifier: MIT

import {IAccount} from "contracts/interfaces/IAccount.sol";
import {UserOperation} from "contracts/interfaces/UserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {HTLC, State, hashState, checkSignatures, Participant} from "./state.sol";
enum WalletStatus {
  OPEN,
  CHALLENGE_RAISED,
  FINALIZED
}

uint constant CHALLENGE_WAIT = 1 days;

contract SCBridgeWallet is IAccount {
  using ECDSA for bytes32;

  address entrypoint;

  address public owner;
  address payable public intermediary;

  bytes32[] activeHTLCs;
  mapping(bytes32 => HTLC) htlcs;

  uint highestTurnNum;
  uint challengeExpiry;
  uint public intermediaryBalance;

  function getStatus() public view returns (WalletStatus) {
    if (challengeExpiry == 0) {
      return WalletStatus.OPEN;
    }

    if (block.timestamp > challengeExpiry) {
      return WalletStatus.FINALIZED;
    }

    return WalletStatus.CHALLENGE_RAISED;
  }

  // Define the fallback function so that the wallet can receive funds
  receive() external payable {}

  function unlockHTLC(bytes32 hashLock, bytes memory preImage) public {
    HTLC memory htlc = htlcs[hashLock];

    require(htlc.timelock > block.timestamp, "HTLC already expired");
    require(
      htlc.hashLock == keccak256(preImage) || htlc.hashLock == sha256(preImage), // For lightening network compatible HTLCs
      "Invalid preImage"
    );

    removeActiveHTLC(hashLock);

    if (htlc.to == Participant.INTERMEDIARY) {
      intermediaryBalance += htlc.amount;
    }
  }

  function removeActiveHTLC(bytes32 hashLock) private {
    for (uint i; i < activeHTLCs.length;) {
      if (activeHTLCs[i] == hashLock) {
        // Shift elements over
        for (uint j = i; j < activeHTLCs.length - 1;) {
          activeHTLCs[j] = activeHTLCs[j + 1];

          unchecked {
            ++j;
          }
        }
        // remove the duplicate at the end
        activeHTLCs.pop();
        break;
      }
    }
    delete htlcs[hashLock];

    unchecked {
      ++i;
    }
  }

  function reclaim() public {
    require(getStatus() == WalletStatus.FINALIZED, "Wallet not finalized");

    // Release any expired funds back to the sender
    for (uint i; i < activeHTLCs.length;) {
      HTLC memory htlc = htlcs[activeHTLCs[i]];
      if (htlc.to == Participant.OWNER) {
        intermediary.transfer(htlc.amount);
      }

      unchecked {
        ++i;
      }
      // Any funds that are left over are defacto controlled by the owner
    }

    intermediary.transfer(intermediaryBalance);

    intermediaryBalance = 0;
    activeHTLCs = new bytes32[](0);
  }

  function challenge(
    State calldata state,
    bytes calldata ownerSignature,
    bytes calldata intermediarySignature
  ) external {
    checkSignatures(state, ownerSignature, intermediarySignature);

    WalletStatus status = getStatus();

    require(status != WalletStatus.FINALIZED, "Wallet already finalized");
    require(
      status != WalletStatus.CHALLENGE_RAISED || state.turnNum > highestTurnNum,
      "Challenge already exists with a larger TurnNum"
    );

    highestTurnNum = state.turnNum;
    intermediaryBalance = state.intermediaryBalance;

    uint largestTimeLock;
    activeHTLCs = new bytes32[](state.htlcs.length);
    for (uint256 i; i < state.htlcs.length;) {
      activeHTLCs[i] = state.htlcs[i].hashLock;
      htlcs[state.htlcs[i].hashLock] = state.htlcs[i];
      if (state.htlcs[i].timelock > largestTimeLock) {
        largestTimeLock = state.htlcs[i].timelock;
      }

      unchecked {
        ++i;
      }
    }

    challengeExpiry = largestTimeLock + CHALLENGE_WAIT;
  }

  function execute(address dest, uint256 value, bytes calldata func) external {
    if (getStatus() == WalletStatus.FINALIZED && activeHTLCs.length == 0) {
      // If the wallet has finalized and all the funds have been reclaimed then the owner can do whatever they want with the remaining funds
      // The owner can call this function directly or the entrypoint can call it on their behalf
      require(
        msg.sender == entrypoint || msg.sender == owner,
        "account: not Owner or EntryPoint"
      );
    } else {
      // If the wallet is not finalized then the owner isn't allowed to spend funds however they want
      // Any interaction with the wallet must be done by signing and submitting a userOp to the entrypoint
      require(msg.sender == entrypoint, "account: not EntryPoint");
    }

    (bool success, bytes memory result) = dest.call{value: value}(func);
    if (!success) {
      assembly {
        revert(add(result, 32), mload(result))
      }
    }
  }

  function permitted(bytes4 functionSelector) internal pure returns (bool) {
    return (functionSelector == this.challenge.selector ||
      functionSelector == this.reclaim.selector ||
      functionSelector == this.unlockHTLC.selector);
  }

  function validateUserOp(
    UserOperation calldata userOp,
    bytes32 userOpHash,
    uint256 // missingAccountFunds
  ) external view returns (uint256 validationData) {
    bytes memory ownerSig = userOp.signature[0:65];
    // The owner of the wallet must always approve of any user operation to execute on its behalf
    require(
      validateSignature(userOpHash, ownerSig, owner) ==
        SIG_VALIDATION_SUCCEEDED,
      "owner must sign"
    );

    // If the wallet is finalized then the owner can do whatever they want with the remaining funds
    if (getStatus() == WalletStatus.FINALIZED) {
      return SIG_VALIDATION_SUCCEEDED;
    }

    // If the function is permitted, it can be called at any time
    // (including when the wallet is in CHALLENGE_RAISED) with no further checks.
    bytes4 functionSelector = bytes4(userOp.callData[0:4]);
    if (permitted(functionSelector)) return SIG_VALIDATION_SUCCEEDED;

    // If the wallet is open, we need to apply extra conditions:
    if (getStatus() == WalletStatus.OPEN) {
      bytes memory intermediarySig = userOp.signature[65:130];
      return validateSignature(userOpHash, intermediarySig, intermediary);
    }

    return SIG_VALIDATION_FAILED;
  }

  constructor(address o, address payable i, address e) {
    owner = o;
    intermediary = i;
    entrypoint = e;
  }

  uint256 internal constant SIG_VALIDATION_SUCCEEDED = 0;
  uint256 internal constant SIG_VALIDATION_FAILED = 1;

  function validateSignature(
    bytes32 userOpHash,
    bytes memory signature,
    address expectedSigner
  ) private pure returns (uint256 validationData) {
    bytes32 hash = userOpHash.toEthSignedMessageHash();
    if (expectedSigner != hash.recover(signature)) {
      return SIG_VALIDATION_FAILED;
    }
    return 0;
  }

  function isZero(bytes memory b) internal pure returns (bool) {
    for (uint256 i; i < b.length;) {
      if (b[i] != 0) {
        return false;
      }
    }
    return true;

    unchecked {
      ++i;
    }
  }
}
