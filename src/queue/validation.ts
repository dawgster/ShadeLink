import { SOL_NATIVE_MINT, WRAP_NEAR_CONTRACT } from "../constants";
import { IntentMessage, ValidatedIntent } from "./types";
import { flowRegistry } from "../flows/registry";

const DEFAULT_SLIPPAGE_BPS = 300; // 3% fallback if UI omits slippage

export function validateIntent(message: IntentMessage): ValidatedIntent {
  if (!message.intentId) throw new Error("intentId missing");

  // Look up the flow from registry (if action is specified)
  const action = message.metadata?.action;
  const flow = typeof action === "string" ? flowRegistry.get(action) : undefined;

  // Validate destination chain based on flow's supported chains
  if (flow) {
    const supportedDestinations = flow.supportedChains.destination;
    if (!supportedDestinations.includes(message.destinationChain)) {
      throw new Error(
        `destinationChain must be one of: ${supportedDestinations.join(", ")} for ${action}`
      );
    }
  } else {
    // Default: solana for unknown/swap flows
    if (message.destinationChain !== "solana") {
      throw new Error("destinationChain must be solana");
    }
  }

  // Common field validation
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

  // Registry-driven flow validation
  if (flow) {
    // Check required metadata fields
    for (const field of flow.requiredMetadataFields) {
      if (field === "action") continue; // action already matched
      const value = message.metadata?.[field];
      if (value === undefined || value === "") {
        throw new Error(`${flow.name} requires metadata.${field}`);
      }
    }

    // Run custom validation hook (can sanitize/mutate metadata)
    if (flow.validateMetadata && message.metadata) {
      flow.validateMetadata(message.metadata);
    }
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

function getDefaultIntermediateAsset(intent: IntentMessage) {
  if (intent.destinationChain === "solana") return SOL_NATIVE_MINT;
  if (intent.destinationChain === "near") return WRAP_NEAR_CONTRACT;
  throw new Error("intermediateAsset missing");
}
