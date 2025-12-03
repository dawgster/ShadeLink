import { setStatus } from "../state/status";
import { RedisQueueClient } from "./redis";
import { IntentMessage, ValidatedIntent } from "./types";
import { executeSolanaSwapFlow } from "../flows/solSwap";
import {
  executeKaminoDepositFlow,
  isKaminoDepositIntent,
} from "../flows/kaminoDeposit";
import {
  executeKaminoWithdrawFlow,
  isKaminoWithdrawIntent,
} from "../flows/kaminoWithdraw";
import {
  executeBurrowDepositFlow,
  isBurrowDepositIntent,
} from "../flows/burrowDeposit";
import {
  executeBurrowWithdrawFlow,
  isBurrowWithdrawIntent,
} from "../flows/burrowWithdraw";
import { validateIntent } from "./validation";
import { config } from "../config";

/**
 * Starts the queue consumer with parallel processing support.
 * Uses a worker pool pattern to process multiple intents concurrently.
 */
export async function startQueueConsumer() {
  const queue = new RedisQueueClient();
  const concurrency = config.queueConcurrency;
  let activeWorkers = 0;

  console.log(`Starting queue consumer with concurrency: ${concurrency}`);

  // Fire-and-forget loop; log errors so the server keeps running.
  (async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Wait if we've hit max concurrency
      if (activeWorkers >= concurrency) {
        await delay(100);
        continue;
      }

      const next = await queue.fetchNextIntent();
      if (!next.intent || !next.raw) {
        if (next.raw) {
          console.warn("[consumer] Received malformed intent message, acknowledging and skipping:", next.raw.substring(0, 200));
          await queue.ackIntent(next.raw);
        }
        continue;
      }

      // Spawn worker for this intent (don't await - run in parallel)
      activeWorkers++;
      processIntent(next.intent, next.raw, queue)
        .finally(() => {
          activeWorkers--;
        });
    }
  })().catch((err) => {
    console.error("Queue consumer crashed", err);
  });
}

/**
 * Processes a single intent with validation, retry logic, and cleanup.
 */
async function processIntent(
  intentMessage: IntentMessage,
  raw: string,
  queue: RedisQueueClient,
) {
  try {
    const intent = validateIntent(intentMessage);
    await processIntentWithRetry(intent, raw, queue);
  } catch (err) {
    console.error("Intent processing failed", err);
    await setStatus(intentMessage.intentId, {
      state: "failed",
      error: (err as Error).message || "unknown error",
    });
  } finally {
    await queue.ackIntent(raw);
  }
}

async function processIntentWithRetry(
  intent: ValidatedIntent,
  raw: string,
  queue: RedisQueueClient,
) {
  let attempt = 0;
  while (attempt < config.maxIntentAttempts) {
    attempt += 1;
    try {
      await setStatus(intent.intentId, {
        state: "processing",
        detail: `attempt ${attempt}/${config.maxIntentAttempts}`,
      });

      const result = await executeIntentFlow(intent);

      // If the intent is awaiting intents delivery, don't overwrite the status
      // The poller will handle the next step when intents completes
      if (result.txId.startsWith("awaiting-intents-")) {
        return;
      }

      await setStatus(intent.intentId, {
        state: "succeeded",
        txId: result.txId,
      });
      return;
    } catch (err) {
      const isLast = attempt >= config.maxIntentAttempts;
      console.error(
        `Intent ${intent.intentId} failed on attempt ${attempt}/${config.maxIntentAttempts}`,
        err,
      );
      if (isLast) {
        await setStatus(intent.intentId, {
          state: "failed",
          error: (err as Error).message || "unknown error",
        });
        await queue.moveToDeadLetter(raw);
        return;
      }
      await setStatus(intent.intentId, {
        state: "processing",
        detail: `retrying (attempt ${attempt + 1}/${config.maxIntentAttempts})`,
      });
      await delay(config.intentRetryBackoffMs * attempt);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if this is a cross-chain swap that needs to wait for intents delivery
 */
function needsIntentsWait(intent: ValidatedIntent): boolean {
  // If intents already completed (re-queued by poller), skip waiting
  if ((intent.metadata as any)?.intentsCompleted) {
    return false;
  }

  // If there's a deposit address and intermediate amount, this is a cross-chain swap
  // that needs to wait for intents to deliver funds
  if (intent.intentsDepositAddress && intent.intermediateAmount) {
    return true;
  }

  // If source chain is different from destination chain and we have intermediate asset
  if (intent.sourceChain !== intent.destinationChain && intent.intermediateAsset) {
    return true;
  }

  return false;
}

/**
 * Routes the intent to the appropriate execution flow based on metadata
 */
async function executeIntentFlow(
  intent: ValidatedIntent,
): Promise<{ txId: string }> {
  // Check if we need to wait for intents cross-chain swap to complete
  if (needsIntentsWait(intent)) {
    console.log(`[consumer] Intent ${intent.intentId} needs to wait for intents delivery`);

    // Set status to awaiting_intents with all the info needed to poll and re-process
    await setStatus(intent.intentId, {
      state: "awaiting_intents",
      detail: "Waiting for cross-chain swap to complete",
      depositAddress: intent.intentsDepositAddress,
      depositMemo: intent.depositMemo,
      intentData: intent,
    });

    // Return a placeholder - the actual swap will happen after poller detects completion
    return { txId: `awaiting-intents-${intent.intentId}` };
  }

  if (isKaminoDepositIntent(intent)) {
    return executeKaminoDepositFlow(intent);
  }

  if (isKaminoWithdrawIntent(intent)) {
    return executeKaminoWithdrawFlow(intent);
  }

  if (isBurrowDepositIntent(intent)) {
    return executeBurrowDepositFlow(intent);
  }

  if (isBurrowWithdrawIntent(intent)) {
    return executeBurrowWithdrawFlow(intent);
  }

  // Default to Solana swap flow
  return executeSolanaSwapFlow(intent);
}
