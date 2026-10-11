import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { MockCallProvider, type CallProvider } from '@dispatch/caller';
import { markInterrupted, retryFailedRefunds, runJob, type RunnerDeps } from './runner.js';
import { JobStore } from './store.js';

const ID = 'a'.repeat(32);
const pricing = { base: 50_000n, perMinute: 50_000n };

function setup(provider: CallProvider, overrides: Partial<RunnerDeps> = {}) {
	const store = new JobStore(mkdtempSync(join(tmpdir(), 'dispatch-')));
	const job = store.create({
		id: ID,
		status: 'calling',
		brief: { to: '+14155550123', objective: 'Ask about opening hours.', authorization: 'none', maxDurationSeconds: 600 },
		maxMinutes: 10,
		payment: { payer: '0xBuyer', amount: '550000', transaction: '0xpay' },
	});
	const refund = vi.fn(async () => '0xrefund');
	const report = vi.fn(async (_b, r) => ({ ...r, summary: 'ok', artifacts: {}, humanFollowUp: null, caveats: [] }));
	const deps: RunnerDeps = { store, provider, pricing, refund, report, sleep: async () => {}, ...overrides };
	return { store, job, deps, refund };
}

describe('runJob', () => {
	it('completes the job and refunds the unused minutes', async () => {
		// The mock call lasts 42 seconds, billed as one minute: 9 minutes come back.
		const { job, deps, refund } = setup(new MockCallProvider('completed'));
		const done = await runJob(job, deps);
		expect(done.status).toBe('completed');
		expect(refund).toHaveBeenCalledWith('0xBuyer', 450_000n);
		expect(done.refund).toEqual({ amount: '450000', transaction: '0xrefund' });
	});

	it('refunds in full when the call never connected', async () => {
		const { job, deps, refund } = setup(new MockCallProvider('unreachable'));
		await runJob(job, deps);
		expect(refund).toHaveBeenCalledWith('0xBuyer', 550_000n);
	});

	it('refunds in full and fails the job when the provider throws', async () => {
		const broken: CallProvider = { name: 'broken', healthy: async () => true, place: async () => { throw new Error('carrier down'); } };
		const { job, deps, refund } = setup(broken);
		const done = await runJob(job, deps);
		expect(done).toMatchObject({ status: 'failed', error: 'carrier down' });
		expect(refund).toHaveBeenCalledWith('0xBuyer', 550_000n);
	});

	it('keeps the transcript when the report fails, and still bills only what was used', async () => {
		const { job, deps, refund } = setup(new MockCallProvider('completed'), { report: async () => { throw new Error('model down'); } });
		const done = await runJob(job, deps);
		expect(done.status).toBe('completed');
		expect(done.outcome?.transcript.turns.length).toBeGreaterThan(0);
		expect(refund).toHaveBeenCalledWith('0xBuyer', 450_000n);
	});

	it('retries a refund that races its own settlement', async () => {
		let attempts = 0;
		const flaky = async () => {
			attempts += 1;
			if (attempts < 3) throw new Error('ERC20InsufficientBalance');
			return '0xrefund';
		};
		const { job, deps } = setup(new MockCallProvider('unreachable'), { refund: flaky });
		const done = await runJob(job, deps);
		expect(done.refund).toEqual({ amount: '550000', transaction: '0xrefund' });
		expect(attempts).toBe(3);
	});

	it('records a failed refund instead of losing it', async () => {
		const { job, deps } = setup(new MockCallProvider('unreachable'), { refund: async () => { throw new Error('out of gas'); } });
		const done = await runJob(job, deps);
		expect(done.refund).toEqual({ amount: '550000', error: 'out of gas' });
	});
});

describe('markInterrupted', () => {
	it('flags calls left running by a dead process without refunding or re-dialing them', () => {
		const { store } = setup(new MockCallProvider());
		const [flagged] = markInterrupted(store);
		expect(flagged?.status).toBe('interrupted');
		expect(flagged?.refund).toBeUndefined();
	});
});

describe('retryFailedRefunds', () => {
	it('resends refunds that were owed but never sent, and leaves sent ones alone', async () => {
		const { job, deps, store } = setup(new MockCallProvider('unreachable'), { refund: async () => { throw new Error('down'); } });
		await runJob(job, deps);
		const refund = vi.fn(async () => '0xlater');
		const [fixed] = await retryFailedRefunds(store, { refund, sleep: async () => {} });
		expect(fixed?.refund).toEqual({ amount: '550000', transaction: '0xlater' });
		expect(await retryFailedRefunds(store, { refund, sleep: async () => {} })).toHaveLength(0);
		expect(refund).toHaveBeenCalledTimes(1);
	});
});
