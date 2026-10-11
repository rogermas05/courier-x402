import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import type { FeedCall } from "../lib/feed.ts";
import { Panel } from "./Panel.tsx";

export function OutcomePanel({ call, number }: { call: FeedCall | undefined; number: number }) {
  const o = call?.outcome;
  return (
    <Panel title="Outcome" subtitle={call ? `Call ${number}: what the paying agent gets back` : "Select a call"}>
      {!call && <p className="text-xs text-muted">Nothing selected.</p>}
      {call && !o && (
        <p className="text-sm text-ink-2">{call.status === "calling" ? "Waiting for the call to end." : call.status === "failed" ? "The call was never placed, so there is no outcome. The full payment was refunded." : "No outcome recorded."}</p>
      )}
      {o && (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: o.objectiveMet ? "var(--color-good)" : "var(--color-warning)" }}>
            {o.objectiveMet ? <CheckCircle2 size={14} aria-hidden /> : <CircleDashed size={14} aria-hidden />}
            {o.objectiveMet ? "Objective met" : "Objective not met"}
          </p>
          <p className="text-[13.5px] leading-snug">{o.summary}</p>
          {Object.keys(o.artifacts).length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 text-xs">
              {Object.entries(o.artifacts).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {o.humanFollowUp && <p className="text-xs text-ink-2"><span className="font-semibold text-ink">Still to do: </span>{o.humanFollowUp}</p>}
          {o.caveats.slice(0, 2).map((c) => (
            <p key={c} className="flex gap-1.5 text-[11.5px] text-muted">
              <CircleAlert size={12} className="mt-0.5 shrink-0" aria-hidden /> {c}
            </p>
          ))}
        </div>
      )}
    </Panel>
  );
}
