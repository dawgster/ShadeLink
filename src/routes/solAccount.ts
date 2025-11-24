import { Hono } from "hono";
import {
  deriveAgentPublicKey,
  SOLANA_DEFAULT_PATH,
  SolanaAdapter,
} from "../utils/solana";

const app = new Hono();

app.get("/", async (c) => {
  try {
    const path = c.req.query("path") || SOLANA_DEFAULT_PATH;
    const pubkey = await deriveAgentPublicKey(path);
    const { balance, decimals } = await SolanaAdapter.getBalance(
      pubkey.toBase58(),
    );
    const balanceLamports = balance.toString();
    const balanceSol = Number(balance) / 10 ** decimals;

    return c.json({
      address: pubkey.toBase58(),
      path,
      balanceLamports,
      balanceSol,
    });
  } catch (error) {
    console.error("Error getting Solana agent address:", error);
    return c.json({ error: (error as Error).message }, 500);
  }
});

export default app;
