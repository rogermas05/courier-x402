import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AUSD } from '@dispatch/ausd';
import { generatePrivateKey } from 'viem/accounts';
import { payingWallet } from './wallet.js';

/**
 * The guards that matter: the wallet only signs for AUSD, and never above its
 * cap. A server stands in for Dispatch and counts how many paid retries arrive.
 */

const servers: Server[] = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

async function quoting(accepts: object[]) {
	let paidAttempts = 0;
	const server = createServer((req, res) => {
		if (req.headers['payment-signature']) {
			paidAttempts += 1;
			res.writeHead(202, { 'content-type': 'application/json' }).end('{}');
			return;
		}
		const required = { x402Version: 2, resource: { url: 'http://dispatch/v1/calls' }, accepts };
		res.writeHead(402, { 'payment-required': Buffer.from(JSON.stringify(required)).toString('base64'), 'content-type': 'application/json' }).end('{}');
	});
	servers.push(server);
	await new Promise<void>((r) => server.listen(0, r));
	return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, paid: () => paidAttempts };
}

const ausd = (amount: string) => ({
	scheme: 'exact',
	network: AUSD.network,
	asset: AUSD.address,
	amount,
	payTo: '0x000000000000000000000000000000000000dEaD',
	maxTimeoutSeconds: 300,
	extra: { ...AUSD.eip712 },
});

describe('payingWallet', () => {
	it('signs for AUSD within the cap', async () => {
		const server = await quoting([ausd('550000')]);
		const res = await payingWallet(generatePrivateKey(), '2').fetch(server.url, { method: 'POST' });
		expect(res.status).toBe(202);
		expect(server.paid()).toBe(1);
	});

	it('refuses to sign above the per-call cap', async () => {
		const server = await quoting([ausd('5000000')]);
		await expect(payingWallet(generatePrivateKey(), '2').fetch(server.url, { method: 'POST' })).rejects.toThrow();
		expect(server.paid()).toBe(0);
	});

	it('refuses to pay in any token other than AUSD', async () => {
		const usdc = { ...ausd('100'), asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', extra: { name: 'USDC', version: '2' } };
		const server = await quoting([usdc]);
		await expect(payingWallet(generatePrivateKey(), '2').fetch(server.url, { method: 'POST' })).rejects.toThrow();
		expect(server.paid()).toBe(0);
	});
});
