import type { Logger } from "./types";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface FlowMetrics {
  // Identity
  intentId: string;
  flowAction: string;
  flowName: string;

  // Timing
  startTime: number;
  endTime?: number;
  durationMs?: number;
  steps: StepMetric[];

  // Outcome
  success: boolean;
  errorType?: ErrorType;
  errorMessage?: string;

  // Flow-specific data
  sourceChain?: string;
  destinationChain?: string;
  sourceAmount?: string;
  swappedAmount?: string;
  txId?: string;
  gasUsed?: string;
}

export interface StepMetric {
  name: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  success: boolean;
  metadata?: Record<string, unknown>;
}

export type ErrorType =
  | "validation"
  | "authorization"
  | "network"
  | "signing"
  | "broadcast"
  | "insufficient_funds"
  | "slippage"
  | "unknown";

// ─── Metrics Collector ──────────────────────────────────────────────────────────

export class MetricsCollector {
  private metrics: FlowMetrics;
  private currentStep: { name: string; startTime: number } | null = null;

  constructor(intentId: string, flowAction: string, flowName: string) {
    this.metrics = {
      intentId,
      flowAction,
      flowName,
      startTime: Date.now(),
      steps: [],
      success: false,
    };
  }

  /**
   * Start timing a step. Call endStep() when done.
   */
  startStep(name: string): void {
    // Auto-end previous step if still open
    if (this.currentStep) {
      this.endStep(true);
    }
    this.currentStep = { name, startTime: Date.now() };
  }

  /**
   * End the current step with success/failure status.
   */
  endStep(success: boolean, metadata?: Record<string, unknown>): void {
    if (!this.currentStep) return;

    const endTime = Date.now();
    this.metrics.steps.push({
      name: this.currentStep.name,
      startTime: this.currentStep.startTime,
      endTime,
      durationMs: endTime - this.currentStep.startTime,
      success,
      metadata,
    });
    this.currentStep = null;
  }

  /**
   * Set source and destination chain for the flow.
   */
  setChains(source: string, destination: string): void {
    this.metrics.sourceChain = source;
    this.metrics.destinationChain = destination;
  }

  /**
   * Set source amount and optionally swapped amount.
   */
  setAmounts(source: string, swapped?: string): void {
    this.metrics.sourceAmount = source;
    if (swapped !== undefined) {
      this.metrics.swappedAmount = swapped;
    }
  }

  /**
   * Set the transaction ID.
   */
  setTxId(txId: string): void {
    this.metrics.txId = txId;
  }

  /**
   * Set gas/compute units used.
   */
  setGasUsed(gas: string): void {
    this.metrics.gasUsed = gas;
  }

  /**
   * Finalize metrics as successful.
   */
  success(): FlowMetrics {
    // Close any open step
    if (this.currentStep) {
      this.endStep(true);
    }

    const endTime = Date.now();
    this.metrics.endTime = endTime;
    this.metrics.durationMs = endTime - this.metrics.startTime;
    this.metrics.success = true;
    return this.metrics;
  }

  /**
   * Finalize metrics as failed.
   */
  failure(errorType: ErrorType, message: string): FlowMetrics {
    // Close any open step as failed
    if (this.currentStep) {
      this.endStep(false);
    }

    const endTime = Date.now();
    this.metrics.endTime = endTime;
    this.metrics.durationMs = endTime - this.metrics.startTime;
    this.metrics.success = false;
    this.metrics.errorType = errorType;
    this.metrics.errorMessage = message;
    return this.metrics;
  }

  /**
   * Get current metrics snapshot.
   */
  getMetrics(): FlowMetrics {
    return { ...this.metrics };
  }
}

// ─── Error Categorization ───────────────────────────────────────────────────────

/**
 * Categorize an error into a known type for metrics.
 */
export function categorizeError(err: unknown): ErrorType {
  const message = (err as Error).message?.toLowerCase() ?? "";

  if (message.includes("signature") || message.includes("authorization")) {
    return "authorization";
  }
  if (message.includes("timeout") || message.includes("network") || message.includes("econnrefused")) {
    return "network";
  }
  if (message.includes("insufficient") || message.includes("balance")) {
    return "insufficient_funds";
  }
  if (message.includes("slippage")) {
    return "slippage";
  }
  if (message.includes("broadcast") || message.includes("submit") || message.includes("sendtransaction")) {
    return "broadcast";
  }
  if (message.includes("sign")) {
    return "signing";
  }
  if (message.includes("valid") || message.includes("missing") || message.includes("required")) {
    return "validation";
  }

  return "unknown";
}

// ─── Metrics Emission ───────────────────────────────────────────────────────────

/**
 * Emit flow metrics as structured log data.
 */
export function emitFlowMetrics(metrics: FlowMetrics, logger: Logger): void {
  const logData = {
    // Standard field for log aggregators
    metric_type: "flow_execution",

    // Identity
    intent_id: metrics.intentId,
    flow_action: metrics.flowAction,
    flow_name: metrics.flowName,

    // Timing
    duration_ms: metrics.durationMs,
    step_count: metrics.steps.length,
    steps: metrics.steps.map((s) => ({
      name: s.name,
      duration_ms: s.durationMs,
      success: s.success,
    })),

    // Outcome
    success: metrics.success,
    error_type: metrics.errorType,
    error_message: metrics.errorMessage,

    // Flow data
    source_chain: metrics.sourceChain,
    destination_chain: metrics.destinationChain,
    source_amount: metrics.sourceAmount,
    swapped_amount: metrics.swappedAmount,
    tx_id: metrics.txId,
    gas_used: metrics.gasUsed,
  };

  if (metrics.success) {
    logger.info("flow.completed", logData);
  } else {
    logger.error("flow.failed", logData);
  }
}
