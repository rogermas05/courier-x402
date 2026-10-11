import { describe, expect, it } from "vitest";
import { CHAIN, CALL } from "./content";
import { quote } from "./price";

describe("quote", () => {
  it("reproduces the real call: 0.2 authorized for 3 minutes, 0.1 back after 16 seconds", () => {
    const q = quote(CHAIN.allowedMinutes, CALL.durationSeconds);
    expect(q.authorized).toBe(Number(CHAIN.authorizedAusd));
    expect(q.refunded).toBe(Number(CHAIN.refundedAusd));
  });

  it("bills part-minutes as whole ones and never more than allowed", () => {
    expect(quote(10, 61).billedMinutes).toBe(2);
    expect(quote(5, 3600).billedMinutes).toBe(5);
    expect(quote(5, 3600).refunded).toBe(0);
  });

  it("refunds everything when the call never connects", () => {
    expect(quote(10, 0, false)).toMatchObject({ refunded: 0.55, net: 0 });
  });
});
