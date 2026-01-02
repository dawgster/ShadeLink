import { chainAdapters, contracts } from "chainsig.js";
import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { config } from "../config";

export const SOLANA_DEFAULT_PATH = "solana-1";

const chainSignatureContract = new contracts.ChainSignatureContract({
  networkId: config.chainSignatureNetwork as "mainnet" | "testnet",
  contractId: config.chainSignatureContractId,
  // Provided by backend even though typings omit it
  masterPublicKey: config.chainSignatureMpcKey,
  fallbackRpcUrls: config.nearRpcUrls,
} as any);

const solanaConnection = new Connection(config.solRpcUrl, "confirmed");

export const SolanaAdapter = new chainAdapters.solana.Solana({
  solanaConnection,
  contract: chainSignatureContract,
}) as any;

export function getSolanaConnection() {
  return solanaConnection;
}

export async function deriveAgentPublicKey(
  path = SOLANA_DEFAULT_PATH,
  userDestination?: string,
) {
  const accountId = config.shadeContractId;
  if (!accountId) throw new Error("NEXT_PUBLIC_contractId not configured");

  // Build derivation path including user destination for custody isolation
  // Each unique userDestination gets their own derived agent account
  let derivationPath = path;
  if (userDestination) {
    derivationPath = `${derivationPath},${userDestination}`;
  }

  const { publicKey } = await SolanaAdapter.deriveAddressAndPublicKey(
    accountId,
    derivationPath,
  );
  return new PublicKey(publicKey as string);
}

export function attachSignatureToVersionedTx(
  tx: VersionedTransaction,
  signature: Uint8Array,
): VersionedTransaction {
  const signatures = tx.signatures.length
    ? tx.signatures
    : Array(tx.message.header.numRequiredSignatures).fill(
        new Uint8Array(64),
      );
  signatures[0] = signature;
  const signed = new VersionedTransaction(tx.message, signatures);
  return signed;
}

/**
 * Attach multiple signatures to a versioned transaction at specified indices.
 * Used when a transaction requires multiple signers (e.g., fee payer + token owner).
 * @param tx - The transaction to sign
 * @param signaturePairs - Array of {signature, index} pairs matching signer order in the message
 */
export function attachMultipleSignaturesToVersionedTx(
  tx: VersionedTransaction,
  signaturePairs: Array<{ signature: Uint8Array; index: number }>,
): VersionedTransaction {
  const signatures = tx.signatures.length
    ? [...tx.signatures]
    : Array(tx.message.header.numRequiredSignatures).fill(
        new Uint8Array(64),
      );

  for (const { signature, index } of signaturePairs) {
    signatures[index] = signature;
  }

  return new VersionedTransaction(tx.message, signatures);
}

export async function broadcastSolanaTx(tx: VersionedTransaction, skipConfirmation = false) {
  const connection = getSolanaConnection();
  const sig = await connection.sendRawTransaction(tx.serialize());

  if (!skipConfirmation) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const confirmation = await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
  }

  return sig;
}

// ─── High-Level Transaction Helpers ─────────────────────────────────────────────

// Import here to avoid circular dependency at module load
import { signWithNearChainSignatures } from "./chainSignature";

/**
 * Sign and broadcast a Solana transaction with a single signer.
 * Used for flows where only the user agent signs (e.g., Jupiter swap).
 *
 * @param transaction - The versioned transaction to sign and broadcast
 * @param userDestination - The user's destination address for key derivation
 * @returns Transaction signature (txId)
 */
export async function signAndBroadcastSingleSigner(
  transaction: VersionedTransaction,
  userDestination: string,
): Promise<string> {
  const signature = await signWithNearChainSignatures(
    transaction.message.serialize(),
    userDestination,
  );
  const finalized = attachSignatureToVersionedTx(transaction, signature);
  return broadcastSolanaTx(finalized);
}

/**
 * Sign and broadcast a Solana transaction with dual signers (fee payer + user agent).
 * Used for flows where both the base agent pays fees and user agent owns tokens.
 *
 * @param transaction - The versioned transaction to sign and broadcast
 * @param serializedMessage - The serialized message bytes to sign
 * @param userDestination - The user's destination address for key derivation
 * @returns Transaction signature (txId)
 */
export async function signAndBroadcastDualSigner(
  transaction: VersionedTransaction,
  serializedMessage: Uint8Array,
  userDestination: string,
): Promise<string> {
  const feePayerSignature = await signWithNearChainSignatures(
    serializedMessage,
    undefined, // base agent path
  );
  const userAgentSignature = await signWithNearChainSignatures(
    serializedMessage,
    userDestination,
  );

  const finalized = attachMultipleSignaturesToVersionedTx(transaction, [
    { signature: feePayerSignature, index: 0 },
    { signature: userAgentSignature, index: 1 },
  ]);

  return broadcastSolanaTx(finalized);
}
