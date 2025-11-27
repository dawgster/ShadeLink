import Redis from "ioredis";
import { config } from "../config";

export type IntentStatus =
  | { state: "pending" }
  | { state: "processing"; detail?: string }
  | { state: "awaiting_deposit"; depositAddress: string; depositMemo?: string; expectedAmount?: string }
  | { state: "awaiting_intents"; detail?: string }
  | { state: "succeeded"; txId: string; bridgeTxId?: string }
  | { state: "failed"; error: string };

const STATUS_PREFIX = "intent:status:";
const STATUS_TTL_SECONDS = config.statusTtlSeconds; // keep status for one day

const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on("error", (err) => {
  console.error("Redis connection error (status store)", err);
});

function statusKey(intentId: string) {
  return `${STATUS_PREFIX}${intentId}`;
}

export async function setStatus(intentId: string, status: IntentStatus) {
  await redis.set(statusKey(intentId), JSON.stringify(status), "EX", STATUS_TTL_SECONDS);
}

export async function getStatus(intentId: string): Promise<IntentStatus | null> {
  const raw = await redis.get(statusKey(intentId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IntentStatus;
  } catch (err) {
    console.error("Failed to parse intent status from Redis", err);
    return null;
  }
}

export async function listStatuses(
  limit = 50,
): Promise<Array<{ intentId: string } & IntentStatus>> {
  const matchPattern = `${STATUS_PREFIX}*`;
  let cursor = "0";
  const results: Array<{ intentId: string } & IntentStatus> = [];

  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", matchPattern, "COUNT", 100);
    cursor = nextCursor;

    if (keys.length) {
      const values = await redis.mget(keys);
      keys.forEach((key, idx) => {
        if (results.length >= limit) return;
        const raw = values[idx];
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as IntentStatus;
          const intentId = key.replace(STATUS_PREFIX, "");
          results.push({ intentId, ...parsed });
        } catch (err) {
          console.error("Failed to parse intent status from Redis", err);
        }
      });
    }
  } while (cursor !== "0" && results.length < limit);

  return results;
}
