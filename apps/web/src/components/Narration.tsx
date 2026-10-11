import { CheckCircle2, PhoneCall, RotateCcw, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { FeedCall } from "../lib/feed.ts";
import { timeOfDay } from "../lib/format.ts";
import { narrate } from "../lib/stages.ts";

/** One sentence on the latest call: the caption track for the demo. */
export function Narration({ call, number }: { call: FeedCall | undefined; number: number }) {
  if (!call) {
    return (
      <div className="glass flex h-16 items-center rounded-2xl border border-line px-4 text-[15px] text-ink-2">
        No calls yet. Run <code className="mx-1.5 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px]">npm run hire</code> and watch it arrive here.
      </div>
    );
  }
  const failed = call.status === "failed";
  const Icon = call.status === "calling" ? PhoneCall : failed ? XCircle : call.refund?.transaction ? RotateCcw : CheckCircle2;
  const accent = failed ? "var(--color-critical)" : call.status === "calling" ? "var(--color-dispatch)" : "var(--color-ausd)";

  return (
    <div className="glass flex h-16 items-center gap-4 overflow-hidden rounded-2xl border border-line px-4">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`${call.id}-${call.status}-${call.refund?.transaction ?? ""}`}
          className="flex min-w-0 flex-1 items-center gap-3.5"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${accent} 18%, transparent)`, color: accent }}>
            <Icon size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <span className="font-semibold text-ink-2">Call {number}</span>
              <span className="tabular">{timeOfDay(call.updatedAt)}</span>
            </div>
            <p className="truncate text-[16px] font-medium">{narrate(call)}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
