import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { Feed } from "../lib/feed.ts";
import { Panel } from "./Panel.tsx";

const SNIPPETS = [
  {
    label: "Any HTTP client",
    note: "The first request returns 402 with the AUSD price in the PAYMENT-REQUIRED header.",
    code: `curl -i -X POST $DISPATCH_URL/v1/calls \\
  -H 'content-type: application/json' \\
  -d '{"to":"+14155550123","objective":"Ask if they have a table for two at 8pm","max_minutes":5}'`,
  },
  {
    label: "Claude Code (MCP)",
    note: "Three tools: place_phone_call, get_phone_call, phone_call_wallet. The wallet signs only AUSD, under a per-call cap.",
    code: "claude mcp add dispatch -- npm run --silent mcp --prefix /path/to/dispatch-x402",
  },
  {
    label: "Terminal",
    note: "Quotes, signs, waits for the call, then prints the outcome, the payment and the refund.",
    code: 'npm run hire -- --to +14155550123 --objective "Ask if they have a table for two at 8pm" --minutes 5',
  },
];

export function HirePanel({ feed }: { feed: Feed }) {
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const snippet = SNIPPETS[tab]!;

  const copy = async () => {
    await navigator.clipboard.writeText(snippet.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Panel title="Hire Dispatch" subtitle={`${feed.pricing.baseAusd} AUSD per call plus ${feed.pricing.perMinuteAusd} AUSD per allowed minute. Unused minutes are refunded.`}>
      <div className="mb-2 flex gap-1" role="tablist">
        {SNIPPETS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            role="tab"
            aria-selected={i === tab}
            onClick={() => setTab(i)}
            className="rounded-lg px-2.5 py-1 text-xs transition-colors"
            style={i === tab ? { background: "color-mix(in oklab, var(--color-dispatch) 22%, var(--color-surface-2))", color: "var(--color-ink)" } : { color: "var(--color-ink-2)" }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="relative rounded-xl border border-line bg-[#0b1020] p-3 pr-10">
        <pre className="overflow-x-auto font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">{snippet.code}</pre>
        <button type="button" onClick={copy} className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted hover:text-ink" aria-label="Copy">
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">{snippet.note}</p>
    </Panel>
  );
}
