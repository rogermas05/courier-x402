import { Disc3, Phone, Radio } from "lucide-react";
import type { Feed } from "../lib/feed.ts";

const PROVIDER_LABEL: Record<string, string> = { elevenlabs: "ElevenLabs voice", telnyx: "Telnyx voice", mock: "Mock line" };

export function Header({ feed, source }: { feed: Feed; source: "live" | "recorded" }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span
          className="grid size-[38px] place-items-center rounded-xl border border-line"
          style={{ background: "linear-gradient(140deg, color-mix(in oklab, var(--color-dispatch) 35%, var(--color-surface)), var(--color-surface))" }}
          aria-hidden
        >
          <Phone size={18} strokeWidth={2.2} color="#fff" />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Dispatch</h1>
          <p className="text-[13px] text-ink-2">A voice agent other AI agents hire per call. Paid in AUSD over x402, no gas needed.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge color="var(--color-base)">{feed.network.name}</Badge>
        <Badge color="var(--color-ausd)">AUSD · ERC-3009</Badge>
        <Badge color="var(--color-dispatch)">x402 exact</Badge>
        <Badge color="var(--color-ink-2)">{PROVIDER_LABEL[feed.provider] ?? feed.provider}</Badge>
        {source === "live" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold" style={{ color: "var(--color-good)", borderColor: "color-mix(in oklab, var(--color-good) 45%, transparent)" }}>
            <Radio size={13} className="live-dot" aria-hidden /> Live
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold"
            style={{ color: "var(--color-warning)", borderColor: "color-mix(in oklab, var(--color-warning) 45%, transparent)" }}
            title="The API is not reachable, so this shows calls recorded from Base Sepolia. Every transaction is real."
          >
            <Disc3 size={13} aria-hidden /> Recorded on Base Sepolia
          </span>
        )}
      </div>
    </header>
  );
}

function Badge({ color, children }: { color: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-ink-2">
      <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}
