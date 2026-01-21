// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ValidatedIntent, KaminoWithdrawMetadata } from "../queue/types";
import { createMockFlowContext } from "./context";

// Mock all problematic dependencies
vi.mock("@solana/web3.js", () => ({
  VersionedTransaction: vi.fn(),
  Connection: vi.fn(),
  TransactionMessage: vi.fn(),
  PublicKey: vi.fn().mockImplementation((key: string) => ({ toBase58: () => key })),
  SystemProgram: { transfer: vi.fn() },
}));

vi.mock("@solana/spl-token", () => ({
  createAssociatedTokenAccountInstruction: vi.fn(),
  createTransferInstruction: vi.fn(),
  getAssociatedTokenAddress: vi.fn(),
}));

vi.mock("@solana/kit", () => ({
  createSolanaRpc: vi.fn(),
  address: vi.fn((addr: string) => addr),
}));

vi.mock("@kamino-finance/klend-sdk", () => ({
  KaminoAction: {
    buildWithdrawTxns: vi.fn(),
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
  signAndBroadcastDualSigner: vi.fn(),
}));

vi.mock("../utils/chainSignature", () => ({
  createDummySigner: vi.fn((addr: string) => ({ address: addr })),
}));

vi.mock("../utils/tokenMappings", () => ({
  getDefuseAssetId: vi.fn(),
  getSolDefuseAssetId: vi.fn(),
}));

vi.mock("../utils/intents", () => ({
  getIntentsQuote: vi.fn(),
  createBridgeBackQuoteRequest: vi.fn(),
}));

vi.mock("./registry", () => ({
  flowRegistry: {
    register: vi.fn(),
  },
}));

// Mock authorization - we'll test the actual validation logic
const mockValidateSolanaWithdrawAuthorization = vi.fn();
vi.mock("../utils/authorization", () => ({
  validateSolanaWithdrawAuthorization: (...args: any[]) => mockValidateSolanaWithdrawAuthorization(...args),
}));

// Import after mocks
import { kaminoWithdrawFlow } from "./kaminoWithdraw";

// Base valid intent for testing
const createBaseIntent = (overrides: Partial<ValidatedIntent> = {}): ValidatedIntent => ({
  intentId: "test-intent-1",
  sourceChain: "solana",
  sourceAsset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  sourceAmount: "1000000",
  destinationChain: "solana",
  finalAsset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  userDestination: "SoLUserDestination123456789012345678901234567890",
  agentDestination: "SoLAgentDestination12345678901234567890123456",
  slippageBps: 100,
  solanaPublicKey: "SoLUserPubKey12345678901234567890123456789012",
  userSignature: {
    message: "test-message",
    signature: "test-signature",
    publicKey: "SoLUserPubKey12345678901234567890123456789012",
    nonce: "test-nonce",
    recipient: "shade-agent.near",
  },
  ...overrides,
});

describe("kaminoWithdrawFlow", () => {
  beforeEach(() => {
    mockValidateSolanaWithdrawAuthorization.mockClear();
  });

  describe("flow definition", () => {
    it("has correct action identifier", () => {
      expect(kaminoWithdrawFlow.action).toBe("kamino-withdraw");
    });

    it("has correct name", () => {
      expect(kaminoWithdrawFlow.name).toBe("Kamino Withdraw");
    });

    it("supports Solana as source", () => {
      expect(kaminoWithdrawFlow.supportedChains.source).toContain("solana");
    });

    it("supports multiple destination chains", () => {
      expect(kaminoWithdrawFlow.supportedChains.destination).toContain("solana");
      expect(kaminoWithdrawFlow.supportedChains.destination).toContain("near");
      expect(kaminoWithdrawFlow.supportedChains.destination).toContain("ethereum");
    });

    it("requires action, marketAddress, and mintAddress metadata fields", () => {
      expect(kaminoWithdrawFlow.requiredMetadataFields).toContain("action");
      expect(kaminoWithdrawFlow.requiredMetadataFields).toContain("marketAddress");
      expect(kaminoWithdrawFlow.requiredMetadataFields).toContain("mintAddress");
    });

    it("has optional bridgeBack field", () => {
      expect(kaminoWithdrawFlow.optionalMetadataFields).toContain("bridgeBack");
    });
  });

  describe("isMatch", () => {
    it("matches intent with kamino-withdraw action and required fields", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "kamino-withdraw",
          marketAddress: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
          mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
      });
      expect(kaminoWithdrawFlow.isMatch(intent)).toBe(true);
    });

    it("matches intent with bridgeBack configuration", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "kamino-withdraw",
          marketAddress: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
          mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          bridgeBack: {
            destinationChain: "near",
            destinationAddress: "user.near",
            destinationAsset: "wrap.near",
          },
        },
      });
      expect(kaminoWithdrawFlow.isMatch(intent)).toBe(true);
    });

    it("does not match intent with different action", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "kamino-deposit",
          marketAddress: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
          mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
      });
      expect(kaminoWithdrawFlow.isMatch(intent)).toBe(false);
    });

    it("does not match intent without marketAddress", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "kamino-withdraw",
          mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        } as any,
      });
      expect(kaminoWithdrawFlow.isMatch(intent)).toBe(false);
    });

    it("does not match intent without mintAddress", () => {
      const intent = createBaseIntent({
        metadata: {
          action: "kamino-withdraw",
          marketAddress: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
        } as any,
      });
      expect(kaminoWithdrawFlow.isMatch(intent)).toBe(false);
    });
  });

  describe("validateAuthorization", () => {
    it("calls validateSolanaWithdrawAuthorization", async () => {
      const intent = createBaseIntent({
        metadata: {
          action: "kamino-withdraw",
          marketAddress: "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF",
          mintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        },
      });
      const ctx = createMockFlowContext("test-intent-1");

      await kaminoWithdrawFlow.validateAuthorization!(intent as any, ctx);

      expect(mockValidateSolanaWithdrawAuthorization).toHaveBeenCalledWith(
        intent,
        ctx,
        "Kamino withdraw"
      );
    });
  });
});
