import { describe, expect, it } from "vitest";
import { parseSignature } from "./signature";

describe("parseSignature", () => {
  const hexSig = "a".repeat(128);
  const base64Sig = Buffer.from("b".repeat(64)).toString("base64");

  it("parses a valid hex signature", () => {
    const parsed = parseSignature(hexSig);
    expect(parsed).toBeInstanceOf(Uint8Array);
    expect(parsed?.length).toBe(64);
  });

  it("parses a valid base64 signature", () => {
    const parsed = parseSignature(base64Sig);
    expect(parsed).toBeInstanceOf(Uint8Array);
    expect(parsed?.length).toBe(64);
  });

  it("returns null for invalid input", () => {
    expect(parseSignature("xyz")).toBeNull();
  });
});
