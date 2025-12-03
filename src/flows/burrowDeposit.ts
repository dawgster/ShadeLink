import { config } from "../config";
import { BurrowDepositMetadata, ValidatedIntent } from "../queue/types";
import {
  BURROW_CONTRACT,
  getAssetsPagedDetailed,
} from "../utils/burrow";
import {
  createIntentSigningMessage,
  validateIntentSignature,
} from "../utils/nearSignature";
import {
  serializeTransaction,
  getAccessKeyInfo,
  broadcastTransaction,
  createSignedTransaction,
  NearAction,
} from "../utils/nearTransaction";
import {
  deriveNearImplicitAccount,
  NEAR_DEFAULT_PATH,
} from "../utils/chainSignature";
import { requestSignature } from "@neardefi/shade-agent-js";
import { utils } from "chainsig.js";

const { uint8ArrayToHex } = utils.cryptography;

// Gas amounts (in yoctoNEAR)
const GAS_FOR_FT_TRANSFER_CALL = "100000000000000"; // 100 TGas
const ONE_YOCTO = "1";

interface BurrowDepositResult {
  txId: string;
  intentsDepositAddress?: string;
  swappedAmount?: string;
}

export function isBurrowDepositIntent(
  intent: ValidatedIntent,
): intent is ValidatedIntent & { metadata: BurrowDepositMetadata } {
  const meta = intent.metadata as BurrowDepositMetadata | undefined;
  return meta?.action === "burrow-deposit" && !!meta.tokenId;
}

function verifyUserAuthorization(intent: ValidatedIntent): void {
  if (!intent.nearPublicKey) {
    throw new Error("Burrow deposit requires nearPublicKey to identify the user");
  }

  if (!intent.userSignature) {
    throw new Error("Burrow deposit requires userSignature for authorization");
  }

  const expectedMessage = createIntentSigningMessage(intent);

  const result = validateIntentSignature(
    intent.userSignature,
    intent.nearPublicKey,
    expectedMessage,
  );

  if (!result.isValid) {
    throw new Error(`Authorization failed: ${result.error}`);
  }
}

export async function executeBurrowDepositFlow(
  intent: ValidatedIntent,
): Promise<BurrowDepositResult> {
  verifyUserAuthorization(intent);

  const meta = intent.metadata as BurrowDepositMetadata;

  if (config.dryRunSwaps) {
    const result: BurrowDepositResult = { txId: `dry-run-burrow-deposit-${intent.intentId}` };
    if (meta.useIntents) {
      result.intentsDepositAddress = "dry-run-deposit-address";
      result.swappedAmount = intent.sourceAmount;
    }
    return result;
  }

  // Derive the NEAR implicit account from the user's public key
  // This ensures the user retains ownership of their assets
  const { accountId: nearAccountId, publicKey: derivedPublicKey } = await deriveNearImplicitAccount(
    NEAR_DEFAULT_PATH,
    intent.nearPublicKey,
  );

  console.log(`[burrowDeposit] Using derived NEAR account: ${nearAccountId}`);

  let depositAmount = intent.sourceAmount;
  let intentsDepositAddress: string | undefined;

  // TODO: Implement intents cross-chain swap if meta.useIntents is true
  // Similar to Kamino, we would:
  // 1. Get intents quote for swapping source asset to NEAR token
  // 2. Wait for the swap to complete
  // 3. Use the received amount for the deposit

  // Verify the token can be deposited
  const assets = await getAssetsPagedDetailed();
  const asset = assets.find((a) => a.token_id === meta.tokenId);

  if (!asset) {
    throw new Error(`Token ${meta.tokenId} is not supported by Burrow`);
  }

  if (!asset.config.can_deposit) {
    throw new Error(`Token ${meta.tokenId} cannot be deposited to Burrow`);
  }

  if (meta.isCollateral && !asset.config.can_use_as_collateral) {
    throw new Error(`Token ${meta.tokenId} cannot be used as collateral`);
  }

  // Get extra decimals for amount adjustment
  const extraDecimals = asset.config.extra_decimals;

  // Build the deposit transaction
  // For Burrow deposits, we call ft_transfer_call on the token contract
  // with a message specifying the action

  let msg: string;
  if (meta.isCollateral) {
    // Deposit as collateral
    const maxAmount = (BigInt(depositAmount) * BigInt(10 ** extraDecimals)).toString();
    msg = JSON.stringify({
      Execute: {
        actions: [
          {
            IncreaseCollateral: {
              token_id: meta.tokenId,
              max_amount: maxAmount,
            },
          },
        ],
      },
    });
  } else {
    // Regular deposit (supply)
    msg = JSON.stringify({
      Execute: {
        actions: [
          {
            Deposit: {},
          },
        ],
      },
    });
  }

  const actions: NearAction[] = [
    {
      type: "FunctionCall",
      methodName: "ft_transfer_call",
      args: JSON.stringify({
        receiver_id: BURROW_CONTRACT,
        amount: depositAmount,
        msg,
      }),
      gas: GAS_FOR_FT_TRANSFER_CALL,
      deposit: ONE_YOCTO,
    },
  ];

  // Get access key info for the derived account
  const accessKeyInfo = await getAccessKeyInfo(nearAccountId, derivedPublicKey);

  // Serialize the transaction using derived account and public key
  const serializedTx = serializeTransaction({
    signerId: nearAccountId,
    publicKey: derivedPublicKey,
    nonce: accessKeyInfo.nonce + 1,
    receiverId: meta.tokenId, // Token contract is the receiver
    blockHash: accessKeyInfo.block_hash,
    actions,
  });

  // Sign the transaction using NEAR chain signatures
  // Use the same derivation path that was used to derive the account
  const derivationPath = `${NEAR_DEFAULT_PATH},${intent.nearPublicKey}`;
  const signRes = await requestSignature({
    path: derivationPath,
    payload: uint8ArrayToHex(serializedTx),
    keyType: "Eddsa",
  });

  if (!signRes.signature) {
    throw new Error("Failed to get signature from chain signatures");
  }

  // Parse the signature
  const signature = parseSignatureResponse(signRes.signature);

  // Create signed transaction
  const signedTxBase64 = createSignedTransaction(serializedTx, signature);

  // Broadcast the transaction
  const { txHash } = await broadcastTransaction(signedTxBase64);

  console.log(`[burrowDeposit] Deposit tx confirmed: ${txHash}`);

  return {
    txId: txHash,
    intentsDepositAddress,
    swappedAmount: depositAmount,
  };
}

function parseSignatureResponse(sigResponse: string | { r: string; s: string }): Uint8Array {
  if (typeof sigResponse === "string") {
    // Hex or base64 encoded
    if (sigResponse.startsWith("0x")) {
      return Buffer.from(sigResponse.slice(2), "hex");
    }
    // Try hex first, then base64
    try {
      const hexBytes = Buffer.from(sigResponse, "hex");
      if (hexBytes.length === 64) return hexBytes;
    } catch {}
    return Buffer.from(sigResponse, "base64");
  }

  // r + s format
  const r = Buffer.from(sigResponse.r, "hex");
  const s = Buffer.from(sigResponse.s, "hex");
  const signature = new Uint8Array(64);
  signature.set(r, 0);
  signature.set(s, 32);
  return signature;
}
