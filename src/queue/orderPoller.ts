/**
 * Order Poller
 * Monitors prices and triggers conditional orders when price conditions are met.
 */

import { config } from "../config";
import {
  getActiveOrdersByPricePair,
  getExpiredOrders,
  shouldTrigger,
  setOrderState,
  Order,
  getOrderDescription,
} from "../state/orders";
import { getPrice, formatPrice } from "../utils/priceFeed";
import { RedisQueueClient } from "./redis";
import { ValidatedIntent, OrderExecuteMetadata } from "./types";

// How often to check prices
const ORDER_POLL_INTERVAL_MS = 15_000; // 15 seconds

/**
 * Start the order price monitoring poller
 */
export async function startOrderPoller() {
  if (!config.enableQueue) {
    console.log("[orderPoller] Queue disabled, not starting order poller");
    return;
  }

  console.log("[orderPoller] Starting conditional order poller");
  console.log(`[orderPoller] Poll interval: ${ORDER_POLL_INTERVAL_MS}ms`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await pollOrders();
    } catch (err) {
      console.error("[orderPoller] Error polling orders:", err);
    }

    await delay(ORDER_POLL_INTERVAL_MS);
  }
}

/**
 * Poll all active orders, check prices, trigger if conditions met
 */
async function pollOrders() {
  // Get orders grouped by price pair for efficient fetching
  const ordersByPair = await getActiveOrdersByPricePair();

  if (ordersByPair.size === 0) {
    return;
  }

  console.log(`[orderPoller] Checking ${ordersByPair.size} price pairs`);

  const queue = new RedisQueueClient();
  let triggeredCount = 0;

  // Check each price pair
  for (const [pairKey, orders] of ordersByPair) {
    const [priceAsset, quoteAsset] = pairKey.split(":");

    try {
      // Fetch current price
      const priceData = await getPrice(priceAsset, quoteAsset);
      const currentPrice = priceData.price;

      console.log(`[orderPoller] ${priceAsset}/${quoteAsset}: ${formatPrice(currentPrice)} (${orders.length} orders)`);

      // Check each order against current price
      for (const order of orders) {
        if (shouldTrigger(order, currentPrice)) {
          console.log(`[orderPoller] TRIGGERED: ${getOrderDescription(order)}`);
          console.log(`[orderPoller]   Current: ${formatPrice(currentPrice)}, Trigger: ${order.triggerPrice}`);

          await triggerOrder(order, formatPrice(currentPrice), queue);
          triggeredCount++;
        }
      }
    } catch (error) {
      console.error(`[orderPoller] Error fetching price for ${pairKey}:`, error);
    }
  }

  // Handle expired orders
  await handleExpiredOrders();

  if (triggeredCount > 0) {
    console.log(`[orderPoller] Triggered ${triggeredCount} orders`);
  }
}

/**
 * Trigger an order for execution
 */
async function triggerOrder(
  order: Order,
  triggeredPrice: string,
  queue: RedisQueueClient,
) {
  // Create execution intent
  const metadata: OrderExecuteMetadata = {
    action: "order-execute",
    orderId: order.orderId,
    triggeredPrice,
  };

  const intent: ValidatedIntent = {
    intentId: `order-exec-${order.orderId}-${Date.now()}`,
    sourceChain: order.sourceChain,
    sourceAsset: order.sourceAsset,
    sourceAmount: order.amount,
    destinationChain: order.destinationChain,
    finalAsset: order.targetAsset,
    userDestination: order.userAddress,
    agentDestination: order.agentAddress,
    slippageBps: order.slippageTolerance,
    metadata,
  };

  // Mark as triggered to prevent duplicate triggers
  await setOrderState(order.orderId, "triggered", { triggeredPrice });

  // Enqueue for execution
  await queue.enqueueIntent(intent);

  console.log(`[orderPoller] Enqueued order execution: ${intent.intentId}`);
}

/**
 * Handle orders that have expired
 */
async function handleExpiredOrders() {
  const expiredOrders = await getExpiredOrders();

  for (const order of expiredOrders) {
    console.log(`[orderPoller] Order ${order.orderId} expired`);
    await setOrderState(order.orderId, "expired");
    // Note: Funds stay in custody - user must call order-cancel to get refund
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check orders once (for testing or manual trigger)
 */
export async function checkOrders(): Promise<{
  checked: number;
  triggered: number;
}> {
  const ordersByPair = await getActiveOrdersByPricePair();
  let checked = 0;
  let triggered = 0;

  const queue = new RedisQueueClient();

  for (const [pairKey, orders] of ordersByPair) {
    const [priceAsset, quoteAsset] = pairKey.split(":");

    try {
      const priceData = await getPrice(priceAsset, quoteAsset);

      for (const order of orders) {
        checked++;
        if (shouldTrigger(order, priceData.price)) {
          await triggerOrder(order, formatPrice(priceData.price), queue);
          triggered++;
        }
      }
    } catch (error) {
      console.error(`[orderPoller] Error checking ${pairKey}:`, error);
    }
  }

  return { checked, triggered };
}

/**
 * Get price monitoring status
 */
export async function getPollerStatus(): Promise<{
  activePairs: number;
  activeOrders: number;
  pairs: Array<{ pair: string; orderCount: number }>;
}> {
  const ordersByPair = await getActiveOrdersByPricePair();

  const pairs = Array.from(ordersByPair.entries()).map(([pair, orders]) => ({
    pair,
    orderCount: orders.length,
  }));

  return {
    activePairs: ordersByPair.size,
    activeOrders: pairs.reduce((sum, p) => sum + p.orderCount, 0),
    pairs,
  };
}
