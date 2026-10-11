import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUSD } from '@dispatch/ausd';
import type { FacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { callRoutes, createPaywall } from './payments.js';
import { createApp } from './server.js';
import { JobStore } from './store.js';

const PAY_TO = '0x000000000000000000000000000000000000dEaD';
const pricing = { base: 50_000n, perMinute: 50_000n };
const body = { to: '+14155550123', objective: 'Ask whether the pharmacy has amoxicillin in stock.', max_minutes: 3 };

/** A facilitator that approves everything, so the test exercises Dispatch's ordering and not the chain. */
function stubFacilitator(settle: FacilitatorClient['settle']): FacilitatorClient {
	return {
		verify: async (payload) => ({ isValid: true, payer: (payload.payload as { authorization: { from: string } }).authorization.from }),
		settle,
		getSupported: async () => ({ kinds: [{ x402Version: 2, scheme: 'exact', network: AUSD.network }], extensions: [], signers: {} }),
	};
}

const servers: Array<{ close: () => void }> = [];
afterEach(() => servers.splice(0).forEach((s) => s.close()));

async function boot(settle: FacilitatorClient['settle']) {
	const store = new JobStore(mkdtempSync(join(tmpdir(), 'dispatch-')));
	const start = vi.fn();
	const settleSpy = vi.fn(settle);
	const paywall = await createPaywall(stubFacilitator(settleSpy), callRoutes(PAY_TO, pricing));
	const app = createApp({ paywall, store, pricing, payTo: PAY_TO, provider: 'mock', allowedNumbers: null, start, healthy: async () => true });
	const server = app.listen(0);
	servers.push(server);
	await new Promise((r) => server.once('listening', r));
	const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	return { url, store, start, settle: settleSpy };
}

const post = (url: string, payload: unknown, f: typeof fetch = fetch) =>
	f(`${url}/v1/calls`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });

const settledOk: FacilitatorClient['settle'] = async (payload) => ({
	success: true,
	transaction: '0xsettled',
	network: AUSD.network,
	payer: (payload.payload as { authorization: { from: string } }).authorization.from,
});

describe('POST /v1/calls', () => {
	it('refuses an invalid request with 400 before quoting, so nobody is charged', async () => {
		const { url, settle } = await boot(settledOk);
		const res = await post(url, { to: 'nope', objective: 'x' });
		expect(res.status).toBe(400);
		expect((await res.json()).error).toMatch(/not been charged/);
		expect(settle).not.toHaveBeenCalled();
	});

	it('quotes with a 402 that names AUSD, its EIP-712 domain, and a price for the requested minutes', async () => {
		const { url } = await boot(settledOk);
		const res = await post(url, body);
		expect(res.status).toBe(402);
		const required = JSON.parse(Buffer.from(res.headers.get('payment-required')!, 'base64').toString());
		expect(required.accepts[0]).toMatchObject({
			scheme: 'exact',
			network: AUSD.network,
			asset: AUSD.address,
			amount: '200000', // 0.05 + 3 x 0.05
			payTo: PAY_TO,
			extra: { name: 'Agora Dollar', version: '1' },
		});
	});

	it('takes a signed ERC-3009 authorization, settles it, and only then starts the call', async () => {
		const { url, store, start, settle } = await boot(settledOk);
		const buyer = privateKeyToAccount(generatePrivateKey());
		const pay = wrapFetchWithPaymentFromConfig(fetch, {
			schemes: [{ network: AUSD.network, client: new ExactEvmScheme(buyer) }],
			spendControls: { allowedAssets: [{ network: AUSD.network, asset: AUSD.address, maxAmountPerPayment: '1000000' }] },
		});

		const res = await post(url, body, pay);
		expect(res.status).toBe(202);
		expect(res.headers.get('payment-response')).toBeTruthy();
		const job = await res.json();
		expect(job).toMatchObject({ status: 'calling', payment: { amount_ausd: '0.2', payer: buyer.address, transaction: '0xsettled' } });

		expect(settle).toHaveBeenCalledTimes(1);
		const [payload] = settle.mock.calls[0]!;
		expect((payload.payload as { authorization: { from: string; to: string; value: string } }).authorization).toMatchObject({ from: buyer.address, to: PAY_TO, value: '200000' });
		expect(start).toHaveBeenCalledTimes(1);
		expect(store.get(job.call_id)?.payment.payer).toBe(buyer.address);

		const status = await fetch(`${url}/v1/calls/${job.call_id}`);
		expect((await status.json()).status).toBe('calling');
	});

	it('never dials when settlement fails', async () => {
		const { url, store, start } = await boot(async () => ({ success: false, errorReason: 'insufficient_funds', transaction: '', network: AUSD.network }));
		const buyer = privateKeyToAccount(generatePrivateKey());
		const pay = wrapFetchWithPaymentFromConfig(fetch, {
			schemes: [{ network: AUSD.network, client: new ExactEvmScheme(buyer) }],
			spendControls: { allowedAssets: [{ network: AUSD.network, asset: AUSD.address }] },
		});

		const res = await post(url, body, pay);
		expect(res.status).toBe(402);
		expect(start).not.toHaveBeenCalled();
		expect(store.all()).toHaveLength(0);
	});

	it('answers malformed JSON with 400, not 500', async () => {
		const { url } = await boot(settledOk);
		const res = await fetch(`${url}/v1/calls`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
		expect(res.status).toBe(400);
	});
});

describe('GET /v1/calls/:id', () => {
	it('404s on unknown and malformed ids without touching the filesystem path', async () => {
		const { url } = await boot(settledOk);
		expect((await fetch(`${url}/v1/calls/${'b'.repeat(32)}`)).status).toBe(404);
		expect((await fetch(`${url}/v1/calls/..%2F..%2Fetc`)).status).toBe(404);
	});
});

describe('GET /v1/quote', () => {
	it('prices by minutes and rejects out-of-range requests', async () => {
		const { url } = await boot(settledOk);
		expect((await (await fetch(`${url}/v1/quote?max_minutes=10`)).json()).price_ausd).toBe('0.55');
		expect((await fetch(`${url}/v1/quote?max_minutes=0`)).status).toBe(400);
	});
});
