import { AUSD, formatAusd } from '@dispatch/ausd';
import type { Pricing } from './price.js';
import type { Job } from './store.js';

/**
 * The public, read-only view of every call, for the dashboard.
 *
 * Phone numbers are masked to their last two digits. Everything else here is
 * already public on-chain (payer, amounts, transactions) or is the deliverable
 * the dashboard exists to show (objective, outcome, transcript).
 */

export interface FeedMeta {
	payTo: string;
	pricing: Pricing;
	provider: string;
}

export function maskNumber(e164: string): string {
	const digits = e164.replace(/\D/g, '');
	if (digits.length < 4) return '•••';
	return `+${digits.slice(0, digits.length - 10 || 1)} ••• ••• ••${digits.slice(-2)}`;
}

function publicCall(job: Job) {
	const o = job.outcome;
	return {
		id: job.id,
		status: job.status,
		createdAt: job.createdAt,
		updatedAt: job.updatedAt,
		objective: job.brief.objective,
		onBehalfOf: job.brief.onBehalfOf ?? null,
		to: maskNumber(job.brief.to),
		maxMinutes: job.maxMinutes,
		payment: { payer: job.payment.payer, amountAusd: formatAusd(job.payment.amount), transaction: job.payment.transaction },
		refund: job.refund
			? { amountAusd: formatAusd(job.refund.amount), transaction: job.refund.transaction ?? null, failed: Boolean(job.refund.error) }
			: null,
		outcome: o
			? {
					summary: o.summary,
					objectiveMet: o.objectiveMet ?? false,
					artifacts: o.artifacts,
					humanFollowUp: o.humanFollowUp,
					caveats: o.caveats,
					callStatus: o.status,
					durationSeconds: o.durationSeconds,
					transcript: o.transcript.turns,
				}
			: null,
		error: job.error ?? null,
	};
}

export type FeedCall = ReturnType<typeof publicCall>;

export function buildFeed(jobs: Job[], meta: FeedMeta, now: Date = new Date()) {
	return {
		generatedAt: now.toISOString(),
		network: { id: AUSD.network, name: 'Base Sepolia', explorer: AUSD.explorer },
		asset: { symbol: 'AUSD', address: AUSD.address, decimals: AUSD.decimals },
		payTo: meta.payTo,
		provider: meta.provider,
		pricing: { baseAusd: formatAusd(meta.pricing.base), perMinuteAusd: formatAusd(meta.pricing.perMinute) },
		calls: [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicCall),
	};
}
