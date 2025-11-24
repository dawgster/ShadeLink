import { describe, expect, it } from "vitest";
import { validateIntent } from "./validation";

const baseIntent = {
  intentId: "test-1",
  sourceChain: "near" as const,
  sourceAsset: "So11111111111111111111111111111111111111112",
  sourceAmount: "1000000",
  intermediateAsset: "So11111111111111111111111111111111111111112",
  destinationAmount: "1000000",
  destinationChain: "solana" as const,
  finalAsset: "TargetMint1111111111111111111111111111111111",
  userDestination: "UserSol1111111111111111111111111111111111",
  agentDestination: "AgentSol111111111111111111111111111111111",
};

describe("validateIntent", () => {
  it("accepts a valid intent and applies default slippage", () => {
    const validated = validateIntent(baseIntent);
    expect(validated.intentId).toBe("test-1");
    expect(validated.slippageBps).toBeGreaterThan(0);
  });

  it("rejects missing required fields", () => {
    expect(() =>
      validateIntent({
        ...baseIntent,
        intentId: "",
      }),
    ).toThrow(/intentId/);

    expect(() =>
      validateIntent({
        ...baseIntent,
        destinationChain: "near" as const,
      }),
    ).toThrow(/destinationChain/);

    expect(() =>
      validateIntent({
        ...baseIntent,
        sourceAmount: "abc",
      }),
    ).toThrow(/sourceAmount/);
  });
});
