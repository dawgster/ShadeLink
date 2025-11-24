import { describe, expect, it } from "vitest";
import { parseSignature } from "../utils/signature";

describe("parseSignature", () => {
  it("parses a hex-encoded signature", () => {
    const hexSig = "00".repeat(64);
    const parsed = parseSignature(hexSig);
    expect(parsed).not.toBeNull();
    expect(parsed?.length).toBe(64);
  });

  it("parses a base64-encoded signature", () => {
    const base64Sig = Buffer.from(Uint8Array.from({ length: 64 }, (_, i) => i % 255)).toString("base64");
    const parsed = parseSignature(base64Sig);
    expect(parsed).not.toBeNull();
    expect(parsed?.length).toBe(64);
  });

  it("returns null for invalid input", () => {
    expect(parseSignature("not-a-sig")).toBeNull();
  });
});
