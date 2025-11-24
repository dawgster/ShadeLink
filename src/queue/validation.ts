import { SOL_NATIVE_MINT } from "../constants";
import { IntentMessage, ValidatedIntent } from "./types";

const DEFAULT_SLIPPAGE_BPS = 300; // 3% fallback if UI omits slippage

export function validateIntent(message: IntentMessage): ValidatedIntent {
  if (!message.intentId) throw new Error("intentId missing");
  if (message.destinationChain !== "solana")
    throw new Error("destinationChain must be solana");
  if (!message.userDestination) throw new Error("userDestination missing");
  if (!message.agentDestination) throw new Error("agentDestination missing");
  if (!message.sourceAsset) throw new Error("sourceAsset missing");
  if (!message.finalAsset) throw new Error("finalAsset missing");
  if (!message.sourceAmount || !/^\d+$/.test(message.sourceAmount)) {
    throw new Error("sourceAmount must be a numeric string in base units");
  }
  if (
    !message.destinationAmount ||
    !/^\d+$/.test(message.destinationAmount)
  ) {
    throw new Error(
      "destinationAmount must be a numeric string in base units",
    );
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
  throw new Error("intermediateAsset missing");
}
