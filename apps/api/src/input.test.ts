import { describe, it, expect } from 'vitest';
import { validateCall } from './input.js';

const good = { to: '+14155550123', objective: 'Ask whether the pharmacy has amoxicillin in stock.' };

describe('validateCall', () => {
	it('accepts a minimal request and defaults to an information-only call of ten minutes', () => {
		const v = validateCall(good, null);
		expect(v.ok).toBe(true);
		if (!v.ok) return;
		expect(v.call.maxMinutes).toBe(10);
		expect(v.call.brief.maxDurationSeconds).toBe(600);
		expect(v.call.brief.authorization).toMatch(/Gather information only/);
	});

	it('carries who the call is for and the context into the brief', () => {
		const v = validateCall({ ...good, on_behalf_of: 'Aman', context: 'Rx 4471', max_minutes: '3' }, null);
		expect(v.ok && v.call.brief).toMatchObject({ onBehalfOf: 'Aman', context: { notes: 'Rx 4471' }, maxDurationSeconds: 180 });
	});

	it('refuses numbers outside the allowlist before anyone is charged', () => {
		const v = validateCall(good, new Set(['+14155550100']));
		expect(v).toEqual({ ok: false, errors: ['to +14155550123 is not a number Dispatch is permitted to call'] });
	});

	it('explains every problem at once', () => {
		const v = validateCall({ to: '555-0123', objective: 'hi', max_minutes: 90, extra: 1 }, null);
		expect(v.ok).toBe(false);
		if (v.ok) return;
		expect(v.errors).toHaveLength(4);
	});

	it('rejects a body that is not an object', () => {
		expect(validateCall([good], null).ok).toBe(false);
		expect(validateCall(undefined, null).ok).toBe(false);
	});

	it('rejects non-string text fields instead of stringifying them', () => {
		expect(validateCall({ ...good, authorization: { anything: true } }, null).ok).toBe(false);
	});
});
