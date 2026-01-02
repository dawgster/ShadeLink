import { describe, expect, it, vi } from "vitest";
import { ValidatedIntent, NearSwapMetadata } from "../queue/types";
import { createMockFlowContext } from "./context";

// Mock all problematic dependencies
vi.mock("@ref-finance/ref-sdk", () => ({
  init_env: vi.fn(),
  ftGetTokenMetadata: vi.fn(),
  fetchAllPools: vi.fn(),
  estimateSwap: vi.fn(),
  instantSwap: vi.fn(),
}));

vi.mock("../config", () => ({
  isTestnet: false,
  config: {
    dryRunSwaps: false,
  },
}));

vi.mock("../utils/near", () => ({
  deriveNearAgentAccount: vi.fn(),
  ensureNearAccountFunded: vi.fn(),
  executeNearFunctionCall: vi.fn(),
  NEAR_DEFAULT_PATH: "near-1",
}));

vi.mock("./registry", () => ({
  flowRegistry: {
    register: vi.fn(),
  },
}));

vi.mock("../utils/authorization", () => ({
  requireUserDestination: vi.fn(),
}));

// Import after mocks
import { nearSwapFlow } from "./nearSwap";

// Base valid intent for testing
const createBaseIntent = (overrides: Partial<ValidatedIntent> = {}): ValidatedIntent => ({
  intentId: "test-intent-1",
  sourceChain: "near",
  sourceAsset: "wrap.near",
  sourceAmount: "1000000000000000000000000",
  destinationChain: "near",
  finalAsset: "usdt.tether-token.near",
  userDestination: "user.near",
  agentDestination: "agent.near",
  slippageBps: 100,
  ...overrides,
});

describe("nearSwapFlow", () => {
  describe("flow definition", () => {
    it("has correct action identifier", () => {
      expect(nearSwapFlow.action).toBe("near-swap");
    });

    it("has correct name", () => {
      expect(nearSwapFlow.name).toBe("NEAR Swap");
    });

    it("supports multiple source chains", () => {
      expect(nearSwapFlow.supportedChains.source).toContain("near");
      expect(nearSwapFlow.supportedChains.source).toContain("ethereum");
      expect(nearSwapFlow.supportedChains.source).toContain("solana");
    });

    it("supports NEAR as destination", () => {
      expect(nearSwapFlow.supportedChains.destination).toContain("near");
      expect(nearSwapFlow.supportedChains.destination).toHaveLength(1);
    });

    it("requires action, tokenIn, and tokenOut metadata fields", () => {
      expect(nearSwapFlow.requiredMetadataFields).toContain("action");
      expect(nearSwapFlow.requiredMetadataFields).toContain("tokenIn");
      expect(nearSwapFlow.requiredMetadataFields).toContain("tokenOut");
    });

    it("has no optional metadata fields", () => {
      expect(nearSwapFlow.optionalMetadataFields).toHaveLength(0);
    });
  });

  describe("isMatch", () => {
    it("matches intent with near-swap action", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "near-swap",
          tokenIn: "wrap.near",
          tokenOut: "usdt.tether-token.near",
        },
      });
      expect(nearSwapFlow.isMatch(intent)).toBe(true);
    });

    it("does not match intent with different action", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "burrow-deposit",
          tokenIn: "wrap.near",
          tokenOut: "usdt.tether-token.near",
        } as any,
      });
      expect(nearSwapFlow.isMatch(intent)).toBe(false);
    });

    it("does not match intent without metadata", () => {
      const intent = createBaseIntent({ metadata: undefined });
      expect(nearSwapFlow.isMatch(intent)).toBe(false);
    });
  });

  describe("validateAuthorization", () => {
    it("calls requireUserDestination", async () => {
      const { requireUserDestination } = await import("../utils/authorization");
      const mockRequireUserDestination = requireUserDestination as ReturnType<typeof vi.fn>;
      mockRequireUserDestination.mockClear();

      const intent = createBaseIntent({
        metadata: {
          action: "near-swap",
          tokenIn: "wrap.near",
          tokenOut: "usdt.tether-token.near",
        },
      });
      const ctx = createMockFlowContext("test-intent-1");

      await nearSwapFlow.validateAuthorization!(intent as any, ctx);

      expect(mockRequireUserDestination).toHaveBeenCalledWith(
        intent,
        ctx,
        "NEAR swap"
      );
    });
  });
});
