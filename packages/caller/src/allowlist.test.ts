import { describe, it, expect } from 'vitest';
import { allowlistFromEnv, parseAllowlist } from './allowlist.js';

describe('allowlist', () => {
	it('is unrestricted only for the mock provider', () => {
		expect(allowlistFromEnv({})).toBeNull();
		expect(allowlistFromEnv({ TELEPHONY_PROVIDER: 'telnyx' })?.size).toBe(0);
		expect([...allowlistFromEnv({ TELEPHONY_PROVIDER: 'telnyx', DISPATCH_ALLOWED_NUMBERS: '+15550100142' })!]).toEqual(['+15550100142']);
	});

	it('fails loudly on malformed entries', () => {
		expect(() => parseAllowlist('+1555, 5550100')).toThrow(/non-E\.164/);
	});
});
