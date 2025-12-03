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

// GET /api/burrow-positions/:accountId
// Returns user's positions in Burrow (supplied, collateral, borrowed)
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

// GET /api/burrow-positions/derive?nearPublicKey=...
// Derives the NEAR implicit account for a given NEAR public key
app.get("/derive", async (c) => {
  const nearPublicKey = c.req.query("nearPublicKey");

  if (!nearPublicKey) {
    return c.json({ error: "nearPublicKey query parameter is required" }, 400);
  }

  try {
    const { accountId, publicKey } = await deriveNearImplicitAccount(
      NEAR_DEFAULT_PATH,
      nearPublicKey,
    );

    return c.json({
      nearPublicKey,
      derivedAccountId: accountId,
      derivedPublicKey: publicKey,
    });
  } catch (err) {
    console.error("Failed to derive NEAR account", err);
    return c.json(
      { error: (err as Error).message || "Failed to derive account" },
      500,
    );
  }
});

// GET /api/burrow-positions/user?nearPublicKey=...
// Gets positions for the derived account from a NEAR public key
app.get("/user", async (c) => {
  const nearPublicKey = c.req.query("nearPublicKey");

  if (!nearPublicKey) {
    return c.json({ error: "nearPublicKey query parameter is required" }, 400);
  }

  try {
    // Derive the NEAR implicit account
    const { accountId } = await deriveNearImplicitAccount(
      NEAR_DEFAULT_PATH,
      nearPublicKey,
    );

    // Get positions for the derived account
    const positions = await getUserPositions(accountId);

    return c.json({
      nearPublicKey,
      derivedAccountId: accountId,
      ...positions,
    });
  } catch (err) {
    console.error("Failed to fetch Burrow positions", err);
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
      derive: "GET /api/burrow-positions/derive?nearPublicKey=... - Derive NEAR implicit account",
      user: "GET /api/burrow-positions/user?nearPublicKey=... - Get positions for derived account",
      positions: "GET /api/burrow-positions/:accountId - Get positions by account ID directly",
    },
    examples: {
      markets: "/api/burrow-positions/markets",
      derive: "/api/burrow-positions/derive?nearPublicKey=ed25519:...",
      user: "/api/burrow-positions/user?nearPublicKey=ed25519:...",
      positions: "/api/burrow-positions/abc123def456...  (64-char implicit account)",
    },
  });
});

export default app;
