import { formatAusd, txUrl } from '@dispatch/ausd';
import type { Job } from './store.js';

/** A job as the paying agent sees it: plain words first, then the evidence. */

const EXPLANATION: Record<Job['status'], string> = {
	calling: 'Dispatch is on the call now. Calls take a few minutes.',
	completed: 'The call is over. The result is below.',
	failed: 'The call could not be placed. The full payment is refunded.',
	interrupted: 'Dispatch restarted during this call. An operator will review it and refund anything owed.',
};

function refundView(job: Job) {
	if (!job.refund) return job.status === 'calling' ? { status: 'pending until the call ends' } : { status: 'none owed' };
	const amount = formatAusd(job.refund.amount);
	if (job.refund.transaction) return { status: 'sent', amount_ausd: amount, transaction: job.refund.transaction, explorer: txUrl(job.refund.transaction) };
	if (job.refund.error) return { status: 'failed, an operator has been alerted', amount_ausd: amount };
	return { status: 'sending', amount_ausd: amount };
}

export function jobView(job: Job) {
	const o = job.outcome;
	return {
		call_id: job.id,
		status: job.status,
		explanation: EXPLANATION[job.status],
		to: job.brief.to,
		objective: job.brief.objective,
		max_minutes: job.maxMinutes,
		payment: {
			amount_ausd: formatAusd(job.payment.amount),
			payer: job.payment.payer,
			transaction: job.payment.transaction,
			explorer: txUrl(job.payment.transaction),
		},
		refund: refundView(job),
		...(o
			? {
					result: {
						summary: o.summary,
						objective_met: o.objectiveMet ?? false,
						artifacts: o.artifacts,
						human_follow_up: o.humanFollowUp,
						caveats: o.caveats,
						call_status: o.status,
						duration_seconds: o.durationSeconds,
						transcript: o.transcript.turns,
					},
				}
			: {}),
		...(job.error ? { error: job.error } : {}),
		...(job.status === 'calling' ? { poll_after_seconds: 20 } : {}),
	};
}
