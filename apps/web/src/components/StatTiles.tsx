import { motion } from "motion/react";
import type { Feed } from "../lib/feed.ts";
import { ausd, duration } from "../lib/format.ts";

function Tile({ label, value, detail, accent }: { label: string; value: string; detail: string; accent: string }) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl border border-line px-4 py-3">
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: accent }} aria-hidden />
      <p className="text-xs text-muted">{label}</p>
      <motion.p key={value} className="tabular mt-1 text-[28px] leading-none font-semibold" initial={{ opacity: 0.3, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {value}
      </motion.p>
      <p className="mt-1.5 text-xs text-ink-2">{detail}</p>
    </div>
  );
}

export function StatTiles({ feed }: { feed: Feed }) {
  const calls = feed.calls;
  const placed = calls.filter((c) => c.outcome).length;
  const talk = calls.reduce((sum, c) => sum + (c.outcome?.durationSeconds ?? 0), 0);
  const paid = calls.reduce((sum, c) => sum + Number(c.payment.amountAusd), 0);
  const refunded = calls.reduce((sum, c) => sum + (c.refund?.transaction ? Number(c.refund.amountAusd) : 0), 0);
  const payers = new Set(calls.map((c) => c.payment.payer.toLowerCase())).size;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Calls hired" value={String(calls.length)} detail={`${placed} placed, ${duration(talk)} on the phone`} accent="var(--color-dispatch)" />
      <Tile label="Paid in AUSD" value={ausd(paid)} detail={`Signed by ${payers} agent wallet${payers === 1 ? "" : "s"}, settled on Base`} accent="var(--color-ausd)" />
      <Tile label="Refunded" value={ausd(refunded)} detail="Unused minutes and calls that never connected, sent back in AUSD" accent="var(--color-ausd)" />
      <Tile label="Gas paid by agents" value="0 ETH" detail="Every payment was an ERC-3009 signature; Dispatch submitted it" accent="var(--color-base)" />
    </div>
  );
}
