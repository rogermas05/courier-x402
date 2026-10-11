import { PRICING } from "./content";

/**
 * The same rule the API runs: authorize a base fee plus every allowed minute,
 * then get the unused whole minutes back. A call that never connects comes
 * back in full. Worked in micro-AUSD so the numbers stay exact.
 */

const MICRO = 1_000_000;
const BASE = Math.round(PRICING.baseAusd * MICRO);
const PER_MINUTE = Math.round(PRICING.perMinuteAusd * MICRO);

export interface Quote {
  authorized: number;
  refunded: number;
  net: number;
  billedMinutes: number;
}

export function quote(allowedMinutes: number, callSeconds: number, connected = true): Quote {
  const authorized = BASE + allowedMinutes * PER_MINUTE;
  if (!connected) return { authorized: authorized / MICRO, refunded: authorized / MICRO, net: 0, billedMinutes: 0 };
  const billedMinutes = Math.min(allowedMinutes, Math.max(1, Math.ceil(callSeconds / 60)));
  const refunded = (allowedMinutes - billedMinutes) * PER_MINUTE;
  return { authorized: authorized / MICRO, refunded: refunded / MICRO, net: (authorized - refunded) / MICRO, billedMinutes };
}

export const formatAusd = (value: number) => `${Number(value.toFixed(6))} AUSD`;
