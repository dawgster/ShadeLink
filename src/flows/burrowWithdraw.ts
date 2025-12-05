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
  executeMetaTransaction,
  createFunctionCallAction,
  GAS_FOR_FT_TRANSFER_CALL,
  ZERO_DEPOSIT,
  ONE_YOCTO,
} from "../utils/nearMetaTx";
import {
  OneClickService,
  OpenAPI,
} from "@defuse-protocol/one-click-sdk-typescript";
import { getDefuseAssetId } from "../utils/tokenMappings";

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

  if (!intent.userDestination) {
    throw new Error("Burrow withdraw requires userDestination for custody isolation");
  }

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

  // Create action for meta transaction
  const action = createFunctionCallAction(
    withdrawTx.method_name,
    withdrawTx.args,
    GAS_FOR_FT_TRANSFER_CALL,
    ZERO_DEPOSIT,
  );

  // Execute via meta transaction - agent pays for gas
  const txHash = await executeMetaTransaction(
    intent.userDestination,
    withdrawTx.contract_id,
    [action],
  );

  console.log(`[burrowWithdraw] Withdraw tx confirmed: ${txHash}`);

  // If bridgeBack is configured, send withdrawn tokens to intents for cross-chain swap
  if (meta.bridgeBack) {
    const bridgeResult = await executeBridgeBack(intent, meta);
    return {
      txId: txHash,
      bridgeTxId: bridgeResult.txId,
      intentsDepositAddress: bridgeResult.depositAddress,
    };
  }

  return { txId: txHash };
}

interface BridgeBackResult {
  txId: string;
  depositAddress: string;
}

/**
 * After withdrawing from Burrow, bridges the withdrawn tokens back to the user's
 * destination chain via NEAR intents.
 *
 * Flow:
 * 1. Request a quote from intents with dry: false to get the deposit address
 * 2. Build ft_transfer_call to send tokens to intents deposit address
 * 3. Execute via meta transaction
 * 4. Intents handles the cross-chain swap from there
 */
async function executeBridgeBack(
  intent: ValidatedIntent,
  meta: BurrowWithdrawMetadata,
): Promise<BridgeBackResult> {
  if (!meta.bridgeBack) {
    throw new Error("bridgeBack configuration missing");
  }

  const { destinationChain, destinationAddress, destinationAsset, slippageTolerance } = meta.bridgeBack;
  const tokenId = meta.tokenId;
  const withdrawnAmount = intent.sourceAmount;

  console.log(`[burrowWithdraw] Starting bridge back to ${destinationChain}`, {
    destinationAddress,
    destinationAsset,
    amount: withdrawnAmount,
    tokenId,
  });

  // Step 1: Get intents quote with dry: false to get deposit address
  if (config.intentsQuoteUrl) {
    OpenAPI.BASE = config.intentsQuoteUrl;
  }

  // Convert NEAR token ID to Defuse asset ID
  const originAsset = getDefuseAssetId("near", tokenId) || `nep141:${tokenId}`;

  // Create deadline 30 minutes from now
  const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const quoteRequest = {
    originAsset,
    destinationAsset, // Caller provides this in Defuse format
    amount: String(withdrawnAmount),
    swapType: "EXACT_INPUT" as const,
    slippageTolerance: slippageTolerance ?? 300, // Default 3%
    dry: false, // Important: we need the deposit address
    recipient: destinationAddress,
    recipientType: "DESTINATION_CHAIN" as const,
    refundTo: intent.refundAddress || intent.userDestination,
    refundType: "ORIGIN_CHAIN" as const,
    depositType: "ORIGIN_CHAIN" as const,
    deadline,
  };

  console.log("[burrowWithdraw] Requesting intents quote", quoteRequest);

  const quoteResponse = await OneClickService.getQuote(quoteRequest as any);

  // Extract deposit address from the quote response
  const depositAddress = (quoteResponse as any).depositAddress;
  if (!depositAddress) {
    throw new Error("Intents quote response missing depositAddress");
  }

  console.log(`[burrowWithdraw] Got intents deposit address: ${depositAddress}`);

  // Step 2: Build ft_transfer_call to send tokens to intents deposit address
  // For NEP-141 tokens, we use ft_transfer_call with a message
  const ftTransferAction = createFunctionCallAction(
    "ft_transfer_call",
    {
      receiver_id: depositAddress,
      amount: withdrawnAmount,
      msg: "", // Empty message for simple transfer
    },
    GAS_FOR_FT_TRANSFER_CALL,
    ONE_YOCTO, // NEP-141 requires 1 yoctoNEAR deposit
  );

  // Execute via meta transaction - agent pays for gas
  const bridgeTxHash = await executeMetaTransaction(
    intent.userDestination!,
    tokenId, // The token contract
    [ftTransferAction],
  );

  console.log(`[burrowWithdraw] Bridge transfer tx confirmed: ${bridgeTxHash}`);

  return { txId: bridgeTxHash, depositAddress };
}
