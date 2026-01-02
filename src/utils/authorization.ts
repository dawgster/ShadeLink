import { ValidatedIntent } from "../queue/types";
import { FlowContext } from "../flows/types";
import {
  createIntentSigningMessage,
  validateIntentSignature,
} from "./nearSignature";
import {
  createSolanaIntentSigningMessage,
  validateSolanaIntentSignature,
} from "./solanaSignature";

/**
 * Authorization utilities for flow validation.
 * Centralizes common authorization patterns used across flows.
 */

/**
 * Requires userDestination to be present on the intent.
 * Used for flows where authorization is implicit (e.g., deposits where
 * the user proves ownership by sending funds).
 */
export function requireUserDestination(
  intent: ValidatedIntent,
  ctx: FlowContext,
  flowName: string,
): void {
  if (!intent.userDestination) {
    throw new Error(`${flowName} requires userDestination to identify the user`);
  }

  ctx.logger.debug(`Authorization verified for ${flowName}`, {
    userDestination: intent.userDestination,
  });
}

/**
 * Validates NEAR signature for withdraw operations.
 * Used for flows where the user must prove ownership of assets via
 * a signed message (e.g., Burrow withdraw).
 */
export function validateNearWithdrawAuthorization(
  intent: ValidatedIntent,
  ctx: FlowContext,
  flowName: string,
): void {
  if (!intent.nearPublicKey) {
    throw new Error(`${flowName} requires nearPublicKey to identify the user`);
  }

  if (!intent.userSignature) {
    throw new Error(`${flowName} requires userSignature for authorization`);
  }

  const expectedMessage = createIntentSigningMessage(intent);

  const result = validateIntentSignature(
    intent.userSignature,
    intent.nearPublicKey,
    expectedMessage,
  );

  if (!result.isValid) {
    throw new Error(`Authorization failed: ${result.error}`);
  }

  ctx.logger.debug(`Authorization verified for ${flowName}`, {
    nearPublicKey: intent.nearPublicKey,
  });
}

/**
 * Validates Solana signature for withdraw operations.
 * Used for flows where the user must prove ownership of assets via
 * a signed message (e.g., Kamino withdraw).
 */
export function validateSolanaWithdrawAuthorization(
  intent: ValidatedIntent,
  ctx: FlowContext,
  flowName: string,
): void {
  if (!intent.userDestination) {
    throw new Error(`${flowName} requires userDestination to identify the user`);
  }

  if (!intent.userSignature) {
    throw new Error(`${flowName} requires userSignature for authorization`);
  }

  // Check that this is a Solana signature, not a NEAR signature
  if ("nonce" in intent.userSignature || "recipient" in intent.userSignature) {
    throw new Error(`${flowName} requires a Solana signature, not a NEAR signature`);
  }

  const expectedMessage = createSolanaIntentSigningMessage(intent);

  const result = validateSolanaIntentSignature(
    {
      message: intent.userSignature.message,
      signature: intent.userSignature.signature,
      publicKey: intent.userSignature.publicKey,
    },
    intent.userDestination,
    expectedMessage,
  );

  if (!result.isValid) {
    throw new Error(`Authorization failed: ${result.error}`);
  }

  ctx.logger.debug(`Authorization verified for ${flowName}`, {
    userDestination: intent.userDestination,
  });
}
