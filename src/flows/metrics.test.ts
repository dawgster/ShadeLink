import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  MetricsCollector,
  categorizeError,
  emitFlowMetrics,
  type FlowMetrics,
} from "./metrics";
import type { Logger } from "./types";

describe("MetricsCollector", () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector("test-intent-1", "test-action", "Test Flow");
  });

  describe("constructor", () => {
    it("initializes with correct identity fields", () => {
      const metrics = collector.getMetrics();
      expect(metrics.intentId).toBe("test-intent-1");
      expect(metrics.flowAction).toBe("test-action");
      expect(metrics.flowName).toBe("Test Flow");
    });

    it("initializes with start time", () => {
      const before = Date.now();
      const newCollector = new MetricsCollector("id", "action", "name");
      const after = Date.now();

      const metrics = newCollector.getMetrics();
      expect(metrics.startTime).toBeGreaterThanOrEqual(before);
      expect(metrics.startTime).toBeLessThanOrEqual(after);
    });

    it("initializes with empty steps array", () => {
      const metrics = collector.getMetrics();
      expect(metrics.steps).toEqual([]);
    });

    it("initializes with success=false", () => {
      const metrics = collector.getMetrics();
      expect(metrics.success).toBe(false);
    });
  });

  describe("step timing", () => {
    it("records a step with timing", () => {
      collector.startStep("test-step");
      collector.endStep(true);

      const metrics = collector.getMetrics();
      expect(metrics.steps).toHaveLength(1);
      expect(metrics.steps[0].name).toBe("test-step");
      expect(metrics.steps[0].success).toBe(true);
      expect(metrics.steps[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it("records step metadata", () => {
      collector.startStep("test-step");
      collector.endStep(true, { key: "value" });

      const metrics = collector.getMetrics();
      expect(metrics.steps[0].metadata).toEqual({ key: "value" });
    });

    it("records failed step", () => {
      collector.startStep("failing-step");
      collector.endStep(false);

      const metrics = collector.getMetrics();
      expect(metrics.steps[0].success).toBe(false);
    });

    it("auto-ends previous step when starting new one", () => {
      collector.startStep("step-1");
      collector.startStep("step-2");
      collector.endStep(true);

      const metrics = collector.getMetrics();
      expect(metrics.steps).toHaveLength(2);
      expect(metrics.steps[0].name).toBe("step-1");
      expect(metrics.steps[1].name).toBe("step-2");
    });

    it("handles endStep without startStep gracefully", () => {
      collector.endStep(true);
      const metrics = collector.getMetrics();
      expect(metrics.steps).toHaveLength(0);
    });
  });

  describe("setters", () => {
    it("sets chains", () => {
      collector.setChains("near", "solana");
      const metrics = collector.getMetrics();
      expect(metrics.sourceChain).toBe("near");
      expect(metrics.destinationChain).toBe("solana");
    });

    it("sets source amount", () => {
      collector.setAmounts("1000000");
      const metrics = collector.getMetrics();
      expect(metrics.sourceAmount).toBe("1000000");
    });

    it("sets source and swapped amounts", () => {
      collector.setAmounts("1000000", "995000");
      const metrics = collector.getMetrics();
      expect(metrics.sourceAmount).toBe("1000000");
      expect(metrics.swappedAmount).toBe("995000");
    });

    it("sets txId", () => {
      collector.setTxId("0x123abc");
      const metrics = collector.getMetrics();
      expect(metrics.txId).toBe("0x123abc");
    });

    it("sets gas used", () => {
      collector.setGasUsed("21000");
      const metrics = collector.getMetrics();
      expect(metrics.gasUsed).toBe("21000");
    });
  });

  describe("success", () => {
    it("finalizes metrics with success=true", () => {
      const metrics = collector.success();
      expect(metrics.success).toBe(true);
    });

    it("calculates duration", () => {
      const metrics = collector.success();
      expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(metrics.endTime).toBeDefined();
    });

    it("closes open step", () => {
      collector.startStep("open-step");
      const metrics = collector.success();
      expect(metrics.steps).toHaveLength(1);
      expect(metrics.steps[0].success).toBe(true);
    });
  });

  describe("failure", () => {
    it("finalizes metrics with success=false", () => {
      const metrics = collector.failure("network", "Connection timeout");
      expect(metrics.success).toBe(false);
    });

    it("sets error type and message", () => {
      const metrics = collector.failure("validation", "Missing required field");
      expect(metrics.errorType).toBe("validation");
      expect(metrics.errorMessage).toBe("Missing required field");
    });

    it("calculates duration", () => {
      const metrics = collector.failure("unknown", "error");
      expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(metrics.endTime).toBeDefined();
    });

    it("closes open step as failed", () => {
      collector.startStep("failing-step");
      const metrics = collector.failure("signing", "Signature rejected");
      expect(metrics.steps).toHaveLength(1);
      expect(metrics.steps[0].success).toBe(false);
    });
  });
});

describe("categorizeError", () => {
  it("categorizes authorization errors", () => {
    expect(categorizeError(new Error("Invalid signature"))).toBe("authorization");
    expect(categorizeError(new Error("Authorization failed"))).toBe("authorization");
  });

  it("categorizes network errors", () => {
    expect(categorizeError(new Error("Request timeout"))).toBe("network");
    expect(categorizeError(new Error("Network unreachable"))).toBe("network");
    expect(categorizeError(new Error("ECONNREFUSED"))).toBe("network");
  });

  it("categorizes insufficient funds errors", () => {
    expect(categorizeError(new Error("Insufficient balance"))).toBe("insufficient_funds");
    expect(categorizeError(new Error("Insufficient funds for transfer"))).toBe("insufficient_funds");
  });

  it("categorizes slippage errors", () => {
    expect(categorizeError(new Error("Slippage tolerance exceeded"))).toBe("slippage");
  });

  it("categorizes broadcast errors", () => {
    expect(categorizeError(new Error("Failed to broadcast transaction"))).toBe("broadcast");
    expect(categorizeError(new Error("sendTransaction failed"))).toBe("broadcast");
  });

  it("categorizes signing errors", () => {
    expect(categorizeError(new Error("Failed to sign message"))).toBe("signing");
  });

  it("categorizes validation errors", () => {
    expect(categorizeError(new Error("Invalid input"))).toBe("validation");
    expect(categorizeError(new Error("Missing required field"))).toBe("validation");
  });

  it("returns unknown for unrecognized errors", () => {
    expect(categorizeError(new Error("Something went wrong"))).toBe("unknown");
    expect(categorizeError(new Error(""))).toBe("unknown");
    expect(categorizeError({})).toBe("unknown");
  });
});

describe("emitFlowMetrics", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
  });

  it("logs success metrics with info level", () => {
    const metrics: FlowMetrics = {
      intentId: "intent-1",
      flowAction: "test-action",
      flowName: "Test Flow",
      startTime: Date.now() - 1000,
      endTime: Date.now(),
      durationMs: 1000,
      steps: [],
      success: true,
      sourceChain: "near",
      destinationChain: "solana",
      sourceAmount: "1000000",
      txId: "0x123",
    };

    emitFlowMetrics(metrics, mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith(
      "flow.completed",
      expect.objectContaining({
        metric_type: "flow_execution",
        intent_id: "intent-1",
        flow_action: "test-action",
        success: true,
        duration_ms: 1000,
      })
    );
  });

  it("logs failure metrics with error level", () => {
    const metrics: FlowMetrics = {
      intentId: "intent-1",
      flowAction: "test-action",
      flowName: "Test Flow",
      startTime: Date.now() - 500,
      endTime: Date.now(),
      durationMs: 500,
      steps: [],
      success: false,
      errorType: "network",
      errorMessage: "Connection failed",
    };

    emitFlowMetrics(metrics, mockLogger);

    expect(mockLogger.error).toHaveBeenCalledWith(
      "flow.failed",
      expect.objectContaining({
        metric_type: "flow_execution",
        success: false,
        error_type: "network",
        error_message: "Connection failed",
      })
    );
  });

  it("includes step timing in log data", () => {
    const metrics: FlowMetrics = {
      intentId: "intent-1",
      flowAction: "test-action",
      flowName: "Test Flow",
      startTime: Date.now() - 1000,
      endTime: Date.now(),
      durationMs: 1000,
      steps: [
        { name: "step-1", startTime: 0, endTime: 100, durationMs: 100, success: true },
        { name: "step-2", startTime: 100, endTime: 1000, durationMs: 900, success: true },
      ],
      success: true,
    };

    emitFlowMetrics(metrics, mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith(
      "flow.completed",
      expect.objectContaining({
        step_count: 2,
        steps: [
          { name: "step-1", duration_ms: 100, success: true },
          { name: "step-2", duration_ms: 900, success: true },
        ],
      })
    );
  });
});
