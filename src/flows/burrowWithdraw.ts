import { config } from "../config";
import { BurrowWithdrawMetadata, ValidatedIntent } from "../queue/types";
import {
  getAssetsPagedDetailed,
  buildWithdrawTransaction,
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

// Gas amounts
const GAS_FOR_EXECUTE = "100000000000000"; // 100 TGas
const ZERO_DEPOSIT = "0";

interface BurrowWithdrawResult {
  txId: string;
  bridgeTxId?: string;
  intentsDepositAddress?: string;
}

export function isBurrowWithdrawIntent(
  intent: ValidatedIntent,
): intent is ValidatedIntent & { metadata: BurrowWithdrawMetadata } {
  const meta = intent.metadata as BurrowWithdrawMetadata | undefined;
  return meta?.action === "burrow-withdraw" && !!meta.tokenId;
}

function verifyUserAuthorization(intent: ValidatedIntent): void {
  if (!intent.nearPublicKey) {
    throw new Error("Burrow withdraw requires nearPublicKey to identify the user");
  }

  if (!intent.userSignature) {
    throw new Error("Burrow withdraw requires userSignature for authorization");
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

export async function executeBurrowWithdrawFlow(
  intent: ValidatedIntent,
): Promise<BurrowWithdrawResult> {
  verifyUserAuthorization(intent);

  const meta = intent.metadata as BurrowWithdrawMetadata;

  if (config.dryRunSwaps) {
    const result: BurrowWithdrawResult = { txId: `dry-run-burrow-withdraw-${intent.intentId}` };
    if (meta.bridgeBack) {
      result.bridgeTxId = `dry-run-bridge-${intent.intentId}`;
      result.intentsDepositAddress = "dry-run-deposit-address";
    }
    return result;
  }

  // Derive the NEAR implicit account from the user's public key
  // This ensures the user retains ownership of their assets
  const { accountId: nearAccountId, publicKey: derivedPublicKey } = await deriveNearImplicitAccount(
    NEAR_DEFAULT_PATH,
    intent.nearPublicKey,
  );

  console.log(`[burrowWithdraw] Using derived NEAR account: ${nearAccountId}`);

  // Verify the token can be withdrawn
  const assets = await getAssetsPagedDetailed();
  const asset = assets.find((a) => a.token_id === meta.tokenId);

  if (!asset) {
    throw new Error(`Token ${meta.tokenId} is not supported by Burrow`);
  }

  if (!asset.config.can_withdraw) {
    throw new Error(`Token ${meta.tokenId} cannot be withdrawn from Burrow`);
  }

  const withdrawAmount = intent.sourceAmount;

  // Build the withdraw transaction using Rhea SDK
  const withdrawTx = await buildWithdrawTransaction({
    token_id: meta.tokenId,
    amount: withdrawAmount,
  });

  console.log(`[burrowWithdraw] Built withdraw tx via Rhea SDK: ${withdrawTx.method_name} on ${withdrawTx.contract_id}`);

  const txActions: NearAction[] = [
    {
      type: "FunctionCall",
      methodName: withdrawTx.method_name,
      args: JSON.stringify(withdrawTx.args),
      gas: GAS_FOR_EXECUTE,
      deposit: ZERO_DEPOSIT,
    },
  ];

  // Get access key info for the derived account
  const accessKeyInfo = await getAccessKeyInfo(nearAccountId, derivedPublicKey);

  // Serialize transaction using derived account and public key
  const serializedTx = serializeTransaction({
    signerId: nearAccountId,
    publicKey: derivedPublicKey,
    nonce: accessKeyInfo.nonce + 1,
    receiverId: withdrawTx.contract_id, // Burrow contract from SDK response
    blockHash: accessKeyInfo.block_hash,
    actions: txActions,
  });

  // Sign with chain signatures using the same derivation path
  const derivationPath = `${NEAR_DEFAULT_PATH},${intent.nearPublicKey}`;
  const signRes = await requestSignature({
    path: derivationPath,
    payload: uint8ArrayToHex(serializedTx),
    keyType: "Eddsa",
  });

  if (!signRes.signature) {
    throw new Error("Failed to get signature from chain signatures");
  }

  const signature = parseSignatureResponse(signRes.signature);
  const signedTxBase64 = createSignedTransaction(serializedTx, signature);

  const { txHash } = await broadcastTransaction(signedTxBase64);

  console.log(`[burrowWithdraw] Withdraw tx confirmed: ${txHash}`);

  // TODO: Implement bridgeBack if configured
  // Similar to Kamino, would:
  // 1. Get intents quote for bridging to destination chain
  // 2. Call ft_transfer_call to send tokens to intents deposit address
  // 3. Return bridge tx hash

  return { txId: txHash };
}

function parseSignatureResponse(sigResponse: string | { r: string; s: string }): Uint8Array {
  if (typeof sigResponse === "string") {
    if (sigResponse.startsWith("0x")) {
      return Buffer.from(sigResponse.slice(2), "hex");
    }
    try {
      const hexBytes = Buffer.from(sigResponse, "hex");
      if (hexBytes.length === 64) return hexBytes;
    } catch {}
    return Buffer.from(sigResponse, "base64");
  }

  const r = Buffer.from(sigResponse.r, "hex");
  const s = Buffer.from(sigResponse.s, "hex");
  const signature = new Uint8Array(64);
  signature.set(r, 0);
  signature.set(s, 32);
  return signature;
}
