import { OrderCreateMetadata, ValidatedIntent } from "../queue/types";
import { deriveAgentPublicKey, SOLANA_DEFAULT_PATH } from "../utils/solana";
import { deriveNearAgentAccount } from "../utils/near";
import { getPrice, parsePrice } from "../utils/priceFeed";
import { flowRegistry } from "./registry";
import { requireUserDestination } from "../utils/authorization";
import {
  createOrder,
  getOrder,
  Order,
  getOrderDescription,
} from "../state/orders";
import type { FlowDefinition, FlowContext, FlowResult } from "./types";

// ─── Helper Functions ──────────────────────────────────────────────────────────

/**
 * Derive the agent custody address for an order
 */
async function deriveOrderAgentAddress(
  orderId: string,
  chain: "solana" | "near",
): Promise<string> {
  const derivationSuffix = `order-${orderId}`;

  if (chain === "solana") {
    const publicKey = await deriveAgentPublicKey(SOLANA_DEFAULT_PATH, derivationSuffix);
    return publicKey.toBase58();
  } else if (chain === "near") {
    const { accountId } = await deriveNearAgentAccount(undefined, derivationSuffix);
    return accountId;
  }

  throw new Error(`Unsupported order custody chain: ${chain}`);
}

/**
 * Validate order metadata
 */
function validateOrderMetadata(metadata: OrderCreateMetadata): void {
  if (!metadata.orderId || metadata.orderId.length < 8) {
    throw new Error("orderId must be at least 8 characters");
  }

  const validOrderTypes = ["limit", "stop-loss", "take-profit"];
  if (!validOrderTypes.includes(metadata.orderType)) {
    throw new Error(`Invalid orderType. Must be one of: ${validOrderTypes.join(", ")}`);
  }

  const validSides = ["buy", "sell"];
  if (!validSides.includes(metadata.side)) {
    throw new Error(`Invalid side. Must be one of: ${validSides.join(", ")}`);
  }

  const validConditions = ["above", "below"];
  if (!validConditions.includes(metadata.priceCondition)) {
    throw new Error(`Invalid priceCondition. Must be one of: ${validConditions.join(", ")}`);
  }

  // Validate trigger price
  try {
    const price = parsePrice(metadata.triggerPrice);
    if (price <= 0) {
      throw new Error("triggerPrice must be positive");
    }
  } catch {
    throw new Error(`Invalid triggerPrice: ${metadata.triggerPrice}`);
  }

  if (!metadata.priceAsset) {
    throw new Error("priceAsset is required");
  }

  if (!metadata.quoteAsset) {
    throw new Error("quoteAsset is required");
  }

  if (!metadata.amount || BigInt(metadata.amount) <= 0n) {
    throw new Error("amount must be positive");
  }

  // Validate expiry if provided
  if (metadata.expiresAt && metadata.expiresAt < Date.now()) {
    throw new Error("expiresAt must be in the future");
  }

  // Validate order type logic
  if (metadata.orderType === "limit") {
    // Limit buy: execute when price falls below trigger (buy low)
    // Limit sell: execute when price rises above trigger (sell high)
    if (metadata.side === "buy" && metadata.priceCondition !== "below") {
      throw new Error("Limit buy orders should trigger when price falls below target");
    }
    if (metadata.side === "sell" && metadata.priceCondition !== "above") {
      throw new Error("Limit sell orders should trigger when price rises above target");
    }
  }

  if (metadata.orderType === "stop-loss") {
    // Stop-loss: sell when price falls below trigger (cut losses)
    if (metadata.side !== "sell" || metadata.priceCondition !== "below") {
      throw new Error("Stop-loss orders should sell when price falls below target");
    }
  }

  if (metadata.orderType === "take-profit") {
    // Take-profit: sell when price rises above trigger (lock in gains)
    if (metadata.side !== "sell" || metadata.priceCondition !== "above") {
      throw new Error("Take-profit orders should sell when price rises above target");
    }
  }
}

// ─── Flow Definition ───────────────────────────────────────────────────────────

