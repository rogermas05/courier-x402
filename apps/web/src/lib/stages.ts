import type { FeedCall } from "./feed.ts";

/** Where a paid call is, in the order a paying agent experiences it. */

export type Stage = "quoted" | "signed" | "settled" | "on_call" | "outcome" | "refunded";

export const STEPS: { stage: Stage; label: string }[] = [
  { stage: "quoted", label: "402 quote" },
  { stage: "signed", label: "Signed (ERC-3009)" },
  { stage: "settled", label: "Settled on Base" },
  { stage: "on_call", label: "On the call" },
  { stage: "outcome", label: "Outcome" },
  { stage: "refunded", label: "Refund" },
];

const ORDER = STEPS.map((s) => s.stage);

/** A call only exists once paid, so the first three steps are always done. */
export function stageOf(call: FeedCall): { reached: Stage; done: boolean } {
  if (call.status === "calling") return { reached: "on_call", done: false };
  if (call.refund && !call.refund.transaction) return { reached: "refunded", done: false };
  return { reached: "refunded", done: true };
}

export function stepState(call: FeedCall, stage: Stage): "done" | "current" | "pending" | "skipped" {
  if (call.status === "failed" && (stage === "on_call" || stage === "outcome")) return "skipped";
  const { reached, done } = stageOf(call);
  const at = ORDER.indexOf(stage);
  const r = ORDER.indexOf(reached);
  if (at < r || (at === r && done)) return "done";
  return at === r ? "current" : "pending";
}

export function statusLabel(call: FeedCall): string {
  if (call.status === "calling") return "On the call";
  if (call.status === "interrupted") return "Interrupted, under review";
  if (call.refund && !call.refund.transaction) return call.refund.failed ? "Refund pending" : "Sending refund";
  if (call.status === "failed") return "Not placed, refunded";
  return call.outcome?.objectiveMet ? "Objective met" : "Completed";
}

/** What the agent ended up paying: the charge minus whatever came back. */
export function netAusd(call: FeedCall): number {
  const refunded = call.refund?.transaction ? Number(call.refund.amountAusd) : 0;
  return Number(call.payment.amountAusd) - refunded;
}

/** One sentence on what just happened, for the narration banner. */
export function narrate(call: FeedCall): string {
  if (call.status === "calling") return `Paid ${call.payment.amountAusd} AUSD by signature. Dispatch is on the phone for "${call.objective}"`;
  if (call.status === "failed") {
    return call.refund?.transaction
      ? `The call could not be placed, so all ${call.refund.amountAusd} AUSD went back to the agent`
      : `The call could not be placed; a full refund is owed`;
  }
  const outcome = call.outcome?.summary ?? "Call finished";
  const refund = call.refund?.transaction ? ` Refunded ${call.refund.amountAusd} AUSD for unused minutes.` : "";
  return `${outcome}${refund}`;
}
