import { Hono } from "hono";
import { getStatus, listStatuses } from "../state/status";

const app = new Hono();

app.get("/", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "", 10) || 50;
    const intents = await listStatuses(limit);
    return c.json({ intents });
  } catch (err) {
    console.error("Failed to list intent statuses", err);
    return c.json({ error: "Failed to list intent statuses" }, 500);
  }
});

app.get("/:intentId", async (c) => {
  const intentId = c.req.param("intentId");
  try {
    const status = await getStatus(intentId);
    if (!status) {
      return c.json({ intentId, status: "unknown" }, 404);
    }
    return c.json({ intentId, ...status });
  } catch (err) {
    console.error("Failed to read intent status", err);
    return c.json({ error: "Failed to read intent status" }, 500);
  }
});

export default app;
