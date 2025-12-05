import {
  createSolanaRpc,
  address,
  pipe,
  createTransactionMessage,
  appendTransactionMessageInstructions,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  compileTransaction,
  Address,
  IInstruction,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  KaminoAction,
  KaminoMarket,
  PROGRAM_ID,
  VanillaObligation,
} from "@kamino-finance/klend-sdk";
import BN from "bn.js";
import { config } from "../config";
import { KaminoDepositMetadata, ValidatedIntent } from "../queue/types";
import {
  deriveAgentPublicKey,
  SOLANA_DEFAULT_PATH,
} from "../utils/solana";
import {
  signWithNearChainSignatures,
  createDummySigner,
} from "../utils/chainSignature";

interface KaminoDepositResult {
  txId: string;
  /** If intents was used, contains the deposit address used */
  intentsDepositAddress?: string;
  /** Amount received after intents swap (before Kamino deposit) */
  swappedAmount?: string;
}

export function isKaminoDepositIntent(
  intent: ValidatedIntent,
): intent is ValidatedIntent & { metadata: KaminoDepositMetadata } {
  const meta = intent.metadata as KaminoDepositMetadata | undefined;
  return meta?.action === "kamino-deposit" && !!meta.marketAddress && !!meta.mintAddress;
}

function createKaminoRpc() {
  return createSolanaRpc(config.solRpcUrl);
}

/**
 * Verifies that the intent has valid authorization
 * For deposits, the authorization is the deposit transaction itself
 * (the user sending funds to the intents deposit address)
 */
function verifyUserAuthorization(intent: ValidatedIntent): void {
  // Require userDestination for Kamino deposits
  if (!intent.userDestination) {
    throw new Error("Kamino deposit requires userDestination to identify the user");
  }

  // For deposits, authorization is implicit via the deposit transaction
  // The user proves ownership by sending funds from their wallet
  // No additional signature verification needed
}

export async function executeKaminoDepositFlow(
  intent: ValidatedIntent,
): Promise<KaminoDepositResult> {
  // Verify user authorization via signature
  verifyUserAuthorization(intent);

  const meta = intent.metadata as KaminoDepositMetadata;

  // Log all addresses involved in this flow
  console.log(`[kaminoDeposit] === ADDRESS DEBUG INFO ===`);
  console.log(`[kaminoDeposit] User destination address (NEAR): ${intent.userDestination}`);
  console.log(`[kaminoDeposit] Agent destination (from intent): ${intent.agentDestination}`);
  console.log(`[kaminoDeposit] Intents deposit address (first leg sent here): ${intent.intentsDepositAddress}`);
  if (config.dryRunSwaps) {
    console.log(`[kaminoDeposit] DRY RUN MODE ENABLED - will build tx but not submit`);
  }

  // Get the agent's Solana address with userDestination in path for custody isolation
  const agentPublicKey = await deriveAgentPublicKey(
    SOLANA_DEFAULT_PATH,
    intent.userDestination,
  );
  const agentSolanaAddress = agentPublicKey.toBase58();

  console.log(`[kaminoDeposit] Derived Solana address (user agent): ${agentSolanaAddress}`);

  // Use intermediateAmount if available (set by quote route after intents swap)
  // Otherwise fall back to sourceAmount for direct deposits
  let depositAmount = intent.intermediateAmount || intent.sourceAmount;

  console.log(`[kaminoDeposit] Executing Kamino deposit for amount: ${depositAmount}`);

  // Execute the Kamino deposit with the received tokens
  console.log(`[kaminoDeposit] Building Kamino deposit transaction for amount: ${depositAmount}`);

  const { compiledTx, serializedMessage, feePayerAddress, userAgentAddress } = await buildKaminoDepositTransaction(
    intent,
    depositAmount,
  );

  // In dry run mode, skip signing and sending the transaction
  if (config.dryRunSwaps) {
    console.log(`[kaminoDeposit] === DRY RUN MODE - SKIPPING TRANSACTION ===`);
    console.log(`[kaminoDeposit] Would sign with fee payer: ${feePayerAddress}`);
    console.log(`[kaminoDeposit] Would sign with user agent: ${userAgentAddress}`);
    console.log(`[kaminoDeposit] Transaction message bytes: ${serializedMessage.length} bytes`);
    console.log(`[kaminoDeposit] Dry run complete - no transaction submitted`);

    return {
      txId: `dry-run-kamino-${intent.intentId}`,
      intentsDepositAddress: intent.intentsDepositAddress,
      swappedAmount: depositAmount,
    };
  }

  // Transaction requires two signatures:
  // 1. Base agent (fee payer) - pays for gas
  // 2. User-specific derived account (token owner) - holds USDC/tokens

  // Sign with base agent (fee payer)
  const feePayerSignature = await signWithNearChainSignatures(
    serializedMessage,
    undefined, // base agent path
  );

  // Sign with user-specific derived account (token owner)
  const userAgentSignature = await signWithNearChainSignatures(
    serializedMessage,
    intent.userDestination,
  );

  // Add signatures to the compiled transaction
  const signedTx = {
    ...compiledTx,
    signatures: {
      ...compiledTx.signatures,
      [feePayerAddress]: feePayerSignature,
      [userAgentAddress]: userAgentSignature,
    },
  };

  // Send the transaction using @solana/kit
  const rpc = createKaminoRpc();
  const txId = await sendSignedTransaction(rpc, signedTx);

  console.log(`[kaminoDeposit] Kamino deposit confirmed: ${txId}`);

  return {
    txId,
    intentsDepositAddress: intent.intentsDepositAddress,
    swappedAmount: depositAmount,
  };
}

