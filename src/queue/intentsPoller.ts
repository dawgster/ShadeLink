import { OneClickService, OpenAPI } from "@defuse-protocol/one-click-sdk-typescript";
import { config } from "../config";
import { getIntentsByState, setStatus, IntentStatus } from "../state/status";
import { RedisQueueClient } from "./redis";
import { ValidatedIntent } from "./types";

// How often to poll for swap status
const STATUS_POLL_INTERVAL_MS = 5_000;

interface IntentsSwapStatus {
  status: string;
  // Add other fields as needed from the API response
}

/**
 * Polls the Defuse/Intents API for pending cross-chain swaps.
 * When a swap completes successfully, triggers the next step (e.g., Jupiter swap).
 */
export async function startIntentsPoller() {
  if (config.intentsQuoteUrl) {
    OpenAPI.BASE = config.intentsQuoteUrl;
  }

  console.log("[intentsPoller] Starting intents status poller");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await pollPendingIntents();
    } catch (err) {
      console.error("[intentsPoller] Error polling intents:", err);
    }

    await delay(STATUS_POLL_INTERVAL_MS);
  }
}

async function pollPendingIntents() {
  // Get all intents that are awaiting intents completion
  const pendingIntents = await getIntentsByState("awaiting_intents");

  if (pendingIntents.length === 0) {
    return;
  }

  console.log(`[intentsPoller] Checking ${pendingIntents.length} pending intents`);

  for (const intentStatus of pendingIntents) {
    try {
      await checkAndProcessIntent(intentStatus);
    } catch (err) {
      console.error(`[intentsPoller] Error checking intent ${intentStatus.intentId}:`, err);
    }
  }
}

async function checkAndProcessIntent(intentStatus: { intentId: string } & IntentStatus) {
  const { intentId, depositAddress, depositMemo } = intentStatus;

  if (!depositAddress) {
    console.warn(`[intentsPoller] Intent ${intentId} missing depositAddress, skipping`);
    return;
  }

  // Query the Defuse API for swap status
  let swapStatus: IntentsSwapStatus;
  try {
    swapStatus = await OneClickService.getExecutionStatus(
      depositAddress,
      depositMemo,
    ) as IntentsSwapStatus;
  } catch (err) {
    console.error(`[intentsPoller] Failed to get status for ${intentId}:`, err);
    return;
  }

  console.log(`[intentsPoller] Intent ${intentId} status: ${swapStatus.status}`);

  switch (swapStatus.status?.toLowerCase()) {
    case "success":
    case "completed":
      // Intents swap completed - trigger the next step
      await handleIntentsSuccess(intentStatus);
      break;

    case "refunded":
    case "failed":
      // Intents swap failed
      await setStatus(intentId, {
        state: "failed",
        error: `Intents swap ${swapStatus.status}`,
      });
      break;

    case "pending":
    case "processing":
      // Still in progress, continue polling
      break;

    default:
      console.log(`[intentsPoller] Unknown status for ${intentId}: ${swapStatus.status}`);
  }
}

async function handleIntentsSuccess(intentStatus: { intentId: string } & IntentStatus) {
  const { intentId, intentData } = intentStatus;

  if (!intentData) {
    console.error(`[intentsPoller] Intent ${intentId} missing intentData`);
    await setStatus(intentId, {
      state: "failed",
      error: "Missing intent data after intents success",
    });
    return;
  }

  console.log(`[intentsPoller] Intents swap completed for ${intentId}, queueing next step`);

  // Update status to indicate we're moving to the next step
  await setStatus(intentId, {
    state: "processing",
    detail: "Intents swap completed, executing Jupiter swap",
  });

  // Re-enqueue the intent for the consumer to process the Jupiter swap
  // Mark it so the consumer knows intents is already done
  const updatedIntent: ValidatedIntent = {
    ...intentData,
    metadata: {
      ...intentData.metadata,
      intentsCompleted: true,
    },
  };

  const queue = new RedisQueueClient();
  await queue.enqueueIntent(updatedIntent);

  console.log(`[intentsPoller] Re-enqueued intent ${intentId} for Jupiter swap`);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
