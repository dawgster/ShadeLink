import Redis from "ioredis";
import { config } from "../config";
import type { IntentChain, OrderType, OrderSide, PriceCondition } from "../queue/types";

// ─── Order State Types ──────────────────────────────────────────────────────────

export type OrderState =
  | "pending"     // Created, awaiting funding
  | "active"      // Funded, monitoring price
  | "triggered"   // Price condition met, executing
  | "executed"    // Successfully executed
  | "cancelled"   // User cancelled
  | "expired"     // Expiry time passed
  | "failed";     // Execution failed

export interface Order {
  orderId: string;
  state: OrderState;

  // Order configuration
  orderType: OrderType;
  side: OrderSide;

  // Price monitoring
  priceAsset: string;
  quoteAsset: string;
  triggerPrice: string;
  priceCondition: PriceCondition;

  // Swap details
  sourceChain: IntentChain;
  sourceAsset: string;
  amount: string;
  destinationChain: IntentChain;
  targetAsset: string;

  // User info
  userAddress: string;
  userChain: IntentChain;

  // Agent custody
  agentAddress: string;
  agentChain: IntentChain;

  // Settings
  slippageTolerance: number;
  expiresAt?: number;

  // Timestamps
  createdAt: number;
  fundedAt?: number;
  triggeredAt?: number;
  executedAt?: number;
  cancelledAt?: number;

  // Execution details
  triggeredPrice?: string;
  executionTxId?: string;
  outputAmount?: string;

  // Error tracking
  error?: string;

  // Intent tracking
  createIntentId?: string;
  executeIntentId?: string;

  // Permission contract tracking (for self-custodial orders)
  permissionOperationId?: string;
  permissionDerivationPath?: string;
}

// ─── Redis Setup ────────────────────────────────────────────────────────────────

const ORDER_PREFIX = "order:";
const ORDER_ACTIVE_SET = "orders:active"; // Set of active order IDs for polling
const ORDER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on("error", (err) => {
  console.error("Redis connection error (orders store)", err);
});

function orderKey(orderId: string) {
  return `${ORDER_PREFIX}${orderId}`;
}

// ─── CRUD Operations ────────────────────────────────────────────────────────────

/**
 * Create a new order
 */
export async function createOrder(order: Order): Promise<void> {
  const key = orderKey(order.orderId);
  const existing = await redis.exists(key);
  if (existing) {
    throw new Error(`Order ${order.orderId} already exists`);
  }

  const pipeline = redis.pipeline();
  pipeline.set(key, JSON.stringify(order), "EX", ORDER_TTL_SECONDS);

  // Add to active set if active
  if (order.state === "active") {
    pipeline.sadd(ORDER_ACTIVE_SET, order.orderId);
  }

  await pipeline.exec();
}

/**
 * Get an order by ID
 */
