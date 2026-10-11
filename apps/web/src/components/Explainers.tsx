import { Bot, CircleDollarSign, Fingerprint } from "lucide-react";
import type { ReactNode } from "react";
import { Panel } from "./Panel.tsx";

function Explainer({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return (
    <Panel title={title} subtitle={subtitle} action={<span className="text-muted">{icon}</span>}>
      <div className="space-y-2 text-[12.5px] leading-relaxed text-ink-2">{children}</div>
    </Panel>
  );
}

export function Explainers() {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Explainer icon={<Bot size={16} aria-hidden />} title="Who hires Dispatch" subtitle="Agents that hit a wall at a phone number">
        <p>A support agent that needs the vendor's phone line. A claims agent that has to ask the carrier why a claim failed. A shopping agent that wants to know if the table is free tonight.</p>
        <p>None of them has a phone number, a telephony account or a voice. Dispatch turns the call into a tool they pay for per use.</p>
      </Explainer>
      <Explainer icon={<Fingerprint size={16} aria-hidden />} title="One request, one signature" subtitle="How x402 prices and collects a call">
        <p>The agent posts what the call must achieve. Dispatch answers 402 with a price in AUSD, worked out from the minutes the agent allows.</p>
        <p>The agent signs an ERC-3009 authorization for exactly that amount and retries. Dispatch settles it on Base and only then dials. A request Dispatch would refuse is refused before any quote, for free.</p>
      </Explainer>
      <Explainer icon={<CircleDollarSign size={16} aria-hidden />} title="Why AUSD" subtitle="A dollar that moves like an API call">
        <p>AUSD is fully reserved and supports transferWithAuthorization natively, so the agent only ever signs. Dispatch submits the transfer and pays the gas.</p>
        <p>The agent's wallet holds dollars and nothing else. Unused minutes come back in the same dollars, so the price of a call is what it actually used.</p>
      </Explainer>
    </div>
  );
}
