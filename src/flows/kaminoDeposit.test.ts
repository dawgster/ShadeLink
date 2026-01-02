import { describe, expect, it, vi } from "vitest";
import { ValidatedIntent, KaminoDepositMetadata } from "../queue/types";
import { createMockFlowContext } from "./context";

// Mock all problematic dependencies
vi.mock("@solana/kit", () => ({
  createSolanaRpc: vi.fn(),
  address: vi.fn((addr: string) => addr),
  pipe: vi.fn((...fns: any[]) => {
    let result = fns[0];
    for (let i = 1; i < fns.length; i++) {
      result = fns[i](result);
    }
    return result;
  }),
  createTransactionMessage: vi.fn(),
  appendTransactionMessageInstructions: vi.fn(),
  setTransactionMessageFeePayerSigner: vi.fn(),
  setTransactionMessageLifetimeUsingBlockhash: vi.fn(),
  compileTransaction: vi.fn(),
}));

vi.mock("@solana-program/system", () => ({
  getTransferSolInstruction: vi.fn(),
}));

vi.mock("@kamino-finance/klend-sdk", () => ({
  KaminoAction: {
    buildDepositTxns: vi.fn(),
  },
  KaminoMarket: {
    load: vi.fn(),
  },
  PROGRAM_ID: "KLend2g3cP87ber41GRxsMGb8NuxWuYjL3Jv12FYQMSEn",
  VanillaObligation: vi.fn(),
}));

vi.mock("../utils/solana", () => ({
  deriveAgentPublicKey: vi.fn().mockResolvedValue({
    toBase58: () => "SoLAgentPubKey123456789012345678901234567890",
  }),
  SOLANA_DEFAULT_PATH: "solana-1",
}));

vi.mock("../utils/chainSignature", () => ({
  signWithNearChainSignatures: vi.fn(),
  createDummySigner: vi.fn((addr: string) => ({ address: addr })),
}));

vi.mock("./registry", () => ({
  flowRegistry: {
    register: vi.fn(),
  },
}));

// Import after mocks
import { kaminoDepositFlow } from "./kaminoDeposit";

// Base valid intent for testing
const createBaseIntent = (overrides: Partial<ValidatedIntent> = {}): ValidatedIntent => ({
  intentId: "test-intent-1",
  sourceChain: "near",
  sourceAsset: "wrap.near",
  sourceAmount: "1000000000000000000000000",
  destinationChain: "solana",
  finalAsset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  userDestination: "SoLUserDestination123456789012345678901234567890",
  agentDestination: "SoLAgentDestination12345678901234567890123456",
  slippageBps: 100,
  ...overrides,
});

describe("kaminoDepositFlow", () => {
  describe("flow definition", () => {
    it("has correct action identifier", () => {
      expect(kaminoDepositFlow.action).toBe("kamino-deposit");
    });

    it("has correct name", () => {
      expect(kaminoDepositFlow.name).toBe("Kamino Deposit");
    });

    it("supports multiple source chains", () => {
      expect(kaminoDepositFlow.supportedChains.source).toContain("near");
      expect(kaminoDepositFlow.supportedChains.source).toContain("ethereum");
      expect(kaminoDepositFlow.supportedChains.source).toContain("solana");
    });

    it("supports Solana as destination", () => {
      expect(kaminoDepositFlow.supportedChains.destination).toContain("solana");
    });

    it("requires action, marketAddress, and mintAddress metadata fields", () => {
      expect(kaminoDepositFlow.requiredMetadataFields).toContain("action");
      expect(kaminoDepositFlow.requiredMetadataFields).toContain("marketAddress");
      expect(kaminoDepositFlow.requiredMetadataFields).toContain("mintAddress");
    });

    it("has optional fields for intents configuration", () => {
      expect(kaminoDepositFlow.optionalMetadataFields).toContain("targetDefuseAssetId");
      expect(kaminoDepositFlow.optionalMetadataFields).toContain("useIntents");
      expect(kaminoDepositFlow.optionalMetadataFields).toContain("slippageTolerance");
    });
  });

  describe("isMatch", () => {
    it("matches intent with kamino-deposit action and required fields", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "kamino-deposit",
          marketAddress: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
          mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
      });
      expect(kaminoDepositFlow.isMatch(intent)).toBe(true);
    });

    it("does not match intent with different action", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "kamino-withdraw",
          marketAddress: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
          mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
      });
      expect(kaminoDepositFlow.isMatch(intent)).toBe(false);
    });

    it("does not match intent without marketAddress", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "kamino-deposit",
          mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        } as any,
      });
      expect(kaminoDepositFlow.isMatch(intent)).toBe(false);
    });

    it("does not match intent without mintAddress", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "kamino-deposit",
          marketAddress: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
        } as any,
      });
      expect(kaminoDepositFlow.isMatch(intent)).toBe(false);
    });

    it("does not match intent without metadata", () => {
      const intent = createBaseIntent({ metadata: undefined });
      expect(kaminoDepositFlow.isMatch(intent)).toBe(false);
    });
  });

  describe("validateAuthorization", () => {
    it("passes with valid userDestination", async () => {
      const intent = createBaseIntent({
        userDestination: "SoLUserDestination123456789012345678901234567890",
        metadata: {
          action: "kamino-deposit",
          marketAddress: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
          mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
      });
      const ctx = createMockFlowContext("test-intent-1");

      await expect(
        kaminoDepositFlow.validateAuthorization!(intent as any, ctx)
      ).resolves.not.toThrow();
    });

    it("throws without userDestination", async () => {
      const intent = createBaseIntent({
        userDestination: undefined as any,
        metadata: {
          action: "kamino-deposit",
          marketAddress: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
          mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
      });
      const ctx = createMockFlowContext("test-intent-1");

      await expect(
        kaminoDepositFlow.validateAuthorization!(intent as any, ctx)
      ).rejects.toThrow("Kamino deposit requires userDestination");
    });
  });
});
