import { Hono } from "hono";
import { SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { requestSignature } from "@neardefi/shade-agent-js";
import { deriveAgentPublicKey, getSolanaConnection, SOLANA_DEFAULT_PATH } from "../utils/solana";
import { parseSignature } from "../utils/signature";

const app = new Hono();

app.get("/", async (c) => {
  try {
    const connection = getSolanaConnection();
    const agentPubkey = await deriveAgentPublicKey();
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    // Build a trivial self-transfer to exercise signing; we do not broadcast.
    const messageV0 = new TransactionMessage({
      payerKey: agentPubkey,
      recentBlockhash: blockhash,
      instructions: [
        SystemProgram.transfer({
          fromPubkey: agentPubkey,
          toPubkey: agentPubkey,
          lamports: 1n,
        }),
      ],
    }).compileToV0Message();

    const tx = new VersionedTransaction(messageV0);
    const payloadHex = Buffer.from(tx.message.serialize()).toString("hex");

    const signRes = await requestSignature({
      path: SOLANA_DEFAULT_PATH,
      payload: payloadHex,
      keyType: "Eddsa",
    });

    if (!signRes.signature) {
      return c.json({ error: "No signature returned" }, 500);
    }

    const parsed = parseSignature(signRes.signature);
    if (!parsed) {
      return c.json({ error: "Unsupported signature encoding" }, 500);
    }

    tx.signatures[0] = parsed;

    return c.json({
      agentPublicKey: agentPubkey.toBase58(),
      payloadHexLength: payloadHex.length,
      signatureHex: Buffer.from(parsed).toString("hex"),
      status: "signed",
    });
  } catch (err) {
    console.error("Chain signature test failed", err);
    return c.json({ error: (err as Error).message }, 500);
  }
});

export default app;
