export function parseSignature(sig: string): Uint8Array | null {
  // Try hex first
  if (/^[0-9a-fA-F]+$/.test(sig) && sig.length % 2 === 0) {
    const bytes = Uint8Array.from(Buffer.from(sig, "hex"));
    return bytes.length === 64 ? bytes : null;
  }
  // Fallback to base64
  try {
    const bytes = Uint8Array.from(Buffer.from(sig, "base64"));
    return bytes.length === 64 ? bytes : null;
  } catch {
    return null;
  }
}
