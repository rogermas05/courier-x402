import { CHAIN, HIRE, LINKS } from "../lib/content";
import { shortHash } from "../lib/math";
import { CopyButton, Reveal } from "./primitives";

export function FinalCall() {
  return (
    <section className="final" id="hire" data-phase="orb">
      <div className="container final__inner">
        <Reveal>
          <h2 className="final__title">Let it make the call.</h2>
          <p className="final__links">
            <a className="link" href={LINKS.repo} target="_blank" rel="noreferrer">
              Source on GitHub
            </a>
            <a className="link" href={LINKS.x402} target="_blank" rel="noreferrer">
              About x402
            </a>
            <a className="link" href={LINKS.agora} target="_blank" rel="noreferrer">
              About AUSD
            </a>
          </p>
        </Reveal>
      </div>

      {/* Everything another agent needs to hire Dispatch, as plain text it can read. */}
      <dl className="hire container">
        <div>
          <dt>Request</dt>
          <dd>
            <code>
              {HIRE.route} {HIRE.body}
            </code>
          </dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>
            {HIRE.protocol}, {HIRE.asset} on {CHAIN.network}. {HIRE.price}.
          </dd>
        </div>
        <div>
          <dt>AUSD</dt>
          <dd>
            <code title={CHAIN.ausd}>{shortHash(CHAIN.ausd, 10, 6)}</code> <CopyButton value={CHAIN.ausd} label="AUSD address" />
          </dd>
        </div>
        <div>
          <dt>MCP</dt>
          <dd>
            <code>{HIRE.mcp}</code> <CopyButton value={HIRE.mcp} label="MCP command" />
          </dd>
        </div>
      </dl>

      <footer className="footer container">
        <p>Dispatch</p>
        <p>Built for the Agora AUSD track. It runs on Base Sepolia with test AUSD.</p>
      </footer>
    </section>
  );
}
