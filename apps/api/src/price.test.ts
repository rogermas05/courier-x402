import { describe, it, expect } from 'vitest';
import { priceForCall, refundFor } from './price.js';

const pricing = { base: 50_000n, perMinute: 50_000n }; // 0.05 + 0.05/min

describe('priceForCall', () => {
	it('charges the base fee plus every allowed minute', () => {
		expect(priceForCall(pricing, 10)).toBe(550_000n);
	});
});

describe('refundFor', () => {
	const charged = priceForCall(pricing, 10);

	it('refunds everything when the call never connected', () => {
		expect(refundFor(pricing, charged, 10, { connected: false, durationSeconds: 0 })).toBe(charged);
	});

	it('refunds everything when the call never ran', () => {
		expect(refundFor(pricing, charged, 10, null)).toBe(charged);
	});

	it('refunds the unused whole minutes and keeps the base fee', () => {
		// 2m10s bills as 3 minutes; 7 of 10 come back.
		expect(refundFor(pricing, charged, 10, { connected: true, durationSeconds: 130 })).toBe(350_000n);
	});

	it('bills at least one minute for a connected call', () => {
		expect(refundFor(pricing, charged, 10, { connected: true, durationSeconds: 0 })).toBe(450_000n);
	});

	it('refunds nothing when the call used its whole allowance', () => {
		expect(refundFor(pricing, charged, 10, { connected: true, durationSeconds: 900 })).toBe(0n);
	});

	it('never refunds more than was charged', () => {
		expect(refundFor({ base: 0n, perMinute: 1_000_000n }, 10n, 10, { connected: true, durationSeconds: 60 })).toBe(10n);
	});
});
