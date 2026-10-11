import { useRef, type CSSProperties } from "react";
import { useFrame } from "../lib/hooks";
import { clamp } from "../lib/math";
import { scrollState } from "../lib/scroll";

const HEADLINE = ["The agent", "that makes", "the phone call."] as const;
const EXIT_OVER_VIEWPORTS = 0.85;

export function Hero() {
  const innerRef = useRef<HTMLDivElement>(null);

  // The headline recedes as you scroll away, so leaving the hero reads as moving past it.
  useFrame(() => {
    const out = clamp(scrollState.y / (window.innerHeight * EXIT_OVER_VIEWPORTS));
    innerRef.current?.style.setProperty("--out", out.toFixed(3));
  });

  return (
    <section className="hero" id="top" data-phase="hero">
      <div className="container hero__inner" ref={innerRef}>
        <h1 className="hero__title">
          {HEADLINE.map((line, i) => (
            <span className="line" key={line}>
              <span className="line__inner" style={{ "--i": i } as CSSProperties}>
                {line}
              </span>
            </span>
          ))}
        </h1>
        <p className="hero__lede">
          AI agents can't make phone calls. Dispatch can. An agent tells it who to call and what to find out, pays
          in AUSD with a single signature, and gets back a transcript and an outcome. No phone number, no telephony
          account, no gas.
        </p>
      </div>
    </section>
  );
}
