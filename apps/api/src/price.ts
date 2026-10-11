/**
 * What a call costs, and what comes back afterwards.
 *
 * x402's exact scheme moves one fixed amount, signed before the call exists. So
 * the payer authorizes the ceiling — a base fee plus every minute they allow —
 * and Dispatch refunds the minutes the call did not use. A call that never
 * connects is refunded in full: the payer bought a conversation, not a dial tone.
 */

export interface Pricing {
	/** Atomic AUSD charged for any call that connects. */
	base: bigint;
	/** Atomic AUSD per minute of allowed call time. Part-minutes bill as whole ones. */
	perMinute: bigint;
}

export function priceForCall(pricing: Pricing, maxMinutes: number): bigint {
	return pricing.base + BigInt(maxMinutes) * pricing.perMinute;
}

/** How the call went, as far as billing cares. null means the call never ran. */
export interface Usage {
	connected: boolean;
	durationSeconds: number;
}

export function refundFor(pricing: Pricing, charged: bigint, maxMinutes: number, usage: Usage | null): bigint {
	if (!usage || !usage.connected) return charged;
	const used = Math.min(maxMinutes, Math.max(1, Math.ceil(usage.durationSeconds / 60)));
	const refund = BigInt(maxMinutes - used) * pricing.perMinute;
	// Never refund more than was taken, whatever the pricing was changed to since.
	return refund > charged ? charged : refund;
}

export const REFUND_POLICY = 'Unused whole minutes are refunded in AUSD after the call. A call that never connects is refunded in full.';
