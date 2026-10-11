import { formatAusd } from '@dispatch/ausd';
import type { CallBrief, CallOutcome, CallProvider, CallResult } from '@dispatch/caller';
import { refundFor, type Pricing } from './price.js';
import type { Job, JobStore } from './store.js';

/**
 * Runs a paid job: dial, report, refund what was not used.
 *
 * Every step is saved before the next begins. The one state that cannot be
 * resolved automatically is a call found mid-dial after a restart — it may have
 * reached a real person — so it is marked interrupted for an operator, never
 * re-dialed and never auto-refunded.
 */

export interface RunnerDeps {
	store: JobStore;
	provider: CallProvider;
	pricing: Pricing;
	report: (brief: CallBrief, result: CallResult) => Promise<CallOutcome>;
	/** Sends AUSD back to the payer; resolves to the transaction hash. */
	refund: (to: string, amount: bigint) => Promise<string>;
	log?: (message: string) => void;
	/** Injected in tests so retries do not wait. */
	sleep?: (ms: number) => Promise<void>;
}

/** The report is a model pass. If it fails, the call still happened and the transcript is still the deliverable. */
async function reportOrRaw(deps: RunnerDeps, brief: CallBrief, result: CallResult): Promise<CallOutcome> {
	try {
		return await deps.report(brief, result);
	} catch (err) {
		deps.log?.(`report failed, returning the raw transcript: ${err instanceof Error ? err.message : err}`);
		return {
			...result,
			summary: 'The call finished but its summary could not be generated. The transcript is attached.',
			artifacts: {},
			humanFollowUp: 'Read the transcript; no structured summary was produced.',
			caveats: ['No structured report was produced for this call.'],
		};
	}
}

const REFUND_ATTEMPTS = 4;
const REFUND_BACKOFF_MS = 5_000;

/**
 * Refunds can race the payment they return. A call that fails instantly refunds
 * within a second of settlement, and a load-balanced RPC node that has not seen
 * the settlement yet reverts the transfer for insufficient balance. That is
 * transient, so it is retried with backoff before anyone is told it failed.
 */
async function refundWithRetry(deps: RunnerDeps, to: string, amount: bigint): Promise<string> {
	const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
	for (let attempt = 1; ; attempt++) {
		try {
			return await deps.refund(to, amount);
		} catch (err) {
			if (attempt >= REFUND_ATTEMPTS) throw err;
			deps.log?.(`refund attempt ${attempt} failed, retrying: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
			await sleep(REFUND_BACKOFF_MS * attempt);
		}
	}
}

export async function runJob(job: Job, deps: RunnerDeps): Promise<Job> {
	const log = deps.log ?? (() => {});
	let result: CallResult | null = null;
	let outcome: CallOutcome | undefined;
	let error: string | undefined;

	try {
		result = await deps.provider.place(job.brief);
		outcome = await reportOrRaw(deps, job.brief, result);
	} catch (err) {
		error = err instanceof Error ? err.message : String(err);
		log(`job ${job.id}: call failed: ${error}`);
	}

	const usage = result ? { connected: result.status !== 'unreachable' && result.transcript.turns.length > 0, durationSeconds: result.durationSeconds } : null;
	const amount = refundFor(deps.pricing, BigInt(job.payment.amount), job.maxMinutes, usage);
	// One write, so no reader ever sees a finished job without the refund it is owed.
	const finished = deps.store.update(job.id, {
		status: outcome ? 'completed' : 'failed',
		...(outcome ? { outcome } : {}),
		...(error ? { error } : {}),
		...(amount > 0n ? { refund: { amount: amount.toString() } } : {}),
	});
	if (amount === 0n) return finished;

	try {
		const transaction = await refundWithRetry(deps, job.payment.payer, amount);
		log(`job ${job.id}: refunded ${formatAusd(amount)} AUSD in ${transaction}`);
		return deps.store.update(job.id, { refund: { amount: amount.toString(), transaction } });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log(`job ${job.id}: REFUND FAILED for ${formatAusd(amount)} AUSD to ${job.payment.payer}: ${message}`);
		return deps.store.update(job.id, { refund: { amount: amount.toString(), error: message } });
	}
}

/** Called once at startup. Anything still calling belongs to a process that died. */
export function markInterrupted(store: JobStore): Job[] {
	return store
		.all()
		.filter((j) => j.status === 'calling')
		.map((j) => store.update(j.id, { status: 'interrupted', error: 'Dispatch restarted during this call. An operator will review it and refund if owed.' }));
}

/** Operator action: resend every refund that is owed but was never sent. */
export async function retryFailedRefunds(store: JobStore, deps: Pick<RunnerDeps, 'refund' | 'log' | 'sleep'>): Promise<Job[]> {
	const owed = store.all().filter((j) => j.refund && !j.refund.transaction);
	const results: Job[] = [];
	for (const job of owed) {
		const amount = BigInt(job.refund!.amount);
		try {
			const transaction = await refundWithRetry(deps as RunnerDeps, job.payment.payer, amount);
			deps.log?.(`job ${job.id}: refunded ${formatAusd(amount)} AUSD in ${transaction}`);
			results.push(store.update(job.id, { refund: { amount: amount.toString(), transaction } }));
		} catch (err) {
			results.push(store.update(job.id, { refund: { amount: amount.toString(), error: err instanceof Error ? err.message : String(err) } }));
		}
	}
	return results;
}
