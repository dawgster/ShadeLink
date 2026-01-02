import { describe, expect, it, vi } from "vitest";
import { ValidatedIntent, BurrowDepositMetadata } from "../queue/types";
import { createMockFlowContext } from "./context";

// Mock problematic dependencies
vi.mock("../utils/burrow", () => ({
  getAssetsPagedDetailed: vi.fn(),
  buildSupplyTransaction: vi.fn(),
}));

vi.mock("../utils/near", () => ({
  deriveNearAgentAccount: vi.fn(),
  ensureNearAccountFunded: vi.fn(),
  executeNearFunctionCall: vi.fn(),
  NEAR_DEFAULT_PATH: "near-1",
  GAS_FOR_FT_TRANSFER_CALL: BigInt("300000000000000"),
  ONE_YOCTO: BigInt(1),
}));

vi.mock("./registry", () => ({
  flowRegistry: {
    register: vi.fn(),
  },
}));

// Import after mocks
import { burrowDepositFlow } from "./burrowDeposit";

// Base valid intent for testing
const createBaseIntent = (overrides: Partial<ValidatedIntent> = {}): ValidatedIntent => ({
  intentId: "test-intent-1",
  sourceChain: "near",
  sourceAsset: "wrap.near",
  sourceAmount: "1000000000000000000000000",
  destinationChain: "near",
  finalAsset: "wrap.near",
  userDestination: "user.near",
  agentDestination: "agent.near",
  slippageBps: 100,
  ...overrides,
});

describe("burrowDepositFlow", () => {
  describe("flow definition", () => {
    it("has correct action identifier", () => {
      expect(burrowDepositFlow.action).toBe("burrow-deposit");
    });

    it("has correct name", () => {
      expect(burrowDepositFlow.name).toBe("Burrow Deposit");
    });

    it("supports NEAR as destination", () => {
      expect(burrowDepositFlow.supportedChains.destination).toContain("near");
    });

    it("supports multiple source chains", () => {
      expect(burrowDepositFlow.supportedChains.source).toContain("near");
      expect(burrowDepositFlow.supportedChains.source).toContain("ethereum");
      expect(burrowDepositFlow.supportedChains.source).toContain("solana");
    });

    it("requires action and tokenId metadata fields", () => {
      expect(burrowDepositFlow.requiredMetadataFields).toContain("action");
      expect(burrowDepositFlow.requiredMetadataFields).toContain("tokenId");
    });
  });

  describe("isMatch", () => {
    it("matches intent with burrow-deposit action and tokenId", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "burrow-deposit",
          tokenId: "wrap.near",
        },
      });
      expect(burrowDepositFlow.isMatch(intent)).toBe(true);
    });

    it("does not match intent with different action", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "kamino-deposit",
          tokenId: "wrap.near",
        },
      });
      expect(burrowDepositFlow.isMatch(intent)).toBe(false);
    });

    it("does not match intent without tokenId", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "burrow-deposit",
        } as any,
      });
      expect(burrowDepositFlow.isMatch(intent)).toBe(false);
    });

    it("does not match intent without metadata", () => {
      const intent = createBaseIntent({ metadata: undefined });
      expect(burrowDepositFlow.isMatch(intent)).toBe(false);
    });
  });

  describe("validateMetadata", () => {
    it("accepts valid named account tokenId", () => {
      const metadata: BurrowDepositMetadata = {
        action: "burrow-deposit",
        tokenId: "wrap.near",
      };
      expect(() => burrowDepositFlow.validateMetadata!(metadata)).not.toThrow();
    });

    it("accepts valid implicit account tokenId (64 hex chars)", () => {
      const metadata: BurrowDepositMetadata = {
        action: "burrow-deposit",
        tokenId: "a".repeat(64),
      };
      expect(() => burrowDepositFlow.validateMetadata!(metadata)).not.toThrow();
    });

    it("strips nep141: prefix from tokenId", () => {
      const metadata: BurrowDepositMetadata = {
        action: "burrow-deposit",
        tokenId: "nep141:wrap.near",
      };
      burrowDepositFlow.validateMetadata!(metadata);
      expect(metadata.tokenId).toBe("wrap.near");
    });

    it("rejects invalid tokenId format", () => {
      const metadata: BurrowDepositMetadata = {
        action: "burrow-deposit",
        tokenId: "invalid",
      };
      expect(() => burrowDepositFlow.validateMetadata!(metadata)).toThrow(
        "Burrow deposit tokenId must be a valid NEAR contract address"
      );
    });
  });

  describe("validateAuthorization", () => {
    it("passes with valid userDestination", async () => {
      const intent = createBaseIntent({
        userDestination: "user.near",
        metadata: {
          action: "burrow-deposit",
          tokenId: "wrap.near",
        },
      });
      const ctx = createMockFlowContext("test-intent-1");

      await expect(
        burrowDepositFlow.validateAuthorization!(intent as any, ctx)
      ).resolves.not.toThrow();
    });

    it("throws without userDestination", async () => {
      const intent = createBaseIntent({
        userDestination: undefined as any,
        metadata: {
          action: "burrow-deposit",
          tokenId: "wrap.near",
        },
      });
      const ctx = createMockFlowContext("test-intent-1");

      await expect(
        burrowDepositFlow.validateAuthorization!(intent as any, ctx)
      ).rejects.toThrow("Burrow deposit requires userDestination");
    });
  });
});
