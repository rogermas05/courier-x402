import { ArrowDownLeft, ArrowUpRight, ExternalLink } from "lucide-react";
import type { Feed, FeedCall } from "../lib/feed.ts";
import { addressUrl, txUrl } from "../lib/feed.ts";
import { ausd, shortHash } from "../lib/format.ts";
import { netAusd } from "../lib/stages.ts";
import { Panel } from "./Panel.tsx";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-xs last:border-0">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 text-right text-ink">{children}</span>
    </div>
  );
}

function Tx({ feed, hash }: { feed: Feed; hash: string }) {
  return (
    <a href={txUrl(feed, hash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[11.5px] hover:underline" style={{ color: "var(--color-base)" }}>
      {shortHash(hash)} <ExternalLink size={11} aria-hidden />
    </a>
  );
}

/** The x402 receipt for the selected call: who signed what, and where it settled. */
export function PaymentPanel({ feed, call, number }: { feed: Feed; call: FeedCall | undefined; number: number }) {
  return (
    <Panel title="x402 receipt" subtitle={call ? `Call ${number}: one signature, settled on Base Sepolia` : "Select a call"}>
      {call && (
        <div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <p className="flex items-center gap-1 text-[11px] text-muted"><ArrowUpRight size={12} aria-hidden /> Authorized</p>
              <p className="tabular mt-0.5 text-[17px] font-semibold">{call.payment.amountAusd} AUSD</p>
              <p className="text-[11px] text-muted">ceiling for {call.maxMinutes} min</p>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <p className="flex items-center gap-1 text-[11px] text-muted"><ArrowDownLeft size={12} aria-hidden /> Net cost</p>
              <p className="tabular mt-0.5 text-[17px] font-semibold" style={{ color: "var(--color-ausd)" }}>{ausd(netAusd(call))}</p>
              <p className="text-[11px] text-muted">{call.refund?.transaction ? `${call.refund.amountAusd} AUSD refunded` : call.refund ? "refund pending" : "no refund owed"}</p>
            </div>
          </div>
          <Row label="From (agent)">
            <a href={addressUrl(feed, call.payment.payer)} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] hover:underline">{shortHash(call.payment.payer)}</a>
          </Row>
          <Row label="To (Dispatch)">
            <a href={addressUrl(feed, feed.payTo)} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] hover:underline">{shortHash(feed.payTo)}</a>
          </Row>
          <Row label="Method">transferWithAuthorization · gas paid by Dispatch</Row>
          <Row label="Payment"><Tx feed={feed} hash={call.payment.transaction} /></Row>
          <Row label="Refund">{call.refund?.transaction ? <Tx feed={feed} hash={call.refund.transaction} /> : <span className="text-muted">{call.refund ? "pending" : "none owed"}</span>}</Row>
        </div>
      )}
    </Panel>
  );
}
