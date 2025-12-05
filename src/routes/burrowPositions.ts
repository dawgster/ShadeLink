import { Hono } from "hono";
import {
  listBurrowMarkets,
  getUserPositions,
} from "../utils/burrow";
import {
  deriveNearImplicitAccount,
  NEAR_DEFAULT_PATH,
} from "../utils/chainSignature";

const app = new Hono();

// GET /api/burrow-positions/markets
// Returns all available Burrow markets with their current rates and liquidity
app.get("/markets", async (c) => {
  try {
    const markets = await listBurrowMarkets();

    return c.json({
      markets,
      count: markets.length,
    });
  } catch (err) {
    console.error("Failed to fetch Burrow markets", err);
    return c.json(
      { error: (err as Error).message || "Failed to fetch markets" },
      500,
    );
  }
});

// GET /api/burrow-positions/derive?userDestination=...
// Derives the NEAR implicit account for a given user destination (NEAR account ID)
app.get("/derive", async (c) => {
  const userDestination = c.req.query("userDestination");

  if (!userDestination) {
    return c.json({ error: "userDestination query parameter is required" }, 400);
  }

  try {
    console.log(`[burrowPositions] Deriving NEAR account for userDestination: ${userDestination}`);

    const { accountId, publicKey } = await deriveNearImplicitAccount(
      NEAR_DEFAULT_PATH,
      undefined, // no nearPublicKey
      userDestination,
    );

    console.log(`[burrowPositions] Derived NEAR account: ${accountId}`);

    return c.json({
      userDestination,
      derivedAccountId: accountId,
      derivedPublicKey: publicKey,
    });
  } catch (err) {
    console.error("[burrowPositions] Failed to derive NEAR account", err);
    return c.json(
      { error: (err as Error).message || "Failed to derive account" },
      500,
    );
  }
});

// GET /api/burrow-positions/user?userDestination=...
// Gets positions for the derived account from a user destination (NEAR account ID)
app.get("/user", async (c) => {
  console.log(`[burrowPositions] /user route hit`);
  console.log(`[burrowPositions] Full URL: ${c.req.url}`);
  console.log(`[burrowPositions] Query params:`, c.req.query());

  const userDestination = c.req.query("userDestination");

  if (!userDestination) {
    return c.json({ error: "userDestination query parameter is required" }, 400);
  }

  try {
    // Derive the NEAR implicit account using userDestination for custody isolation
    // This matches the derivation used in burrowDeposit/burrowWithdraw flows
    console.log(`[burrowPositions] === DERIVATION DEBUG ===`);
    console.log(`[burrowPositions] userDestination input: ${userDestination}`);
    console.log(`[burrowPositions] NEAR_DEFAULT_PATH: ${NEAR_DEFAULT_PATH}`);
    console.log(`[burrowPositions] Expected derivation path: ${NEAR_DEFAULT_PATH},${userDestination}`);

    const { accountId, publicKey } = await deriveNearImplicitAccount(
      NEAR_DEFAULT_PATH,
      undefined, // no nearPublicKey
      userDestination,
    );

    console.log(`[burrowPositions] === DERIVED RESULT ===`);
    console.log(`[burrowPositions] Derived accountId: ${accountId}`);
    console.log(`[burrowPositions] Derived publicKey: ${publicKey}`);
    console.log(`[burrowPositions] Now fetching positions for: ${accountId}`);

    // Get positions for the derived account
    const positions = await getUserPositions(accountId);

    console.log(`[burrowPositions] === POSITIONS RESULT ===`);
    console.log(`[burrowPositions] Positions response:`, JSON.stringify(positions, null, 2));

    return c.json({
      userDestination,
      derivedAccountId: accountId,
      derivedPublicKey: publicKey,
      ...positions,
    });
  } catch (err) {
    console.error("[burrowPositions] Failed to fetch Burrow positions", err);
    return c.json(
      { error: (err as Error).message || "Failed to fetch positions" },
      500,
    );
  }
});

// GET /api/burrow-positions
// Returns instructions for using the API
app.get("/", async (c) => {
  return c.json({
    message: "Burrow Finance Positions API",
    endpoints: {
      markets: "GET /api/burrow-positions/markets - List all available markets",
      derive: "GET /api/burrow-positions/derive?userDestination=... - Derive NEAR implicit account",
      user: "GET /api/burrow-positions/user?userDestination=... - Get positions for derived account",
      positions: "GET /api/burrow-positions/:accountId - Get positions by account ID directly",
    },
    examples: {
      markets: "/api/burrow-positions/markets",
      derive: "/api/burrow-positions/derive?userDestination=user.near",
      user: "/api/burrow-positions/user?userDestination=user.near",
      positions: "/api/burrow-positions/abc123def456...  (64-char implicit account)",
    },
  });
});

// GET /api/burrow-positions/:accountId
// Returns user's positions in Burrow (supplied, collateral, borrowed)
// NOTE: This route must be last to avoid matching /markets, /derive, /user
app.get("/:accountId", async (c) => {
  const accountId = c.req.param("accountId");

  if (!accountId) {
    return c.json({ error: "accountId is required" }, 400);
  }

  try {
    const positions = await getUserPositions(accountId);

    return c.json(positions);
  } catch (err) {
    console.error("Failed to fetch Burrow positions", err);
    return c.json(
      { error: (err as Error).message || "Failed to fetch positions" },
      500,
    );
  }
});

export default app;
