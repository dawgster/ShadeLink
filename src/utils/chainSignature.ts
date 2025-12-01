import { requestSignature } from "@neardefi/shade-agent-js";
import { utils } from "chainsig.js";
import { config } from "../config";
import { parseSignature } from "./signature";
import { SOLANA_DEFAULT_PATH } from "./solana";

const { uint8ArrayToHex } = utils.cryptography;

/**
 * Signs a payload using NEAR chain signatures (EdDSA for Solana).
 * @param payloadBytes - The serialized transaction message to sign
 * @param nearPublicKey - Optional NEAR public key to include in derivation path
 * @returns The signature as Uint8Array
 */
export async function signWithNearChainSignatures(
  payloadBytes: Uint8Array,
  nearPublicKey?: string,
): Promise<Uint8Array> {
  if (!config.shadeContractId) {
    throw new Error("NEXT_PUBLIC_contractId not configured for signing");
  }

  const derivationPath = nearPublicKey
    ? `${SOLANA_DEFAULT_PATH},${nearPublicKey}`
    : SOLANA_DEFAULT_PATH;

  const payload = uint8ArrayToHex(payloadBytes);
  const signRes = await requestSignature({
    path: derivationPath,
    payload,
    keyType: "Eddsa",
  });

  if (!signRes.signature) {
    throw new Error("Signature missing from chain-signature response");
  }

  const sig = parseSignature(signRes.signature);
  if (!sig) throw new Error("Unsupported signature encoding");
  return sig;
}

/**
 * Creates a dummy signer interface for Kamino SDK that only provides an address.
 * The actual signing is done via NEAR chain signatures.
 * @param ownerAddress - The Solana address string
 */
export function createDummySigner(ownerAddress: string) {
  return {
    address: ownerAddress,
    signTransactions: async () => {
      throw new Error("Signing handled by NEAR chain signatures");
    },
    signMessages: async () => {
      throw new Error("Signing handled by NEAR chain signatures");
    },
  } as any;
}
