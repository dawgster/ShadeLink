export type IntentChain = "near" | "solana" | "zcash";

export interface IntentMessage {
  intentId: string;
  sourceChain: IntentChain;
  sourceAsset: string;
  sourceAmount: string;
  destinationChain: IntentChain;
  intermediateAsset?: string;
  destinationAmount: string;
  finalAsset: string;
  slippageBps?: number;
  userDestination: string;
  agentDestination: string;
  depositMemo?: string;
  originTxHash?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface ValidatedIntent extends IntentMessage {
  slippageBps: number;
}
