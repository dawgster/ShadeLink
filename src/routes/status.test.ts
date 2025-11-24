import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import statusApp from "./status";

const { getStatusMock } = vi.hoisted(() => ({
  getStatusMock: vi.fn(),
}));

vi.mock("../state/status", () => ({
  getStatus: getStatusMock,
}));

const app = new Hono().route("/api/status", statusApp);

describe("status route", () => {
  it("returns known status", async () => {
    getStatusMock.mockResolvedValue({ state: "succeeded", txId: "tx123" });

    const res = await app.request("/api/status/intent-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.intentId).toBe("intent-1");
    expect(body.state).toBe("succeeded");
    expect(body.txId).toBe("tx123");
  });

  it("returns 404 for unknown intent", async () => {
    getStatusMock.mockResolvedValue(null);

    const res = await app.request("/api/status/missing");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe("unknown");
  });
});
