import { describe, expect, it } from 'vitest';
import { AUSD } from '@dispatch/ausd';
import { diagnose } from './payments.js';

const requirements = { scheme: 'exact', network: AUSD.network, asset: AUSD.address, amount: '550000', payTo: '0xdead', maxTimeoutSeconds: 300, extra: {} } as const;
const mismatch = { isValid: false, invalidReason: 'invalid_exact_evm_token_name_mismatch', payer: '0xBuyer' };

describe('diagnose', () => {
	it('reports a short balance instead of the spurious AUSD name mismatch', async () => {
		const out = await diagnose(mismatch, requirements, async () => 0n);
		expect(out.invalidReason).toBe('invalid_exact_evm_insufficient_balance');
	});

	it('falls back to a generic simulation failure when the balance is fine', async () => {
		const out = await diagnose(mismatch, requirements, async () => 10_000_000n);
		expect(out.invalidReason).toBe('invalid_exact_evm_transaction_simulation_failed');
	});

	it('leaves valid payments and other reasons alone', async () => {
		const valid = { isValid: true, payer: '0xBuyer' };
		expect(await diagnose(valid, requirements, async () => 0n)).toBe(valid);
		const expired = { ...mismatch, invalidReason: 'invalid_exact_evm_payload_authorization_valid_before' };
		expect(await diagnose(expired, requirements, async () => 0n)).toBe(expired);
	});
});
