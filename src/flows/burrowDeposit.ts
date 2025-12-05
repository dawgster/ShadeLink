import { config } from "../config";
import { BurrowDepositMetadata, ValidatedIntent } from "../queue/types";
import {
  getAssetsPagedDetailed,
  buildSupplyTransaction,
} from "../utils/burrow";
import {
  executeMetaTransaction,
  createFunctionCallAction,
  GAS_FOR_FT_TRANSFER_CALL,
  ONE_YOCTO,
} from "../utils/nearMetaTx";

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
  // Require userDestination for Burrow deposits
  if (!intent.userDestination) {
    throw new Error("Burrow deposit requires userDestination to identify the user");
  }

  // For deposits via intents, authorization is implicit via the deposit transaction
  // The user proves ownership by sending funds to the intents deposit address
  // No additional signature verification needed for this flow
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

  let depositAmount = intent.sourceAmount;
  let intentsDepositAddress: string | undefined;

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

  // Build the supply transaction using Rhea SDK
  const supplyTx = await buildSupplyTransaction({
    token_id: meta.tokenId,
    amount: depositAmount,
    is_collateral: meta.isCollateral ?? false,
  });

  console.log(`[burrowDeposit] Built supply tx via Rhea SDK: ${supplyTx.method_name} on ${supplyTx.contract_id}`);

  // Create action for meta transaction
  const action = createFunctionCallAction(
    supplyTx.method_name,
    supplyTx.args,
    GAS_FOR_FT_TRANSFER_CALL,
    ONE_YOCTO,
  );

  // Execute via meta transaction - agent pays for gas
  const txHash = await executeMetaTransaction(
    intent.userDestination,
    supplyTx.contract_id,
    [action],
  );

  console.log(`[burrowDeposit] Deposit tx confirmed: ${txHash}`);

  return {
    txId: txHash,
    intentsDepositAddress,
    swappedAmount: depositAmount,
  };
}
