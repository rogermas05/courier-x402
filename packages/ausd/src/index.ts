/**
 * AUSD, Agora's digital dollar, on the network Dispatch settles on.
 *
 * Base Sepolia, because Agora runs a public AUSD faucet there and the x402
 * tooling already knows the chain. The token is not in x402's default asset
 * table, so every payment requirement names it explicitly, with the EIP-712
 * domain the payer must sign over. The domain values were read from the
 * contract's eip712Domain(); a mismatch makes every signature invalid.
 */
export const AUSD = {
	network: 'eip155:84532',
	chainId: 84532,
	address: '0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC',
	decimals: 6,
	eip712: { name: 'Agora Dollar', version: '1' },
	/** Agora's test faucet. requestFunds(receiver) drips AUSD to any address. */
	faucet: '0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C',
	rpcUrl: 'https://sepolia.base.org',
	explorer: 'https://sepolia.basescan.org',
} as const;

const UNIT = 10n ** BigInt(AUSD.decimals);

/** "0.25" → 250000n. Throws on anything that is not a non-negative amount with at most 6 decimals. */
export function toAtomic(decimal: string): bigint {
	const text = decimal.trim();
	if (!/^\d+(\.\d{1,6})?$/.test(text)) throw new Error(`"${decimal}" is not an AUSD amount (at most ${AUSD.decimals} decimals)`);
	const [whole, fraction = ''] = text.split('.');
	return BigInt(whole!) * UNIT + BigInt(fraction.padEnd(AUSD.decimals, '0'));
}

/** 250000n → "0.25". */
export function formatAusd(atomic: bigint | string): string {
	const value = BigInt(atomic);
	const whole = value / UNIT;
	const fraction = (value % UNIT).toString().padStart(AUSD.decimals, '0').replace(/0+$/, '');
	return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export const txUrl = (hash: string): string => `${AUSD.explorer}/tx/${hash}`;
