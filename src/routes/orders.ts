import { Hono } from "hono";
import { config } from "../config";
import { validateIntent } from "../queue/validation";
import { RedisQueueClient } from "../queue/redis";
import { setStatus } from "../state/status";
import {
  getOrder,
  listUserOrders,
  markOrderFunded,
  Order,
  getOrderDescription,
} from "../state/orders";
import { getPollerStatus, checkOrders } from "../queue/orderPoller";
import { deriveOrderAgentAddress } from "../flows/orderCreate";
import { verifyNearSignature, isNearSignature } from "../utils/nearSignature";
import { verifySolanaSignature } from "../utils/solanaSignature";
import type {
  IntentMessage,
  IntentChain,
  OrderType,
  OrderSide,
  PriceCondition,
  OrderCreateMetadata,
  OrderCancelMetadata,
  UserSignature,
} from "../queue/types";

const app = new Hono();
const queueClient = new RedisQueueClient();

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CreateOrderRequest {
  orderId: string;
  orderType: OrderType;
  side: OrderSide;
  priceAsset: string;
  quoteAsset: string;
  triggerPrice: string;
  priceCondition: PriceCondition;
  sourceChain: IntentChain;
  sourceAsset: string;
  amount: string;
  destinationChain: IntentChain;
  targetAsset: string;
  userDestination: string;
  expiresAt?: number;
  slippageTolerance?: number;
  userSignature?: UserSignature;
}

