// @ts-nocheck
// Permission routes temporarily disabled - see src/index.ts
/**
 * Permission API routes for managing self-custodial operations
 *
 * These endpoints allow users to:
 * - Register wallets for derivation paths
 * - Add/remove allowed operations with signatures
 * - Query permissions and operations
 */

import { Hono } from "hono";
import {
  getPermissions,
  getOperation,
  getActiveOperations,
  isOperationAllowed,
  getDerivationPathForWallet,
  registerWallet,
  addAllowedOperation,
  removeAllowedOperation,
  createLimitOrderOperation,
  createStopLossOperation,
  createTakeProfitOperation,
  createSwapOperation,
  parseWalletType,
  getPermissionContractId,
  type RegisterWalletArgs,
  type AddAllowedOperationArgs,
  type RemoveAllowedOperationArgs,
  type AllowedOperationInput,
} from "../permission";
import { verifySolanaSignature } from "../utils/solanaSignature";

const app = new Hono();

// ─── Query Endpoints ────────────────────────────────────────────────────────────

/**
 * GET /api/permission/contract
 * Get the permission contract ID
 */
app.get("/contract", (c) => {
  return c.json({ contractId: getPermissionContractId() });
});

/**
 * GET /api/permission/:derivationPath
 * Get permissions for a derivation path
 */
app.get("/:derivationPath", async (c) => {
  const derivationPath = c.req.param("derivationPath");

  try {
    const permissions = await getPermissions(derivationPath);
    if (!permissions) {
      return c.json({ error: "No permissions found for derivation path" }, 404);
    }
    return c.json(permissions);
  } catch (err) {
    console.error("[permission] Error fetching permissions:", err);
    return c.json({ error: "Failed to fetch permissions" }, 500);
  }
});

/**
 * GET /api/permission/:derivationPath/:operationId
 * Get a specific operation
 */
app.get("/:derivationPath/:operationId", async (c) => {
  const derivationPath = c.req.param("derivationPath");
  const operationId = c.req.param("operationId");

  try {
    const operation = await getOperation(derivationPath, operationId);
    if (!operation) {
      return c.json({ error: "Operation not found" }, 404);
    }
    return c.json(operation);
  } catch (err) {
    console.error("[permission] Error fetching operation:", err);
    return c.json({ error: "Failed to fetch operation" }, 500);
  }
});

/**
 * GET /api/permission/active
 * Get all active operations (for TEE polling)
 */
app.get("/active", async (c) => {
  const fromIndex = parseInt(c.req.query("from") || "0", 10);
  const limit = parseInt(c.req.query("limit") || "100", 10);

  try {
    const operations = await getActiveOperations(fromIndex, limit);
    return c.json({ operations, count: operations.length });
  } catch (err) {
    console.error("[permission] Error fetching active operations:", err);
    return c.json({ error: "Failed to fetch active operations" }, 500);
  }
});

/**
 * GET /api/permission/wallet/:address
 * Get derivation path for a wallet address
 */
app.get("/wallet/:address", async (c) => {
  const address = c.req.param("address");

  try {
    const derivationPath = await getDerivationPathForWallet(address);
    if (!derivationPath) {
      return c.json({ error: "Wallet not registered" }, 404);
    }
    return c.json({ derivationPath });
  } catch (err) {
    console.error("[permission] Error looking up wallet:", err);
    return c.json({ error: "Failed to lookup wallet" }, 500);
  }
});

/**
 * GET /api/permission/check/:derivationPath/:operationId
 * Check if an operation is allowed
 */
app.get("/check/:derivationPath/:operationId", async (c) => {
  const derivationPath = c.req.param("derivationPath");
  const operationId = c.req.param("operationId");

  try {
    const allowed = await isOperationAllowed(derivationPath, operationId);
    return c.json({ allowed });
  } catch (err) {
    console.error("[permission] Error checking operation:", err);
    return c.json({ error: "Failed to check operation" }, 500);
  }
});

// ─── Change Endpoints ───────────────────────────────────────────────────────────

interface RegisterWalletRequest {
  derivationPath: string;
  walletType: string; // "near" | "solana" | "evm"
  publicKey: string; // hex or base58 encoded
  chainAddress: string;
  signature: string; // hex encoded
  message: string; // the signed message
  nonce: number;
}

/**
 * POST /api/permission/register
 * Register a wallet for a derivation path
 */
