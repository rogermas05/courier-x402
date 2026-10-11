import { Bot, Check, Minus } from "lucide-react";
import type { FeedCall } from "../lib/feed.ts";
import { duration } from "../lib/format.ts";
import { STEPS, statusLabel, stepState } from "../lib/stages.ts";
import { Panel } from "./Panel.tsx";

function Stepper({ call }: { call: FeedCall }) {
  const color = call.status === "failed" ? "var(--color-critical)" : "var(--color-dispatch)";
  return (
    <ol className="mt-2.5 flex items-center" aria-label="Payment and call stages">
      {STEPS.map((step, i) => {
        const state = stepState(call, step.stage);
        const done = state === "done";
        return (
          <li key={step.stage} className="flex flex-1 items-center last:flex-none">
            <span
              title={step.label}
              className="grid size-4 shrink-0 place-items-center rounded-full"
              style={{
                background: done ? color : state === "current" ? "var(--color-surface)" : "var(--color-surface-2)",
                boxShadow: state === "current" ? `0 0 0 2px ${color}` : undefined,
              }}
            >
              {done && <Check size={10} strokeWidth={3.5} color="#fff" aria-hidden />}
              {state === "skipped" && <Minus size={10} strokeWidth={3} className="text-muted" aria-hidden />}
              <span className="sr-only">{`${step.label}: ${state}`}</span>
            </span>
            {i < STEPS.length - 1 && <span className="mx-0.5 h-0.5 flex-1 rounded" style={{ background: done ? color : "var(--color-line)" }} />}
          </li>
        );
      })}
    </ol>
  );
}

interface CallsPanelProps {
  calls: FeedCall[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export function CallsPanel({ calls, selectedId, onSelect }: CallsPanelProps) {
  return (
    <Panel className="flex-1" title="Calls" subtitle="Payment settles on Base before Dispatch dials">
      <div className="flex h-full flex-col gap-2 overflow-y-auto pr-1">
        {calls.length === 0 && <p className="pt-10 text-center text-xs text-muted">No calls yet.</p>}
        {calls.map((call, i) => {
          const selected = call.id === selectedId;
          return (
            <button
              key={call.id}
              type="button"
              onClick={() => onSelect(call.id)}
              className="rounded-xl border px-3 py-2.5 text-left transition-colors hover:border-axis"
              style={{
                borderColor: selected ? "color-mix(in oklab, var(--color-dispatch) 60%, transparent)" : "var(--color-line)",
                background: selected ? "color-mix(in oklab, var(--color-dispatch) 8%, var(--color-surface))" : "var(--color-surface)",
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[13px] font-semibold">
                  <span className="text-muted">Call {calls.length - i} · </span>
                  {call.objective}
                </p>
                <span className="tabular shrink-0 text-xs text-ink-2">{call.payment.amountAusd} AUSD</span>
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-2">
                <Bot size={12} style={{ color: "var(--color-agent)" }} aria-hidden />
                {call.onBehalfOf ? `For ${call.onBehalfOf}` : "Agent"} → <span className="tabular">{call.to}</span>
              </p>
              <Stepper call={call} />
              <div className="mt-1.5 flex justify-between text-[11px] text-muted">
                <span>{statusLabel(call)}</span>
                {call.outcome && <span className="tabular">{call.outcome.transcript.length} turns · {duration(call.outcome.durationSeconds)}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