interface CancelOrderRequest {
  orderId: string;
  userDestination: string;
  refundFunds?: boolean;
  userSignature: UserSignature;
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

function verifySignature(sig: UserSignature | undefined): boolean {
  if (!sig) return false;

  if (isNearSignature(sig)) {
    return verifyNearSignature(sig);
  }

  return verifySolanaSignature({
    message: sig.message,
    signature: sig.signature,
    publicKey: sig.publicKey,
  });
}

// ─── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/orders - Create a new conditional order
 *
 * Creates a limit, stop-loss, or take-profit order.
 * Returns the custody address where user should deposit funds to activate.
 */
app.post("/", async (c) => {
  if (!config.enableQueue) {
    return c.json({ error: "Queue consumer is disabled" }, 503);
  }

  let payload: CreateOrderRequest;
  try {
    payload = await c.req.json<CreateOrderRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Validate required fields
  const requiredFields = [
    "orderId",
    "orderType",
    "side",
    "priceAsset",
    "quoteAsset",
    "triggerPrice",
    "priceCondition",
    "sourceChain",
    "sourceAsset",
    "amount",
    "destinationChain",
    "targetAsset",
    "userDestination",
  ];

  for (const field of requiredFields) {
    if (!(field in payload) || !payload[field as keyof CreateOrderRequest]) {
      return c.json({ error: `${field} is required` }, 400);
    }
  }

  // Validate orderId length
  if (payload.orderId.length < 8) {
    return c.json({ error: "orderId must be at least 8 characters" }, 400);
  }

  // Validate order type
  const validOrderTypes: OrderType[] = ["limit", "stop-loss", "take-profit"];
  if (!validOrderTypes.includes(payload.orderType)) {
    return c.json(
      { error: `orderType must be one of: ${validOrderTypes.join(", ")}` },
      400
    );
  }

  // Validate side
  const validSides: OrderSide[] = ["buy", "sell"];
  if (!validSides.includes(payload.side)) {
    return c.json({ error: `side must be one of: ${validSides.join(", ")}` }, 400);
  }

  // Validate price condition
  const validConditions: PriceCondition[] = ["above", "below"];
  if (!validConditions.includes(payload.priceCondition)) {
    return c.json(
      { error: `priceCondition must be one of: ${validConditions.join(", ")}` },
      400
    );
  }

  // Validate order logic
  if (payload.orderType === "limit") {
    if (payload.side === "buy" && payload.priceCondition !== "below") {
      return c.json(
        { error: "Limit buy orders should trigger when price falls below target" },
        400
      );
    }
    if (payload.side === "sell" && payload.priceCondition !== "above") {
      return c.json(
        { error: "Limit sell orders should trigger when price rises above target" },
        400
      );
    }
  }

  if (payload.orderType === "stop-loss") {
    if (payload.side !== "sell" || payload.priceCondition !== "below") {
      return c.json(
        { error: "Stop-loss orders should sell when price falls below target" },
        400
      );
    }
  }

  if (payload.orderType === "take-profit") {
    if (payload.side !== "sell" || payload.priceCondition !== "above") {
      return c.json(
        { error: "Take-profit orders should sell when price rises above target" },
        400
      );
    }
  }

  // Verify signature if provided
  if (payload.userSignature) {
    if (!verifySignature(payload.userSignature)) {
      return c.json({ error: "Invalid userSignature" }, 403);
    }
    console.info("[orders] Signature verified", {
      orderId: payload.orderId,
      publicKey: payload.userSignature.publicKey,
    });
  }

  // Derive custody address for preview
  const custodyChain = payload.sourceChain as "solana" | "near";
  if (custodyChain !== "solana" && custodyChain !== "near") {
    return c.json(
      {
        error: `Direct custody on ${payload.sourceChain} not yet supported. Use Solana or NEAR as sourceChain.`,
      },
      400
    );
  }

  let custodyAddress: string;
  try {
    custodyAddress = await deriveOrderAgentAddress(payload.orderId, custodyChain);
  } catch (err) {
    console.error("[orders] Failed to derive custody address", err);
    return c.json({ error: "Failed to derive custody address" }, 500);
  }

  // Build order-create metadata
  const metadata: OrderCreateMetadata = {
    action: "order-create",
    orderId: payload.orderId,
    orderType: payload.orderType,
    side: payload.side,
    priceAsset: payload.priceAsset,
    quoteAsset: payload.quoteAsset,
    triggerPrice: payload.triggerPrice,
    priceCondition: payload.priceCondition,
    sourceChain: payload.sourceChain,
    sourceAsset: payload.sourceAsset,
    amount: payload.amount,
    destinationChain: payload.destinationChain,
    targetAsset: payload.targetAsset,
    expiresAt: payload.expiresAt,
    slippageTolerance: payload.slippageTolerance,
  };

  // Create intent message
  const intentId = `order-create-${payload.orderId}-${Date.now()}`;
  const intentMessage: IntentMessage = {
    intentId,
    sourceChain: payload.sourceChain,
    sourceAsset: payload.sourceAsset,
    sourceAmount: payload.amount,
    destinationChain: payload.destinationChain,
    finalAsset: payload.targetAsset,
    userDestination: payload.userDestination,
    agentDestination: custodyAddress,
    slippageBps: payload.slippageTolerance,
    metadata,
    userSignature: payload.userSignature,
  };

  try {
    const validatedIntent = validateIntent(intentMessage);
    await queueClient.enqueueIntent(validatedIntent);
    await setStatus(validatedIntent.intentId, { state: "pending" });

    console.info("[orders] Order creation intent enqueued", {
      orderId: payload.orderId,
      intentId,
      custodyAddress,
      orderType: payload.orderType,
    });

    return c.json(
      {
        intentId,
        orderId: payload.orderId,
        state: "pending",
        custodyAddress,
        custodyChain,
        message: `Deposit ${payload.amount} ${payload.sourceAsset} to ${custodyAddress} to activate the order`,
        order: {
          orderType: payload.orderType,
          side: payload.side,
          priceAsset: payload.priceAsset,
          quoteAsset: payload.quoteAsset,
          triggerPrice: payload.triggerPrice,
          priceCondition: payload.priceCondition,
        },
      },
      202
    );
  } catch (err) {
    console.error("[orders] Failed to enqueue order creation", err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

/**
 * GET /api/orders/:orderId - Get order details
 */
app.get("/:orderId", async (c) => {
  const orderId = c.req.param("orderId");

  const order = await getOrder(orderId);
  if (!order) {
    return c.json({ error: `Order ${orderId} not found` }, 404);
  }

  return c.json({
    ...order,
    description: getOrderDescription(order),
  });
});

/**
 * GET /api/orders - List orders for a user
 *
 * Query params:
 * - userAddress: (required) User's address
 * - state: (optional) Filter by order state
 * - limit: (optional) Max results (default 50)
 */
app.get("/", async (c) => {
  const userAddress = c.req.query("userAddress");
  const state = c.req.query("state");
  const limit = parseInt(c.req.query("limit") || "50", 10);

  if (!userAddress) {
    return c.json({ error: "userAddress query parameter is required" }, 400);
  }

  const orders = await listUserOrders(userAddress, {
    state: state as Order["state"] | undefined,
    limit,
  });

  return c.json({
    count: orders.length,
    orders: orders.map((order) => ({
      ...order,
      description: getOrderDescription(order),
    })),
  });
});

/**
 * POST /api/orders/:orderId/cancel - Cancel an order
 *
 * Requires userSignature to authorize cancellation.
 * Optionally refunds remaining funds (default: true).
 */
app.post("/:orderId/cancel", async (c) => {
  if (!config.enableQueue) {
    return c.json({ error: "Queue consumer is disabled" }, 503);
  }

  const orderId = c.req.param("orderId");

  let payload: CancelOrderRequest;
  try {
    payload = await c.req.json<CancelOrderRequest>();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  // Validate required fields
  if (!payload.userDestination) {
    return c.json({ error: "userDestination is required" }, 400);
  }
  if (!payload.userSignature) {
    return c.json({ error: "userSignature is required for cancellation" }, 403);
  }

  // Verify signature
  if (!verifySignature(payload.userSignature)) {
    return c.json({ error: "Invalid userSignature" }, 403);
  }

  // Check order exists
  const order = await getOrder(orderId);
  if (!order) {
    return c.json({ error: `Order ${orderId} not found` }, 404);
  }

  // Verify ownership
  if (order.userAddress !== payload.userDestination) {
    return c.json({ error: "Only the order owner can cancel this order" }, 403);
  }

  // Check state
  if (order.state === "cancelled") {
    return c.json({ message: "Order already cancelled", order });
  }
  if (order.state === "executed") {
    return c.json({ error: "Cannot cancel an executed order" }, 400);
  }

  // Build cancel metadata
  const metadata: OrderCancelMetadata = {
    action: "order-cancel",
    orderId,
    refundFunds: payload.refundFunds !== false,
  };

  // Create intent message
  const intentId = `order-cancel-${orderId}-${Date.now()}`;
  const intentMessage: IntentMessage = {
    intentId,
    sourceChain: order.sourceChain,
    sourceAsset: order.sourceAsset,
    sourceAmount: order.amount,
    destinationChain: order.agentChain,
    finalAsset: order.sourceAsset,
    userDestination: payload.userDestination,
    agentDestination: order.agentAddress,
    metadata,
    userSignature: payload.userSignature,
  };

  try {
    const validatedIntent = validateIntent(intentMessage);
    await queueClient.enqueueIntent(validatedIntent);
    await setStatus(validatedIntent.intentId, { state: "pending" });

    console.info("[orders] Order cancellation intent enqueued", {
      orderId,
      intentId,
      refundFunds: metadata.refundFunds,
    });

    return c.json(
      {
        intentId,
        orderId,
        state: "pending",
        message: metadata.refundFunds
          ? "Order cancellation initiated, funds will be refunded"
          : "Order cancellation initiated",
      },
      202
    );
  } catch (err) {
    console.error("[orders] Failed to enqueue order cancellation", err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

/**
 * POST /api/orders/:orderId/fund - Mark order as funded (for deposit monitoring)
 *
 * Called when deposit is detected to activate the order.
 * In production, this should be called by a deposit monitor.
 */
app.post("/:orderId/fund", async (c) => {
  const orderId = c.req.param("orderId");

  const order = await getOrder(orderId);
  if (!order) {
    return c.json({ error: `Order ${orderId} not found` }, 404);
  }

  if (order.state !== "pending") {
    return c.json({
      message: `Order is ${order.state}, not pending`,
      order: {
        ...order,
        description: getOrderDescription(order),
      },
    });
  }

  try {
    const updated = await markOrderFunded(orderId);

    console.info("[orders] Order marked as funded", {
      orderId,
      state: updated.state,
    });

    return c.json({
      message: "Order activated",
      order: {
        ...updated,
        description: getOrderDescription(updated),
      },
    });
  } catch (err) {
    console.error("[orders] Failed to mark order as funded", err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

/**
 * GET /api/orders/status/poller - Get order poller status
 */
app.get("/status/poller", async (c) => {
  const status = await getPollerStatus();
  return c.json(status);
});

/**
 * POST /api/orders/status/check - Manually trigger order check
 *
 * For testing/debugging. Checks all active orders against current prices.
 */
app.post("/status/check", async (c) => {
  if (!config.enableQueue) {
    return c.json({ error: "Queue consumer is disabled" }, 503);
  }

  const result = await checkOrders();
  return c.json(result);
});

export default app;