const orderCreateFlow: FlowDefinition<OrderCreateMetadata> = {
  action: "order-create",
  name: "Order Create",
  description: "Create a conditional order (limit, stop-loss, or take-profit)",

  supportedChains: {
    source: ["near", "ethereum", "base", "arbitrum", "solana"],
    destination: ["solana", "near", "ethereum", "base", "arbitrum"],
  },

  requiredMetadataFields: [
    "action",
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
  ],
  optionalMetadataFields: ["expiresAt", "slippageTolerance"],

  isMatch: (intent): intent is ValidatedIntent & { metadata: OrderCreateMetadata } => {
    const meta = intent.metadata as OrderCreateMetadata | undefined;
    return (
      meta?.action === "order-create" &&
      !!meta.orderId &&
      !!meta.orderType &&
      !!meta.triggerPrice
    );
  },

  validateMetadata: (metadata) => {
    validateOrderMetadata(metadata);
  },

  validateAuthorization: async (intent, ctx) => {
    requireUserDestination(intent, ctx, "Order create");
  },

  execute: async (intent, ctx): Promise<FlowResult> => {
    const { config, logger } = ctx;
    const meta = intent.metadata;

    logger.info(`Creating ${meta.orderType} order: ${meta.orderId}`);
    logger.info(`${meta.side.toUpperCase()} when ${meta.priceAsset} ${meta.priceCondition} ${meta.triggerPrice} ${meta.quoteAsset}`);

    // Check if order already exists
    const existing = await getOrder(meta.orderId);
    if (existing) {
      if (existing.state === "active") {
        logger.info(`Order ${meta.orderId} already exists and is active`);
        return { txId: `existing-order-${meta.orderId}` };
      }
      throw new Error(`Order ${meta.orderId} already exists in state: ${existing.state}`);
    }

    // Get current price to show user how far from trigger
    try {
      const currentPrice = await getPrice(meta.priceAsset, meta.quoteAsset);
      const triggerPrice = parsePrice(meta.triggerPrice);
      const priceDiff = ((triggerPrice - currentPrice.price) / currentPrice.price * 100).toFixed(2);
      logger.info(`Current ${meta.priceAsset} price: ${currentPrice.price} ${meta.quoteAsset} (${priceDiff}% from trigger)`);
    } catch (error) {
      logger.warn(`Could not fetch current price: ${error}`);
    }

    // Determine custody chain
    const custodyChain = meta.sourceChain as "solana" | "near";
    if (custodyChain !== "solana" && custodyChain !== "near") {
      throw new Error(
        `Direct custody on ${meta.sourceChain} not yet supported. ` +
        `Use Solana or NEAR as sourceChain.`
      );
    }

    // Derive custody address
    const agentAddress = await deriveOrderAgentAddress(meta.orderId, custodyChain);
    logger.info(`Derived order custody address: ${agentAddress} (${custodyChain})`);

    // Create order record
    const order: Order = {
      orderId: meta.orderId,
      state: "pending",

      orderType: meta.orderType,
      side: meta.side,

      priceAsset: meta.priceAsset,
      quoteAsset: meta.quoteAsset,
      triggerPrice: meta.triggerPrice,
      priceCondition: meta.priceCondition,

      sourceChain: meta.sourceChain,
      sourceAsset: meta.sourceAsset,
      amount: meta.amount,
      destinationChain: meta.destinationChain,
      targetAsset: meta.targetAsset,

      userAddress: intent.userDestination!,
      userChain: intent.sourceChain,

      agentAddress,
      agentChain: custodyChain,

      slippageTolerance: meta.slippageTolerance ?? 300,
      expiresAt: meta.expiresAt,

      createdAt: Date.now(),
      createIntentId: intent.intentId,
    };

    await createOrder(order);
    logger.info(`Created order: ${getOrderDescription(order)}`);

    // Handle funding
    if (intent.intentsDepositAddress) {
      await ctx.setStatus("awaiting_intents", {
        orderId: meta.orderId,
        depositAddress: agentAddress,
        message: `Awaiting ${meta.amount} deposit via intents`,
      });

      return {
        txId: `awaiting-funding-${meta.orderId}`,
        intentsDepositAddress: intent.intentsDepositAddress,
      };
    }

    // Same-chain deposit
    await ctx.setStatus("awaiting_deposit", {
      orderId: meta.orderId,
      depositAddress: agentAddress,
      expectedAmount: meta.amount,
      message: `Send ${meta.amount} ${meta.sourceAsset} to ${agentAddress} to activate order`,
    });

    logger.info(`Order ${meta.orderId} created, awaiting deposit to ${agentAddress}`);
    if (meta.expiresAt) {
      logger.info(`Order expires: ${new Date(meta.expiresAt).toISOString()}`);
    }

    return {
      txId: `order-created-${meta.orderId}`,
      intentsDepositAddress: agentAddress,
    };
  },
};

// ─── Self-Registration ─────────────────────────────────────────────────────────

flowRegistry.register(orderCreateFlow);

// ─── Exports ───────────────────────────────────────────────────────────────────

export { orderCreateFlow, deriveOrderAgentAddress };