interface CompiledTransaction {
  messageBytes: Uint8Array;
  signatures: Record<Address, Uint8Array>;
}

interface BuildTxResult {
  compiledTx: CompiledTransaction;
  serializedMessage: Uint8Array;
  feePayerAddress: Address;
  userAgentAddress: Address;
}

/**
 * Send a signed transaction to the Solana network.
 * Handles serialization in the Solana wire format.
 */
async function sendSignedTransaction(
  rpc: ReturnType<typeof createSolanaRpc>,
  signedTx: CompiledTransaction,
): Promise<string> {
  // Serialize to wire format: [num_signatures (1 byte)] + [signatures (64 bytes each)] + [message]
  const signatureAddresses = Object.keys(signedTx.signatures) as Address[];
  const numSignatures = signatureAddresses.length;
  const totalSignatureBytes = numSignatures * 64;
  const serialized = new Uint8Array(1 + totalSignatureBytes + signedTx.messageBytes.length);

  serialized[0] = numSignatures;
  let offset = 1;
  for (const addr of signatureAddresses) {
    serialized.set(signedTx.signatures[addr], offset);
    offset += 64;
  }
  serialized.set(signedTx.messageBytes, offset);

  // Send via RPC
  const base64Tx = Buffer.from(serialized).toString("base64");
  const signature = await rpc.sendTransaction(base64Tx as any, {
    encoding: "base64",
    skipPreflight: false,
    preflightCommitment: "confirmed",
  }).send();

  // Wait for confirmation
  const { value: statuses } = await rpc.getSignatureStatuses([signature]).send();
  if (statuses[0]?.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(statuses[0].err)}`);
  }

  return signature;
}

async function buildKaminoDepositTransaction(
  intent: ValidatedIntent,
  depositAmount: string,
): Promise<BuildTxResult> {
  const rpc = createKaminoRpc();
  const meta = intent.metadata as KaminoDepositMetadata;

  // Base agent pays for transaction fees (has SOL)
  const feePayerPublicKey = await deriveAgentPublicKey(SOLANA_DEFAULT_PATH);
  const feePayerAddress = address(feePayerPublicKey.toBase58());

  // User-specific derived account holds tokens for custody isolation
  const userAgentPublicKey = await deriveAgentPublicKey(
    SOLANA_DEFAULT_PATH,
    intent.userDestination,
  );
  const userAgentAddress = address(userAgentPublicKey.toBase58());

  console.log(`[kaminoDeposit] === BUILD TX ADDRESS INFO ===`);
  console.log(`[kaminoDeposit] Fee payer address (base agent): ${feePayerAddress}`);
  console.log(`[kaminoDeposit] User agent address (token owner): ${userAgentAddress}`);
  console.log(`[kaminoDeposit] Kamino market address: ${meta.marketAddress}`);
  console.log(`[kaminoDeposit] Kamino mint address: ${meta.mintAddress}`);

  // Create a dummy signer for the fee payer - the Kamino SDK needs a signer object
  // but we'll sign externally via NEAR chain signatures
  const feePayerSigner = createDummySigner(feePayerAddress);

  // Create a dummy signer for the token owner (user agent)
  const userAgentSigner = createDummySigner(userAgentAddress);

  const market = await KaminoMarket.load(
    rpc,
    address(meta.marketAddress),
    1000, // recentSlotDurationMs
    PROGRAM_ID,
  );
  if (!market) {
    throw new Error(`Failed to load Kamino market: ${meta.marketAddress}`);
  }

  const reserve = market.getReserveByMint(address(meta.mintAddress));
  if (!reserve) {
    throw new Error(`Reserve not found for mint: ${meta.mintAddress}`);
  }

  const amount = new BN(depositAmount);

  const depositAction = await KaminoAction.buildDepositTxns(
    market,
    amount,
    reserve.getLiquidityMint(),
    userAgentSigner,  // The signer that owns the tokens
    new VanillaObligation(PROGRAM_ID),
    false,  // useV2Ixs
    undefined,  // scopeRefreshConfig
    300_000,  // extraComputeBudget
    true,  // includeAtaIxs
    false,  // requestElevationGroup
    { skipInitialization: false, skipLutCreation: true },  // Skip LUT but allow user metadata init
  );

  // User agent needs SOL for rent:
  // - User metadata: ~0.008 SOL
  // - Obligation: ~0.024 SOL
  // - Farms user account: ~0.0073 SOL
  // - Buffer for other accounts: ~0.005 SOL
  // Check current balance and only transfer what's needed
  const MIN_RENT_LAMPORTS = 45_000_000n; // 0.045 SOL minimum needed for rent
  const { value: userAgentBalance } = await rpc.getBalance(userAgentAddress).send();

  const kaminoInstructions = [
    ...(depositAction.computeBudgetIxs || []),
    ...(depositAction.setupIxs || []),
    ...(depositAction.lendingIxs || []),
    ...(depositAction.cleanupIxs || []),
  ].filter((ix) => ix != null);

  const instructions: IInstruction[] = [];

  // Only add transfer if user agent needs more SOL
  if (userAgentBalance < MIN_RENT_LAMPORTS) {
    const amountNeeded = MIN_RENT_LAMPORTS - userAgentBalance;
    console.log(`[kaminoDeposit] === SPONSORED FUNDS TRANSFER ===`);
    console.log(`[kaminoDeposit] Transferring sponsored SOL from: ${feePayerAddress}`);
    console.log(`[kaminoDeposit] Transferring sponsored SOL to: ${userAgentAddress}`);
    console.log(`[kaminoDeposit] User agent current balance: ${userAgentBalance} lamports`);
    console.log(`[kaminoDeposit] Minimum required: ${MIN_RENT_LAMPORTS} lamports`);
    console.log(`[kaminoDeposit] Amount being transferred: ${amountNeeded} lamports`);

    const fundUserAgentIx = getTransferSolInstruction({
      source: feePayerSigner,
      destination: userAgentAddress,
      amount: amountNeeded,
    });
    instructions.push(fundUserAgentIx);
  } else {
    console.log(`[kaminoDeposit] User agent has sufficient SOL: ${userAgentBalance} lamports, no sponsored transfer needed`);
  }

  instructions.push(...kaminoInstructions);

  console.log(`[kaminoDeposit] Got ${instructions.length} instructions from Kamino SDK`);

  // Fetch blockhash for transaction lifetime
  const { value: blockhash } = await rpc.getLatestBlockhash().send();

  // Build transaction message using @solana/kit pipe pattern
  const txMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
    (tx) => setTransactionMessageFeePayerSigner(feePayerSigner, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
  );

  // Compile the transaction (without signing - we'll sign externally)
  const rawCompiledTx = compileTransaction(txMessage);

  // Convert to our simplified type (avoiding @solana/kit nominal types)
  // Filter out null signatures and convert to Uint8Array
  const compiledTx: CompiledTransaction = {
    messageBytes: new Uint8Array(rawCompiledTx.messageBytes),
    signatures: Object.fromEntries(
      Object.entries(rawCompiledTx.signatures)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, new Uint8Array(v!)])
    ) as Record<Address, Uint8Array>,
  };

  // The message bytes are what we need to sign
  const serializedMessage = compiledTx.messageBytes;

  return {
    compiledTx,
    serializedMessage,
    feePayerAddress,
    userAgentAddress,
  };
}
