import { PhoneCall, PhoneOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import type { FeedCall } from "../lib/feed.ts";
import { clock } from "../lib/format.ts";
import { Panel } from "./Panel.tsx";

export function TranscriptPanel({ call, number }: { call: FeedCall | undefined; number: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const turns = call?.outcome?.transcript ?? [];

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [call?.id, turns.length]);

  const live = call?.status === "calling";
  return (
    <Panel
      className="flex-1"
      title="Transcript"
      subtitle={call ? `Call ${number}: Dispatch ↔ ${call.to}` : "What was said, turn by turn"}
      action={
        live ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--color-dispatch)" }}>
            <PhoneCall size={12} className="live-dot" aria-hidden /> On the call
          </span>
        ) : null
      }
    >
      <div ref={scroller} className="flex h-full flex-col gap-1.5 overflow-y-auto pr-1">
        {!call && <p className="pt-10 text-center text-xs text-muted">Select a call.</p>}
        {live && <p className="pt-10 text-center text-xs text-muted">The ElevenLabs agent is talking now. The transcript arrives when the call ends.</p>}
        {call && call.status === "failed" && (
          <p className="flex items-center justify-center gap-2 pt-10 text-xs text-muted">
            <PhoneOff size={13} aria-hidden /> Never dialed. {call.error ? "The provider refused the call." : ""}
          </p>
        )}
        <AnimatePresence initial={false}>
          {turns.map((turn, i) => {
            const isAgent = turn.speaker === "agent";
            return (
              <motion.div key={`${call!.id}-${i}`} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.6) }} className={`flex flex-col ${isAgent ? "items-end" : "items-start"}`}>
                <span className="mb-0.5 text-[10px] text-muted">
                  {isAgent ? "Dispatch (AI)" : "Them"} · <span className="tabular">{clock(turn.atSeconds)}</span>
                </span>
                <p
                  className="max-w-[88%] rounded-xl px-2.5 py-1.5 text-[12.5px] leading-snug"
                  style={
                    isAgent
                      ? { background: "color-mix(in oklab, var(--color-dispatch) 26%, var(--color-surface))", borderTopRightRadius: 4 }
                      : { background: "var(--color-surface-2)", borderTopLeftRadius: 4 }
                  }
                >
                  {turn.text}
                </p>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Panel>
  );
}
