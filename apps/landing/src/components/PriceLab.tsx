import { useId, useState } from "react";
import { formatAusd, quote } from "../lib/price";

const MAX_MINUTES = 30;

/** Pick what to allow and how long the call runs; see what is signed, kept and sent back. */
export function PriceLab() {
  const [allowed, setAllowed] = useState(10);
  const [minutes, setMinutes] = useState(2);
  const [connected, setConnected] = useState(true);
  const allowedId = useId();
  const usedId = useId();
  const used = Math.min(minutes, allowed);
  const q = quote(allowed, used * 60, connected);

  return (
    <div className="lab price-lab">
      <div className="price-lab__controls">
        <label className="lab__label" htmlFor={allowedId}>
          The agent allows up to <strong>{allowed} min</strong>
        </label>
        <input id={allowedId} type="range" min={1} max={MAX_MINUTES} value={allowed} onChange={(e) => setAllowed(Number(e.target.value))} />
        <label className="lab__label" htmlFor={usedId}>
          The call actually runs <strong>{connected ? `${used} min` : "nowhere, nobody picks up"}</strong>
        </label>
        <input id={usedId} type="range" min={1} max={MAX_MINUTES} value={used} disabled={!connected} onChange={(e) => setMinutes(Number(e.target.value))} />
        <label className="price-lab__toggle">
          <input type="checkbox" checked={!connected} onChange={(e) => setConnected(!e.target.checked)} /> Nobody answers
        </label>
      </div>
      <dl className="price-lab__ledger">
        <div>
          <dt>Signed, settled on Base</dt>
          <dd>{formatAusd(q.authorized)}</dd>
        </div>
        <div className="is-refund">
          <dt>Sent back after the call</dt>
          <dd>{formatAusd(q.refunded)}</dd>
        </div>
        <div className="is-net">
          <dt>What the call cost</dt>
          <dd>{formatAusd(q.net)}</dd>
        </div>
      </dl>
    </div>
  );
}
