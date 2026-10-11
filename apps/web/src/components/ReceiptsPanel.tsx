import { ExternalLink } from "lucide-react";
import type { Feed } from "../lib/feed.ts";
import { txUrl } from "../lib/feed.ts";
import { shortHash, timeOfDay } from "../lib/format.ts";
import { Panel } from "./Panel.tsx";

/** Every AUSD movement on Base Sepolia, newest first. */
export function ReceiptsPanel({ feed }: { feed: Feed }) {
  const total = feed.calls.length;
  const rows = feed.calls.flatMap((call, i) => {
    const n = total - i;
    const out = [];
    if (call.refund?.transaction) out.push({ kind: "Refund", hash: call.refund.transaction, amount: `−${call.refund.amountAusd}`, at: call.updatedAt, n, color: "var(--color-ausd)" });
    out.push({ kind: "Payment", hash: call.payment.transaction, amount: `+${call.payment.amountAusd}`, at: call.createdAt, n, color: "var(--color-agent)" });
    return out;
  });

  return (
    <Panel title="On-chain receipts" subtitle={`AUSD on ${feed.network.name}, newest first`}>
      <ul className="flex max-h-[260px] flex-col overflow-y-auto">
        {rows.map((r) => (
          <li key={r.hash} className="flex items-center gap-2.5 border-b border-line py-1.5 text-xs last:border-0">
            <span className="size-2 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
            <span className="w-24 shrink-0 text-ink-2">{r.kind} · {r.n}</span>
            <span className="tabular w-16 shrink-0 text-right text-ink">{r.amount}</span>
            <span className="tabular shrink-0 text-muted">{timeOfDay(r.at)}</span>
            <a href={txUrl(feed, r.hash)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 font-mono text-[11.5px] hover:underline" style={{ color: "var(--color-base)" }}>
              {shortHash(r.hash)} <ExternalLink size={11} aria-hidden />
            </a>
          </li>
        ))}
        {rows.length === 0 && <li className="text-xs text-muted">No transactions yet.</li>}
      </ul>
    </Panel>
  );
}
