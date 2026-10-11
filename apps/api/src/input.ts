import { E164, type CallBrief } from '@dispatch/caller';

/**
 * The request body for a paid call, and the gate in front of the paywall.
 *
 * Validation runs before any 402 is issued, so a request Dispatch cannot
 * perform is refused for free instead of being charged and then failing.
 */

export const DEFAULT_MINUTES = 10;
export const MAX_MINUTES = 30;
const MAX_TEXT = 4000;
const KNOWN_FIELDS = new Set(['to', 'objective', 'authorization', 'on_behalf_of', 'context', 'max_minutes']);

/**
 * An agent that forgets to say what may be agreed to gets a call that commits its
 * principal to nothing, rather than one that improvises authority on their behalf.
 */
const INFORMATION_ONLY = 'Gather information only. Do not agree to anything, accept any offer, or make any commitment.';

export interface CallRequest {
	brief: CallBrief;
	maxMinutes: number;
}

export type Validated = { ok: true; call: CallRequest } | { ok: false; errors: string[] };

function text(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Validate an untrusted body. allowedNumbers is null only when nothing real is dialed. */
export function validateCall(body: unknown, allowedNumbers: ReadonlySet<string> | null): Validated {
	if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: ['body must be a JSON object'] };
	const input = body as Record<string, unknown>;
	const errors: string[] = [];

	const unknown = Object.keys(input).filter((k) => !KNOWN_FIELDS.has(k));
	if (unknown.length) errors.push(`unknown fields: ${unknown.join(', ')}`);

	const to = text(input.to);
	if (!to || !E164.test(to)) errors.push('to must be an E.164 phone number, e.g. +14155550123');
	else if (allowedNumbers && !allowedNumbers.has(to)) errors.push(`to ${to} is not a number Dispatch is permitted to call`);

	const objective = text(input.objective);
	if (!objective || objective.length < 10 || objective.length > MAX_TEXT) errors.push(`objective must be 10-${MAX_TEXT} characters: what the call must achieve`);

	for (const field of ['authorization', 'on_behalf_of', 'context'] as const) {
		const value = input[field];
		if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > MAX_TEXT)) {
			errors.push(`${field} must be a string of at most ${MAX_TEXT} characters`);
		}
	}

	const rawMinutes = input.max_minutes;
	const maxMinutes = rawMinutes === undefined || rawMinutes === null || rawMinutes === '' ? DEFAULT_MINUTES : Number(rawMinutes);
	if (!Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > MAX_MINUTES) {
		errors.push(`max_minutes must be a whole number between 1 and ${MAX_MINUTES}`);
	}

	if (errors.length) return { ok: false, errors };

	const onBehalfOf = text(input.on_behalf_of);
	const context = text(input.context);
	return {
		ok: true,
		call: {
			maxMinutes,
			brief: {
				to: to!,
				objective: objective!,
				authorization: text(input.authorization) ?? INFORMATION_ONLY,
				...(onBehalfOf ? { onBehalfOf } : {}),
				...(context ? { context: { notes: context } } : {}),
				maxDurationSeconds: maxMinutes * 60,
			},
		},
	};
}
