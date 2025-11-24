import { describe, expect, it } from "vitest";
import { validateIntent } from "./validation";
import { IntentMessage } from "./types";

const baseIntent: IntentMessage = {
  intentId: "test-intent",
  sourceChain: "solana",
  destinationChain: "solana",
  sourceAsset: "So11111111111111111111111111111111111111111",
  finalAsset: "So11111111111111111111111111111111111111111",
  sourceAmount: "1000000",
  destinationAmount: "1000000",
  userDestination: "4cJgUe8TKEkJtqWSXoe4fAhN74LW2TbK4DGVkfdxUJZk",
  agentDestination: "8CKsW6cVfaQnBxpqtKfxDxZ8sM3E7DbpDZEPXx1cBa9u",
};

describe("validateIntent", () => {
  it("fills default slippage when omitted", () => {
    const validated = validateIntent(baseIntent);
    expect(validated.slippageBps).toBe(300);
  });

  it("fills default intermediate asset when omitted", () => {
    const validated = validateIntent(baseIntent);
    expect(validated.intermediateAsset).toBe(
      "So11111111111111111111111111111111111111112",
    );
  });

  it("preserves provided slippage", () => {
    const validated = validateIntent({ ...baseIntent, slippageBps: 50 });
    expect(validated.slippageBps).toBe(50);
  });

  it("rejects non-solana destination", () => {
    expect(() =>
      validateIntent({ ...baseIntent, destinationChain: "near" }),
    ).toThrow(/destinationChain/);
  });

  it("rejects non-numeric sourceAmount", () => {
    expect(() =>
      validateIntent({ ...baseIntent, sourceAmount: "1.5" }),
    ).toThrow(/sourceAmount/);
  });

  it("rejects missing or invalid intermediate leg data", () => {
    expect(() =>
      validateIntent({ ...baseIntent, destinationAmount: "abc" }),
    ).toThrow(/destinationAmount/);
  });
});
