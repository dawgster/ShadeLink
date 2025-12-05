import { SOL_NATIVE_MINT, WRAP_NEAR_CONTRACT } from "../constants";
import {
  IntentMessage,
  KaminoDepositMetadata,
  KaminoWithdrawMetadata,
  BurrowDepositMetadata,
  BurrowWithdrawMetadata,
  ValidatedIntent,
} from "./types";

const DEFAULT_SLIPPAGE_BPS = 300; // 3% fallback if UI omits slippage

function isKaminoDepositMetadata(
  metadata?: IntentMessage["metadata"],
): boolean {
  return (metadata as KaminoDepositMetadata)?.action === "kamino-deposit";
}

function isKaminoWithdrawMetadata(
  metadata?: IntentMessage["metadata"],
): boolean {
  return (metadata as KaminoWithdrawMetadata)?.action === "kamino-withdraw";
}

function isBurrowDepositMetadata(
  metadata?: IntentMessage["metadata"],
): boolean {
  return (metadata as BurrowDepositMetadata)?.action === "burrow-deposit";
}

function isBurrowWithdrawMetadata(
  metadata?: IntentMessage["metadata"],
): boolean {
  return (metadata as BurrowWithdrawMetadata)?.action === "burrow-withdraw";
}

export function validateIntent(message: IntentMessage): ValidatedIntent {
  if (!message.intentId) throw new Error("intentId missing");

  // Check if this is a Burrow intent (NEAR-based)
  const isBurrowIntent = isBurrowDepositMetadata(message.metadata) || isBurrowWithdrawMetadata(message.metadata);

  // Validate destination chain based on intent type
  if (isBurrowIntent) {
    if (message.destinationChain !== "near") {
      throw new Error("destinationChain must be near for Burrow intents");
    }
  } else {
    if (message.destinationChain !== "solana") {
      throw new Error("destinationChain must be solana");
    }
  }

  if (!message.userDestination) throw new Error("userDestination missing");
  if (!message.agentDestination) throw new Error("agentDestination missing");
  if (!message.sourceAsset) throw new Error("sourceAsset missing");
  if (!message.finalAsset) throw new Error("finalAsset missing");
  if (!message.sourceAmount || !/^\d+$/.test(message.sourceAmount)) {
    throw new Error("sourceAmount must be a numeric string in base units");
  }
  // Validate sourceAmount is a reasonable size (max 2^128 to prevent overflow issues)
  try {
    const amount = BigInt(message.sourceAmount);
    if (amount <= 0n) {
      throw new Error("sourceAmount must be positive");
    }
    if (amount > 2n ** 128n) {
      throw new Error("sourceAmount exceeds maximum allowed value");
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("sourceAmount")) throw e;
    throw new Error("sourceAmount is not a valid integer");
  }
  // destinationAmount is optional - if provided, must be numeric string
  if (
    message.destinationAmount !== undefined &&
    !/^\d+$/.test(message.destinationAmount)
  ) {
    throw new Error(
      "destinationAmount must be a numeric string in base units if provided",
    );
  }

  // Validate Kamino-specific requirements
  if (isKaminoDepositMetadata(message.metadata)) {
    validateKaminoDepositIntent(message);
  }
  if (isKaminoWithdrawMetadata(message.metadata)) {
    validateKaminoWithdrawIntent(message);
  }

  // Validate Burrow-specific requirements
  if (isBurrowDepositMetadata(message.metadata)) {
    validateBurrowDepositIntent(message);
  }
  if (isBurrowWithdrawMetadata(message.metadata)) {
    validateBurrowWithdrawIntent(message);
  }

  const intermediateAsset =
    message.intermediateAsset || getDefaultIntermediateAsset(message);

  return {
    ...message,
    intermediateAsset,
    slippageBps:
      typeof message.slippageBps === "number"
        ? message.slippageBps
        : DEFAULT_SLIPPAGE_BPS,
  };
}

function validateKaminoDepositIntent(message: IntentMessage): void {
  const metadata = message.metadata as KaminoDepositMetadata;

  if (!metadata.marketAddress) {
    throw new Error("Kamino deposit requires metadata.marketAddress");
  }
  if (!metadata.mintAddress) {
    throw new Error("Kamino deposit requires metadata.mintAddress");
  }

  // Note: nearPublicKey and userSignature are validated at runtime in the flow
  // because they may be added after initial validation
}

function validateKaminoWithdrawIntent(message: IntentMessage): void {
  const metadata = message.metadata as KaminoWithdrawMetadata;

  if (!metadata.marketAddress) {
    throw new Error("Kamino withdraw requires metadata.marketAddress");
  }
  if (!metadata.mintAddress) {
    throw new Error("Kamino withdraw requires metadata.mintAddress");
  }

  // Note: nearPublicKey and userSignature are validated at runtime in the flow
  // because they may be added after initial validation
}

function validateBurrowDepositIntent(message: IntentMessage): void {
  const metadata = message.metadata as BurrowDepositMetadata;

  if (!metadata.tokenId) {
    throw new Error("Burrow deposit requires metadata.tokenId");
  }

  // Sanitize tokenId: strip nep141: prefix if present (Defuse asset ID format)
  if (metadata.tokenId.startsWith("nep141:")) {
    metadata.tokenId = metadata.tokenId.slice(7);
  }

  // Validate tokenId looks like a NEAR account (either named account with . or hex implicit account)
  const isNamedAccount = metadata.tokenId.includes(".");
  const isImplicitAccount = /^[0-9a-f]{64}$/i.test(metadata.tokenId);
  if (!isNamedAccount && !isImplicitAccount) {
    throw new Error("Burrow deposit tokenId must be a valid NEAR contract address");
  }
}

function validateBurrowWithdrawIntent(message: IntentMessage): void {
  const metadata = message.metadata as BurrowWithdrawMetadata;

  if (!metadata.tokenId) {
    throw new Error("Burrow withdraw requires metadata.tokenId");
  }

  // Sanitize tokenId: strip nep141: prefix if present (Defuse asset ID format)
  if (metadata.tokenId.startsWith("nep141:")) {
    metadata.tokenId = metadata.tokenId.slice(7);
  }

  // Validate tokenId looks like a NEAR account (either named account with . or hex implicit account)
  const isNamedAccount = metadata.tokenId.includes(".");
  const isImplicitAccount = /^[0-9a-f]{64}$/i.test(metadata.tokenId);
  if (!isNamedAccount && !isImplicitAccount) {
    throw new Error("Burrow withdraw tokenId must be a valid NEAR contract address");
  }
}

function getDefaultIntermediateAsset(intent: IntentMessage) {
  if (intent.destinationChain === "solana") return SOL_NATIVE_MINT;
  if (intent.destinationChain === "near") return WRAP_NEAR_CONTRACT;
  throw new Error("intermediateAsset missing");
}
