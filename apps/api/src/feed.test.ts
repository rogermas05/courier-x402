import { describe, expect, it } from 'vitest';
import { buildFeed, maskNumber } from './feed.js';
import type { Job } from './store.js';

const job = (id: string, createdAt: string, overrides: Partial<Job> = {}): Job => ({
	id,
	status: 'completed',
	createdAt,
	updatedAt: createdAt,
	brief: { to: '+14155550140', objective: 'Ask their favourite colour.', authorization: 'none', maxDurationSeconds: 180 },
	maxMinutes: 3,
	payment: { payer: '0xBuyer', amount: '200000', transaction: '0xpay' },
	...overrides,
});

const meta = { payTo: '0xSeller', pricing: { base: 50_000n, perMinute: 50_000n }, provider: 'elevenlabs' };

describe('maskNumber', () => {
	it('keeps the country code and last two digits only', () => {
		expect(maskNumber('+14155550140')).toBe('+1 ••• ••• ••40');
		expect(maskNumber('+447700900123')).toBe('+44 ••• ••• ••23');
	});
});

describe('buildFeed', () => {
	it('lists calls newest first with masked numbers and AUSD amounts', () => {
		const feed = buildFeed([job('a'.repeat(32), '2026-10-11T10:00:00Z'), job('b'.repeat(32), '2026-10-11T11:00:00Z', { refund: { amount: '100000', transaction: '0xrefund' } })], meta);
		expect(feed.calls.map((c) => c.id[0])).toEqual(['b', 'a']);
		expect(feed.calls[0]).toMatchObject({ to: '+1 ••• ••• ••40', payment: { amountAusd: '0.2' }, refund: { amountAusd: '0.1', transaction: '0xrefund', failed: false } });
		expect(JSON.stringify(feed)).not.toContain('4155550140');
		expect(feed.pricing).toEqual({ baseAusd: '0.05', perMinuteAusd: '0.05' });
	});

	it('marks a refund that has not gone out', () => {
		const feed = buildFeed([job('a'.repeat(32), '2026-10-11T10:00:00Z', { refund: { amount: '200000', error: 'reverted' } })], meta);
		expect(feed.calls[0]?.refund).toEqual({ amountAusd: '0.2', transaction: null, failed: true });
	});
});