app.post("/register", async (c) => {
  let body: RegisterWalletRequest;
  try {
    body = await c.req.json<RegisterWalletRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { derivationPath, walletType, publicKey, chainAddress, signature, message, nonce } = body;

  if (!derivationPath || !walletType || !publicKey || !chainAddress || !signature || !message || nonce === undefined) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  try {
    // Verify signature based on wallet type
    const messageBytes = Buffer.from(message, "utf8");
    const signatureBytes = Buffer.from(signature.replace("0x", ""), "hex");
    const publicKeyBytes = parsePublicKey(publicKey, walletType);

    const isValid = await verifySignature(
      walletType,
      publicKeyBytes,
      messageBytes,
      signatureBytes,
      chainAddress,
    );

    if (!isValid) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    // Call contract
    const args: RegisterWalletArgs = {
      derivation_path: derivationPath,
      wallet_type: parseWalletType(walletType),
      public_key: Array.from(publicKeyBytes),
      chain_address: chainAddress,
      signature: Array.from(signatureBytes),
      message: Array.from(messageBytes),
      nonce,
    };

    const txHash = await registerWallet(args);
    return c.json({ success: true, txHash, derivationPath });
  } catch (err) {
    console.error("[permission] Error registering wallet:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: `Failed to register wallet: ${errorMessage}` }, 500);
  }
});

interface AddOperationRequest {
  derivationPath: string;
  operationType: "limit-order" | "stop-loss" | "take-profit" | "swap";
  // Common fields
  sourceAsset: string;
  targetAsset: string;
  maxAmount: string;
  destinationAddress: string;
  destinationChain: string;
  slippageBps: number;
  expiresAt?: number;
  // Price condition fields (for conditional orders)
  priceAsset?: string;
  quoteAsset?: string;
  triggerPrice?: string;
  condition?: "above" | "below";
  // Signature
  signature: string;
  message: string;
}

/**
 * POST /api/permission/operation
 * Add an allowed operation
 */
app.post("/operation", async (c) => {
  let body: AddOperationRequest;
  try {
    body = await c.req.json<AddOperationRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const {
    derivationPath,
    operationType,
    sourceAsset,
    targetAsset,
    maxAmount,
    destinationAddress,
    destinationChain,
    slippageBps,
    expiresAt,
    priceAsset,
    quoteAsset,
    triggerPrice,
    condition,
    signature,
    message,
  } = body;

  if (!derivationPath || !operationType || !sourceAsset || !targetAsset || !maxAmount ||
      !destinationAddress || !destinationChain || !signature || !message) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  try {
    // Get user's registered wallet to verify signature
    const permissions = await getPermissions(derivationPath);
    if (!permissions || permissions.owner_wallets.length === 0) {
      return c.json({ error: "No registered wallet for derivation path" }, 404);
    }

    const wallet = permissions.owner_wallets[0];
    const messageBytes = Buffer.from(message, "utf8");
    const signatureBytes = Buffer.from(signature.replace("0x", ""), "hex");

    const isValid = await verifySignature(
      walletTypeToString(wallet.wallet_type),
      new Uint8Array(wallet.public_key),
      messageBytes,
      signatureBytes,
      wallet.chain_address,
    );

    if (!isValid) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    // Build operation input
    let operation: AllowedOperationInput;
    if (operationType === "swap") {
      operation = createSwapOperation({
        sourceAsset,
        targetAsset,
        maxAmount,
        destinationAddress,
        destinationChain,
        slippageBps,
        expiresAt,
      });
    } else if (operationType === "limit-order") {
      if (!priceAsset || !quoteAsset || !triggerPrice || !condition) {
        return c.json({ error: "Missing price condition fields for limit order" }, 400);
      }
      operation = createLimitOrderOperation({
        priceAsset,
        quoteAsset,
        triggerPrice,
        condition: condition === "above" ? "Above" : "Below",
        sourceAsset,
        targetAsset,
        maxAmount,
        destinationAddress,
        destinationChain,
        slippageBps,
        expiresAt,
      });
    } else if (operationType === "stop-loss") {
      if (!priceAsset || !quoteAsset || !triggerPrice) {
        return c.json({ error: "Missing price fields for stop-loss" }, 400);
      }
      operation = createStopLossOperation({
        priceAsset,
        quoteAsset,
        triggerPrice,
        sourceAsset,
        targetAsset,
        maxAmount,
        destinationAddress,
        destinationChain,
        slippageBps,
        expiresAt,
      });
    } else if (operationType === "take-profit") {
      if (!priceAsset || !quoteAsset || !triggerPrice) {
        return c.json({ error: "Missing price fields for take-profit" }, 400);
      }
      operation = createTakeProfitOperation({
        priceAsset,
        quoteAsset,
        triggerPrice,
        sourceAsset,
        targetAsset,
        maxAmount,
        destinationAddress,
        destinationChain,
        slippageBps,
        expiresAt,
      });
    } else {
      return c.json({ error: "Unknown operation type" }, 400);
    }

    // Call contract
    const args: AddAllowedOperationArgs = {
      derivation_path: derivationPath,
      operation,
      signature: Array.from(signatureBytes),
      message: Array.from(messageBytes),
    };

    const { txHash, operationId } = await addAllowedOperation(args);
    return c.json({ success: true, txHash, operationId, derivationPath });
  } catch (err) {
    console.error("[permission] Error adding operation:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: `Failed to add operation: ${errorMessage}` }, 500);
  }
});

interface RemoveOperationRequest {
  derivationPath: string;
  operationId: string;
  signature: string;
  message: string;
}

/**
 * DELETE /api/permission/operation
 * Remove an allowed operation
 */
app.delete("/operation", async (c) => {
  let body: RemoveOperationRequest;
  try {
    body = await c.req.json<RemoveOperationRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { derivationPath, operationId, signature, message } = body;

  if (!derivationPath || !operationId || !signature || !message) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  try {
    // Get user's registered wallet to verify signature
    const permissions = await getPermissions(derivationPath);
    if (!permissions || permissions.owner_wallets.length === 0) {
      return c.json({ error: "No registered wallet for derivation path" }, 404);
    }

    const wallet = permissions.owner_wallets[0];
    const messageBytes = Buffer.from(message, "utf8");
    const signatureBytes = Buffer.from(signature.replace("0x", ""), "hex");

    const isValid = await verifySignature(
      walletTypeToString(wallet.wallet_type),
      new Uint8Array(wallet.public_key),
      messageBytes,
      signatureBytes,
      wallet.chain_address,
    );

    if (!isValid) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    // Call contract
    const args: RemoveAllowedOperationArgs = {
      derivation_path: derivationPath,
      operation_id: operationId,
      signature: Array.from(signatureBytes),
      message: Array.from(messageBytes),
    };

    const txHash = await removeAllowedOperation(args);
    return c.json({ success: true, txHash, operationId });
  } catch (err) {
    console.error("[permission] Error removing operation:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: `Failed to remove operation: ${errorMessage}` }, 500);
  }
});

// ─── Helper Functions ───────────────────────────────────────────────────────────

/**
 * Parse public key from various formats
 */
function parsePublicKey(publicKey: string, walletType: string): Uint8Array {
  // Remove common prefixes
  let key = publicKey;
  if (key.startsWith("0x")) key = key.slice(2);
  if (key.startsWith("ed25519:")) key = key.slice(8);
  if (key.startsWith("secp256k1:")) key = key.slice(10);

  // Try hex decode first
  if (/^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, "hex");
  }

  // Try base58 decode for Solana
  if (walletType.toLowerCase() === "solana") {
    const bs58 = require("bs58");
    return bs58.decode(key);
  }

  throw new Error(`Unable to parse public key: ${publicKey}`);
}

/**
 * Verify signature based on wallet type
 * Note: For permissions, we use a simpler signature scheme than NEP-413
 * The message is JSON that includes all relevant operation details
 */
async function verifySignature(
  walletType: string,
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
  address: string,
): Promise<boolean> {
  const type = walletType.toLowerCase();

  if (type === "solana" || type === "sol") {
    // Solana signature verification
    return verifySolanaSignature({
      signature: Buffer.from(signature).toString("hex"),
      publicKey: require("bs58").encode(publicKey),
      message: Buffer.from(message).toString("utf8"),
    });
  }

  if (type === "near") {
    // NEAR Ed25519 signature verification using tweetnacl
    // For permission messages, we sign the raw message (not NEP-413 format)
    const nacl = require("tweetnacl");
    const messageHash = require("crypto").createHash("sha256").update(message).digest();
    return nacl.sign.detached.verify(new Uint8Array(messageHash), signature, publicKey);
  }

  if (type === "evm" || type === "ethereum" || type === "eth" || type === "base" || type === "arbitrum") {
    // EVM signature verification - delegated to contract for now
    // The contract will verify using ecrecover
    console.warn("[permission] EVM signature verification delegated to contract");
    return true; // Contract will verify
  }

  throw new Error(`Unknown wallet type: ${walletType}`);
}

/**
 * Convert wallet type enum to string
 */
function walletTypeToString(walletType: string): string {
  if (walletType === "Near") return "near";
  if (walletType === "Solana") return "solana";
  if (walletType === "Evm") return "evm";
  return walletType.toLowerCase();
}

export default app;
