import { describe, expect, it, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import chainsigTestApp from "./chainsigTest";

const mocks = vi.hoisted(() => ({
  deriveAgentPublicKeyMock: vi.fn(),
  getSolanaConnectionMock: vi.fn(),
  parseSignatureMock: vi.fn(),
  requestSignatureMock: vi.fn(),
}));

vi.mock("../utils/solana", () => ({
  deriveAgentPublicKey: mocks.deriveAgentPublicKeyMock,
  getSolanaConnection: mocks.getSolanaConnectionMock,
  SOLANA_DEFAULT_PATH: "solana-1",
}));

vi.mock("../utils/signature", () => ({
  parseSignature: mocks.parseSignatureMock,
}));

vi.mock("@neardefi/shade-agent-js", () => ({
  requestSignature: mocks.requestSignatureMock,
}));

vi.mock("@solana/web3.js", () => {
  const SystemProgram = {
    transfer: vi.fn().mockReturnValue({}),
  };
  class TransactionMessage {
    constructor(public args: unknown) {}
    compileToV0Message() {
      return {
        serialize: () => new Uint8Array([1, 2, 3]),
      };
    }
  }
  class VersionedTransaction {
    message: any;
    signatures: Uint8Array[];
    constructor(message: any, signatures?: Uint8Array[]) {
      this.message = message;
      this.signatures = signatures || [new Uint8Array(64)];
    }
  }
  return { SystemProgram, TransactionMessage, VersionedTransaction };
});

const app = new Hono().route("/api/chainsig-test", chainsigTestApp);

describe("chainsig-test route", () => {
  beforeEach(() => {
    mocks.deriveAgentPublicKeyMock.mockReset();
    mocks.getSolanaConnectionMock.mockReset();
    mocks.parseSignatureMock.mockReset();
    mocks.requestSignatureMock.mockReset();

    mocks.deriveAgentPublicKeyMock.mockResolvedValue({
      toBase58: () => "agent-pubkey",
    });
    mocks.getSolanaConnectionMock.mockReturnValue({
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: "block" }),
    });
    mocks.requestSignatureMock.mockResolvedValue({ signature: "sig" });
    mocks.parseSignatureMock.mockReturnValue(new Uint8Array(64));
  });

  it("returns signed payload metadata", async () => {
    const res = await app.request("/api/chainsig-test");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agentPublicKey).toBe("agent-pubkey");
    expect(body.status).toBe("signed");
    expect(body.signatureHex).toBeDefined();
  });

  it("handles missing signature", async () => {
    mocks.requestSignatureMock.mockResolvedValue({});
    const res = await app.request("/api/chainsig-test");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/No signature/);
  });
});
