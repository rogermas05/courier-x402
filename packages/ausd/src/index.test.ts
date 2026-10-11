import { describe, it, expect } from 'vitest';
import { formatAusd, toAtomic } from './index.js';

describe('toAtomic', () => {
	it('converts whole and fractional amounts to 6-decimal atomic units', () => {
		expect(toAtomic('1')).toBe(1_000_000n);
		expect(toAtomic('0.25')).toBe(250_000n);
		expect(toAtomic('0.000001')).toBe(1n);
	});

	it('rejects negatives, extra precision and junk instead of rounding', () => {
		for (const bad of ['-1', '0.0000001', 'abc', '', '1e3']) expect(() => toAtomic(bad)).toThrow();
	});
});

describe('formatAusd', () => {
	it('round-trips and trims trailing zeros', () => {
		expect(formatAusd(toAtomic('0.25'))).toBe('0.25');
		expect(formatAusd(3_000_000n)).toBe('3');
		expect(formatAusd('1')).toBe('0.000001');
	});
});
