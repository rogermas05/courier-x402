/** The shape GET /v1/feed returns. Mirrors apps/api/src/feed.ts. */

export type CallStatus = "calling" | "completed" | "failed" | "interrupted";

export interface Turn {
  speaker: "agent" | "other";
  text: string;
  atSeconds: number;
}

export interface FeedCall {
  id: string;
  status: CallStatus;
  createdAt: string;
  updatedAt: string;
  objective: string;
  onBehalfOf: string | null;
  to: string;
  maxMinutes: number;
  payment: { payer: string; amountAusd: string; transaction: string };
  refund: { amountAusd: string; transaction: string | null; failed: boolean } | null;
  outcome: {
    summary: string;
    objectiveMet: boolean;
    artifacts: Record<string, string>;
    humanFollowUp: string | null;
    caveats: string[];
    callStatus: string;
    durationSeconds: number;
    transcript: Turn[];
  } | null;
  error: string | null;
}

export interface Feed {
  generatedAt: string;
  network: { id: string; name: string; explorer: string };
  asset: { symbol: string; address: string; decimals: number };
  payTo: string;
  provider: string;
  pricing: { baseAusd: string; perMinuteAusd: string };
  calls: FeedCall[];
}

export const txUrl = (feed: Feed, hash: string) => `${feed.network.explorer}/tx/${hash}`;
export const addressUrl = (feed: Feed, address: string) => `${feed.network.explorer}/address/${address}`;
