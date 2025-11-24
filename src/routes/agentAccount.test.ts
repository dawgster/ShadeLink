import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import agentAccountApp from "./agentAccount";

vi.mock("@neardefi/shade-agent-js", () => ({
  agentAccountId: vi.fn().mockResolvedValue({ accountId: "agent.test" }),
  agent: vi.fn().mockResolvedValue({ balance: "42" }),
}));

const app = new Hono().route("/api/agent-account", agentAccountApp);

describe("agentAccount route", () => {
  it("returns account id and balance", async () => {
    const res = await app.request("/api/agent-account");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accountId).toBe("agent.test");
    expect(body.balance).toBe("42");
  });
});
