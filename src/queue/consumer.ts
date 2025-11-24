import { setStatus } from "../state/status";
import { RedisQueueClient } from "./redis";
import { IntentMessage, ValidatedIntent } from "./types";
import { executeSolanaSwapFlow } from "../flows/solSwap";
import { validateIntent } from "./validation";
import { config } from "../config";

export async function startQueueConsumer() {
  const queue = new RedisQueueClient();
  // Fire-and-forget loop; log errors so the server keeps running.
  (async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const next = await queue.fetchNextIntent();
      if (!next.intent || !next.raw) {
        if (next.raw) await queue.ackIntent(next.raw);
        continue;
      }

      const raw = next.raw;
      try {
        const intent = validateIntent(next.intent);
        await processIntentWithRetry(intent, raw, queue);
      } catch (err) {
        console.error("Intent processing failed", err);
        await setStatus(next.intent.intentId, {
          state: "failed",
          error: (err as Error).message || "unknown error",
        });
      } finally {
        await queue.ackIntent(raw);
      }
    }
  })().catch((err) => {
    console.error("Queue consumer crashed", err);
  });
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

      const result = await executeSolanaSwapFlow(intent);
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
