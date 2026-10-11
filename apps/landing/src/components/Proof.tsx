import { CHAIN, LINKS } from "../lib/content";
import { PriceLab } from "./PriceLab";
import { Reveal } from "./primitives";

export function Proof() {
  return (
    <section className="proof section" id="proof" data-phase="ledger">
      <div className="container">
        <Reveal>
          <h2 className="display">Pay for the minutes it uses.</h2>
          <p className="lede">
            x402 moves one fixed amount, signed before the call exists. So the agent authorizes a ceiling in AUSD,
            and when the call ends Dispatch sends back every whole minute it didn't use. The agent never needs gas:
            AUSD supports ERC-3009, so it signs and Dispatch submits.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <PriceLab />
        </Reveal>
        <Reveal>
          <p className="proof__links">
            On Base Sepolia:{" "}
            <a className="link" href={`${LINKS.explorerTx}${CHAIN.paymentTx}`} target="_blank" rel="noreferrer">
              the payment for the call above
            </a>{" "}
            and{" "}
            <a className="link" href={`${LINKS.explorerTx}${CHAIN.refundTx}`} target="_blank" rel="noreferrer">
              its refund
            </a>
            , from{" "}
            <a className="link" href={`${LINKS.explorerAddress}${CHAIN.payer}`} target="_blank" rel="noreferrer">
              an agent wallet that has never held ETH
            </a>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
}
