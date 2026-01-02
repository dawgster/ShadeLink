import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidatedIntent, BurrowWithdrawMetadata } from "../queue/types";
import { createMockFlowContext } from "./context";

// Mock problematic dependencies
vi.mock("../utils/burrow", () => ({
  getAssetsPagedDetailed: vi.fn(),
  buildWithdrawTransaction: vi.fn(),
}));

vi.mock("../utils/near", () => ({
  deriveNearAgentAccount: vi.fn(),
  ensureNearAccountFunded: vi.fn(),
  executeNearFunctionCall: vi.fn(),
  NEAR_DEFAULT_PATH: "near-1",
  GAS_FOR_FT_TRANSFER_CALL: BigInt("300000000000000"),
  ZERO_DEPOSIT: BigInt(0),
  ONE_YOCTO: BigInt(1),
}));

vi.mock("../utils/intents", () => ({
  getIntentsQuote: vi.fn(),
  createBridgeBackQuoteRequest: vi.fn(),
}));

vi.mock("../utils/tokenMappings", () => ({
  getDefuseAssetId: vi.fn(),
}));

vi.mock("./registry", () => ({
  flowRegistry: {
    register: vi.fn(),
  },
}));

// Mock authorization - we'll test the actual validation logic
const mockValidateNearWithdrawAuthorization = vi.fn();
vi.mock("../utils/authorization", () => ({
  validateNearWithdrawAuthorization: (...args: any[]) => mockValidateNearWithdrawAuthorization(...args),
}));

// Import after mocks
import { burrowWithdrawFlow } from "./burrowWithdraw";

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
  nearPublicKey: "ed25519:TestPublicKey123",
  userSignature: {
    message: "test-message",
    signature: "test-signature",
    publicKey: "ed25519:TestPublicKey123",
    nonce: "test-nonce",
    recipient: "shade-agent.near",
  },
  ...overrides,
});

describe("burrowWithdrawFlow", () => {
  beforeEach(() => {
    mockValidateNearWithdrawAuthorization.mockClear();
  });

  describe("flow definition", () => {
    it("has correct action identifier", () => {
      expect(burrowWithdrawFlow.action).toBe("burrow-withdraw");
    });

    it("has correct name", () => {
      expect(burrowWithdrawFlow.name).toBe("Burrow Withdraw");
    });

    it("supports NEAR as source", () => {
      expect(burrowWithdrawFlow.supportedChains.source).toContain("near");
    });

    it("supports multiple destination chains", () => {
      expect(burrowWithdrawFlow.supportedChains.destination).toContain("near");
      expect(burrowWithdrawFlow.supportedChains.destination).toContain("ethereum");
      expect(burrowWithdrawFlow.supportedChains.destination).toContain("solana");
    });

    it("requires action and tokenId metadata fields", () => {
      expect(burrowWithdrawFlow.requiredMetadataFields).toContain("action");
      expect(burrowWithdrawFlow.requiredMetadataFields).toContain("tokenId");
    });

    it("has optional bridgeBack field", () => {
      expect(burrowWithdrawFlow.optionalMetadataFields).toContain("bridgeBack");
    });
  });

  describe("isMatch", () => {
    it("matches intent with burrow-withdraw action and tokenId", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "burrow-withdraw",
          tokenId: "wrap.near",
        },
      });
      expect(burrowWithdrawFlow.isMatch(intent)).toBe(true);
    });

    it("matches intent with bridgeBack configuration", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "burrow-withdraw",
          tokenId: "wrap.near",
          bridgeBack: {
            destinationChain: "ethereum",
            destinationAddress: "0x123...",
            destinationAsset: "eth:usdc",
          },
        },
      });
      expect(burrowWithdrawFlow.isMatch(intent)).toBe(true);
    });

    it("does not match intent with different action", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "burrow-deposit",
          tokenId: "wrap.near",
        },
      });
      expect(burrowWithdrawFlow.isMatch(intent)).toBe(false);
    });

    it("does not match intent without tokenId", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "burrow-withdraw",
        } as any,
      });
      expect(burrowWithdrawFlow.isMatch(intent)).toBe(false);
    });
  });

  describe("validateMetadata", () => {
    it("accepts valid named account tokenId", () => {
      const metadata: BurrowWithdrawMetadata = {
        action: "burrow-withdraw",
        tokenId: "wrap.near",
      };
      expect(() => burrowWithdrawFlow.validateMetadata!(metadata)).not.toThrow();
    });

    it("strips nep141: prefix from tokenId", () => {
      const metadata: BurrowWithdrawMetadata = {
        action: "burrow-withdraw",
        tokenId: "nep141:usdt.tether-token.near",
      };
      burrowWithdrawFlow.validateMetadata!(metadata);
      expect(metadata.tokenId).toBe("usdt.tether-token.near");
    });

    it("rejects invalid tokenId format", () => {
      const metadata: BurrowWithdrawMetadata = {
        action: "burrow-withdraw",
        tokenId: "invalid-token",
      };
      expect(() => burrowWithdrawFlow.validateMetadata!(metadata)).toThrow(
        "Burrow withdraw tokenId must be a valid NEAR contract address"
      );
    });
  });

  describe("validateAuthorization", () => {
    it("calls validateNearWithdrawAuthorization", async () => {
      const intent = createBaseIntent({
        metadata: {
          action: "burrow-withdraw",
          tokenId: "wrap.near",
        },
      });
      const ctx = createMockFlowContext("test-intent-1");

      await burrowWithdrawFlow.validateAuthorization!(intent as any, ctx);

      expect(mockValidateNearWithdrawAuthorization).toHaveBeenCalledWith(
        intent,
        ctx,
        "Burrow withdraw"
      );
    });
  });
});
