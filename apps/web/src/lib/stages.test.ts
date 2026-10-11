import { describe, expect, it } from "vitest";
import type { FeedCall } from "./feed.ts";
import { netAusd, statusLabel, stepState } from "./stages.ts";

const call = (overrides: Partial<FeedCall>): FeedCall => ({
  id: "a",
  status: "completed",
  createdAt: "2026-10-11T21:03:00Z",
  updatedAt: "2026-10-11T21:04:00Z",
  objective: "Ask their favourite colour.",
  onBehalfOf: "Roger",
  to: "+1 ••• ••• ••40",
  maxMinutes: 3,
  payment: { payer: "0xBuyer", amountAusd: "0.2", transaction: "0xpay" },
  refund: { amountAusd: "0.1", transaction: "0xrefund", failed: false },
  outcome: null,
  error: null,
  ...overrides,
});

describe("stepState", () => {
  it("marks every step done once the refund has gone out", () => {
    expect(stepState(call({}), "refunded")).toBe("done");
  });

  it("shows a live call on the phone, with the refund still ahead", () => {
    const live = call({ status: "calling", refund: null });
    expect(stepState(live, "settled")).toBe("done");
    expect(stepState(live, "on_call")).toBe("current");
    expect(stepState(live, "refunded")).toBe("pending");
  });

  it("skips the call steps for a call that was never placed", () => {
    const failed = call({ status: "failed", refund: { amountAusd: "0.2", transaction: "0xr", failed: false } });
    expect(stepState(failed, "on_call")).toBe("skipped");
    expect(stepState(failed, "refunded")).toBe("done");
  });

  it("holds the refund step open while a refund is owed", () => {
    const owed = call({ refund: { amountAusd: "0.1", transaction: null, failed: true } });
    expect(stepState(owed, "refunded")).toBe("current");
    expect(statusLabel(owed)).toBe("Refund pending");
  });
});

describe("netAusd", () => {
  it("subtracts only refunds that were actually sent", () => {
    expect(netAusd(call({}))).toBeCloseTo(0.1);
    expect(netAusd(call({ refund: { amountAusd: "0.1", transaction: null, failed: true } }))).toBeCloseTo(0.2);
  });
});