export async function getOrder(orderId: string): Promise<Order | null> {
  const raw = await redis.get(orderKey(orderId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Order;
  } catch (err) {
    console.error("Failed to parse order from Redis", err);
    return null;
  }
}

/**
 * Update an order
 */
export async function updateOrder(
  orderId: string,
  updates: Partial<Order>,
): Promise<Order> {
  const existing = await getOrder(orderId);
  if (!existing) {
    throw new Error(`Order ${orderId} not found`);
  }

  const updated: Order = { ...existing, ...updates };

  const pipeline = redis.pipeline();
  pipeline.set(orderKey(orderId), JSON.stringify(updated), "EX", ORDER_TTL_SECONDS);

  // Update active set membership
  if (updated.state === "active") {
    pipeline.sadd(ORDER_ACTIVE_SET, orderId);
  } else {
    pipeline.srem(ORDER_ACTIVE_SET, orderId);
  }

  await pipeline.exec();
  return updated;
}

/**
 * Update order state
 */
export async function setOrderState(
  orderId: string,
  state: OrderState,
  additionalFields?: Partial<Order>,
): Promise<Order> {
  const updates: Partial<Order> = { state, ...additionalFields };

  if (state === "triggered") {
    updates.triggeredAt = Date.now();
  } else if (state === "executed") {
    updates.executedAt = Date.now();
  } else if (state === "cancelled") {
    updates.cancelledAt = Date.now();
  }

  return updateOrder(orderId, updates);
}

/**
 * Mark order as funded and active
 */
export async function markOrderFunded(orderId: string): Promise<Order> {
  return updateOrder(orderId, {
    state: "active",
    fundedAt: Date.now(),
  });
}

/**
 * Mark order as triggered (price condition met)
 */
export async function markOrderTriggered(
  orderId: string,
  triggeredPrice: string,
): Promise<Order> {
  return updateOrder(orderId, {
    state: "triggered",
    triggeredAt: Date.now(),
    triggeredPrice,
  });
}

/**
 * Mark order as executed
 */
export async function markOrderExecuted(
  orderId: string,
  executionTxId: string,
  outputAmount?: string,
): Promise<Order> {
  return updateOrder(orderId, {
    state: "executed",
    executedAt: Date.now(),
    executionTxId,
    outputAmount,
  });
}

/**
 * Mark order as failed
 */
export async function markOrderFailed(
  orderId: string,
  error: string,
): Promise<Order> {
  return updateOrder(orderId, {
    state: "failed",
    error,
  });
}

// ─── Query Operations ───────────────────────────────────────────────────────────

/**
 * Get all active order IDs
 */
export async function getActiveOrderIds(): Promise<string[]> {
  return redis.smembers(ORDER_ACTIVE_SET);
}

/**
 * Get all active orders
 */
export async function getActiveOrders(): Promise<Order[]> {
  const orderIds = await getActiveOrderIds();

  if (orderIds.length === 0) return [];

  const orders: Order[] = [];

  for (const orderId of orderIds) {
    const order = await getOrder(orderId);
    if (order && order.state === "active") {
      orders.push(order);
    }
  }

  return orders;
}

/**
 * Get active orders grouped by price pair for efficient price fetching
 */
export async function getActiveOrdersByPricePair(): Promise<Map<string, Order[]>> {
  const orders = await getActiveOrders();
  const grouped = new Map<string, Order[]>();

  for (const order of orders) {
    const key = `${order.priceAsset}:${order.quoteAsset}`;
    const existing = grouped.get(key) || [];
    existing.push(order);
    grouped.set(key, existing);
  }

  return grouped;
}

/**
 * Get orders that have expired
 */
export async function getExpiredOrders(): Promise<Order[]> {
  const now = Date.now();
  const orders = await getActiveOrders();

  return orders.filter((order) => {
    if (!order.expiresAt) return false;
    return order.expiresAt <= now;
  });
}

/**
 * List orders for a user
 */
export async function listUserOrders(
  userAddress: string,
  options: { state?: OrderState; limit?: number } = {},
): Promise<Order[]> {
  const { state, limit = 50 } = options;
  const matchPattern = `${ORDER_PREFIX}*`;
  let cursor = "0";
  const results: Order[] = [];

  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", matchPattern, "COUNT", 100);
    cursor = nextCursor;

    if (keys.length) {
      const values = await redis.mget(keys);
      for (const raw of values) {
        if (results.length >= limit) break;
        if (!raw) continue;

        try {
          const order = JSON.parse(raw) as Order;

          // Filter by user
          if (order.userAddress !== userAddress) continue;
          // Filter by state if specified
          if (state && order.state !== state) continue;

          results.push(order);
        } catch (err) {
          console.error("Failed to parse order from Redis", err);
        }
      }
    }
  } while (cursor !== "0" && results.length < limit);

  // Sort by creation time, newest first
  return results.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Check if an order should trigger based on current price
 */
export function shouldTrigger(order: Order, currentPrice: number): boolean {
  const triggerPrice = parseFloat(order.triggerPrice);

  if (order.priceCondition === "above") {
    return currentPrice >= triggerPrice;
  } else {
    return currentPrice <= triggerPrice;
  }
}

/**
 * Get human-readable order description
 */
export function getOrderDescription(order: Order): string {
  const action = order.side === "buy" ? "Buy" : "Sell";
  const condition = order.priceCondition === "above" ? "rises above" : "falls below";

  return `${order.orderType}: ${action} when ${order.priceAsset} ${condition} ${order.triggerPrice} ${order.quoteAsset}`;
}
