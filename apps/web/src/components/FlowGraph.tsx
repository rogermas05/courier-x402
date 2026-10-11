import type { FeedCall } from "../lib/feed.ts";

/**
 * How one paid call moves, drawn for the selected call.
 *
 * Every node carries a text label, so identity never rests on color alone.
 * Edges light up as the call reaches them; the voice leg animates while the
 * call is live. Payment and refund are both AUSD transfers on Base, so both
 * edges leave the Base node.
 */

interface NodeSpec {
  x: number;
  y: number;
  title: string;
  sub: string;
  color: string;
}

const W = 640;
const H = 400;

function Node({ x, y, title, sub, color, active }: NodeSpec & { active: boolean }) {
  return (
    <g opacity={active ? 1 : 0.45}>
      <rect x={x - 70} y={y - 24} width={140} height={48} rx={12} fill="var(--color-surface-2)" stroke={color} strokeWidth={active ? 1.6 : 1} />
      <text x={x} y={y - 3} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="var(--color-ink)">
        {title}
      </text>
      <text x={x} y={y + 13} textAnchor="middle" fontSize={10.5} fill="var(--color-ink-2)">
        {sub}
      </text>
    </g>
  );
}

function Edge({ d, color, on, flowing, label, lx, ly, anchor = "middle" }: { d: string; color: string; on: boolean; flowing?: boolean; label?: string; lx?: number; ly?: number; anchor?: "start" | "middle" | "end" }) {
  return (
    <g>
      <path d={d} fill="none" stroke={on ? color : "var(--color-axis)"} strokeWidth={on ? 2 : 1.2} strokeDasharray={flowing ? "6 6" : undefined} className={flowing ? "flow-line" : undefined} markerEnd={on ? "url(#arrow-on)" : "url(#arrow-off)"} />
      {label && (
        <text x={lx} y={ly} textAnchor={anchor} fontSize={10.5} fill={on ? "var(--color-ink-2)" : "var(--color-muted)"}>
          {label}
        </text>
      )}
    </g>
  );
}

export function FlowGraph({ call }: { call: FeedCall | undefined }) {
  const paid = Boolean(call);
  const live = call?.status === "calling";
  const dialed = Boolean(call?.outcome) || live;
  const refunded = Boolean(call?.refund?.transaction);

  const agent: NodeSpec = { x: 90, y: 200, title: "Paying agent", sub: "holds AUSD · 0 ETH", color: "var(--color-agent)" };
  const paywall: NodeSpec = { x: 255, y: 80, title: "x402 paywall", sub: "402 → signed retry", color: "var(--color-dispatch)" };
  const base: NodeSpec = { x: 255, y: 320, title: "Base Sepolia", sub: "transferWithAuthorization", color: "var(--color-base)" };
  const voice: NodeSpec = { x: 560, y: 80, title: "ElevenLabs agent", sub: "speaks, listens, hangs up", color: "var(--color-dispatch)" };
  const phone: NodeSpec = { x: 560, y: 320, title: "Phone line", sub: call?.to ?? "via Telnyx SIP", color: "var(--color-ink-2)" };
  const dispatch = { x: 410, y: 200 };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="An agent signs an AUSD authorization, Dispatch settles it on Base Sepolia, an ElevenLabs voice agent places the call, and unused minutes are refunded in AUSD">
      <defs>
        <marker id="arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="var(--color-ink-2)" />
        </marker>
        <marker id="arrow-off" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="var(--color-axis)" />
        </marker>
      </defs>

      <Edge d={`M${agent.x + 40} ${agent.y - 24} Q ${agent.x + 60} ${paywall.y} ${paywall.x - 72} ${paywall.y}`} color="var(--color-agent)" on={paid} label="signed request" lx={118} ly={118} />
      <Edge d={`M${paywall.x} ${paywall.y + 26} L ${base.x} ${base.y - 26}`} color="var(--color-base)" on={paid} label="settle" lx={278} ly={204} anchor="start" />
      <Edge d={`M${base.x + 72} ${base.y} Q ${dispatch.x} ${base.y} ${dispatch.x} ${dispatch.y + 34}`} color="var(--color-ausd)" on={paid} label={call ? `+${call.payment.amountAusd} AUSD` : "AUSD in"} lx={372} ly={312} />
      <Edge d={`M${dispatch.x + 24} ${dispatch.y - 24} Q ${dispatch.x + 50} ${voice.y} ${voice.x - 72} ${voice.y}`} color="var(--color-dispatch)" on={dialed} />
      <Edge d={`M${voice.x} ${voice.y + 26} L ${phone.x} ${phone.y - 26}`} color="var(--color-dispatch)" on={dialed} flowing={live} label={live ? "talking" : dialed ? "call" : ""} lx={585} ly={204} />
      <Edge d={`M${base.x - 72} ${base.y + 8} Q ${agent.x} ${base.y + 8} ${agent.x} ${agent.y + 26}`} color="var(--color-ausd)" on={refunded} label={refunded ? `refund ${call!.refund!.amountAusd} AUSD` : "refund unused minutes"} lx={120} ly={348} />

      <Node {...agent} active={paid} />
      <Node {...paywall} active={paid} />
      <Node {...base} active={paid} />
      <Node {...voice} active={dialed} />
      <Node {...phone} active={dialed} />

      <g>
        {live && <circle cx={dispatch.x} cy={dispatch.y} r={34} fill="var(--color-dispatch)" className="pulse-ring" />}
        <circle cx={dispatch.x} cy={dispatch.y} r={34} fill="var(--color-dispatch)" />
        <path transform={`translate(${dispatch.x - 11} ${dispatch.y - 15}) scale(0.92)`} d="M5 2c.6 0 1.1.4 1.3 1l1 3c.2.5 0 1.1-.4 1.4L5.5 8.5a10 10 0 0 0 4 4l1.1-1.4c.3-.4.9-.6 1.4-.4l3 1c.6.2 1 .7 1 1.3V15.5c0 .8-.7 1.5-1.5 1.5C8 17 2 11 2 3.5 2 2.7 2.7 2 3.5 2Z" fill="#fff" />
        <text x={dispatch.x} y={dispatch.y + 54} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="var(--color-ink)">
          Dispatch
        </text>
      </g>
    </svg>
  );
}
