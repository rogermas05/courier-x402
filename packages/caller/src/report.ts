import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { CallBrief, CallOutcome, CallResult } from './types.js';

/**
 * Turn a finished call into a deliverable.
 *
 * The brief arrives structured from the paying agent, so the only model pass is
 * after the call: read the transcript into an outcome the caller can act on.
 *
 * The model never decides whether to dial. That gate is the settled payment.
 */

const MODEL = process.env.MODEL_ID ?? 'claude-sonnet-5-5';

/**
 * Tolerant on shape, strict on meaning.
 *
 * A model asked for a record will sometimes return a prose string, and rejecting
 * the whole brief over that would fail a job whose actual content was fine. The
 * fields that matter — the number and the authorization — stay strict.
 */
const briefSchema = z.object({
	to: z.string().min(3),
	objective: z.string().min(1),
	authorization: z.string(),
	onBehalfOf: z.union([z.string(), z.null()]).optional().transform((v) => v?.trim() || undefined),
	context: z
		.union([z.record(z.string()), z.string(), z.null()])
		.optional()
		.transform((v) => (typeof v === 'string' ? (v.trim() ? { notes: v } : undefined) : (v ?? undefined))),
	// Floored at three minutes. The model will happily pick 60 for a "quick
	// question", which is not enough once a phone tree and a hold queue are
	// involved — and a budget that expires mid-call ends the call.
	maxDurationSeconds: z.coerce
		.number()
		.int()
		.positive()
		.max(1800)
		.default(900)
		.transform((v) => Math.max(v, 180)),
});

const outcomeSchema = z.object({
	summary: z.string(),
	// Models return numbers, nested objects, nulls — and arrays, which is what
	// threw away a completed paid call: the conversation happened, the payment had
	// settled, and the result was discarded over the container type of a field
	// whose values are only ever read by a human.
	//
	// An array arrives either as [{name, value}] pairs or as a bare list; both
	// are flattened to string values. Anything genuinely unparseable is dropped
	// rather than raised, because by this point the call is already made and the
	// money has already moved.
	// Accepts anything at all. A narrower union is a way to throw after the call
	// is already made, which is the one outcome worth engineering against here.
	artifacts: z
		.unknown()
		.optional()
		.transform((v) => {
			if (v === null || v === undefined) return {};
			if (typeof v !== 'object') return { note: String(v) };
			const entries: Array<[string, unknown]> = Array.isArray(v)
				? v.map((item, i) => {
						if (item && typeof item === 'object' && !Array.isArray(item)) {
							const o = item as Record<string, unknown>;
							const key = o.name ?? o.key ?? o.label ?? o.type;
							if (typeof key === 'string') return [key, o.value ?? o.text ?? o.detail ?? ''] as [string, unknown];
							const [[k, val] = ['', '']] = Object.entries(o);
							return [k || `item_${i + 1}`, val] as [string, unknown];
						}
						return [`item_${i + 1}`, item] as [string, unknown];
					})
				: Object.entries(v as Record<string, unknown>);

			return Object.fromEntries(
				entries
					.filter(([k, x]) => k && x !== null && x !== undefined && x !== '')
					.map(([k, x]) => [k, typeof x === 'string' ? x : JSON.stringify(x)]),
			);
		}),
	humanFollowUp: z.string().nullable().optional().transform((v) => v ?? null),
	caveats: z
		.union([z.array(z.unknown()), z.string(), z.null()])
		.optional()
		.transform((v) =>
			typeof v === 'string' ? [v] : (v ?? []).map((x) => (typeof x === 'string' ? x : JSON.stringify(x))),
		),
	// Same tolerance: a missing or stringly answer must not fail a finished call.
	objectiveMet: z
		.union([z.boolean(), z.string(), z.null()])
		.optional()
		.transform((v) => v === true || v === 'true'),
});

export { outcomeSchema as __test_outcomeSchema };

function client(): Anthropic {
	const apiKey = process.env.ANTHROPIC_API_KEY;
	if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
	return new Anthropic({ apiKey });
}

/** What the report must look like. Strict, so artifacts are name/value pairs; outcomeSchema turns them back into a record. */
const OUTCOME_JSON_SCHEMA = {
	type: 'object',
	properties: {
		summary: { type: 'string' },
		artifacts: {
			type: 'array',
			items: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'string' } }, required: ['name', 'value'], additionalProperties: false },
		},
		humanFollowUp: { type: ['string', 'null'] },
		caveats: { type: 'array', items: { type: 'string' } },
		objectiveMet: { type: 'boolean' },
	},
	required: ['summary', 'artifacts', 'humanFollowUp', 'caveats', 'objectiveMet'],
	additionalProperties: false,
} as const;

/**
 * Structured outputs constrain the model to valid JSON matching the schema.
 * Asking for JSON in prose broke a real call's report: one malformed character
 * and the summary was lost.
 */
async function structured<S extends z.ZodTypeAny>(prompt: string, system: string, schema: S, jsonSchema: Record<string, unknown>): Promise<z.output<S>> {
	const res = await client().messages.create({
		model: MODEL,
		max_tokens: 4096,
		system,
		messages: [{ role: 'user', content: prompt }],
		output_config: { format: { type: 'json_schema', schema: jsonSchema } },
	});
	const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
	return schema.parse(JSON.parse(text));
}

const REPORT_SYSTEM = `You turn a phone call transcript into a deliverable.

Return ONLY a JSON object: {summary, artifacts, humanFollowUp, caveats, objectiveMet}.

- "summary" is one or two sentences on whether the objective was met.
- "objectiveMet" is true only if the transcript shows the objective was achieved.
- "artifacts" holds reference numbers, confirmation codes, names and commitments
  obtained. This is what makes the call reusable by whoever comes next.
- "humanFollowUp" is what a person still has to do, or null.
- "caveats" states what this call does NOT establish. The other party may have
  been wrong or may not honour what they said; a transcript proves what was said,
  never that it was true. Say so when it matters.

Report only what the transcript supports. Never infer an outcome that is not in it.`;

export async function reportOutcome(brief: CallBrief, result: CallResult): Promise<CallOutcome> {
	// A call that never connected has nothing to summarize; asking a model to
	// narrate silence invites it to invent one.
	if (result.status === 'unreachable' || result.transcript.turns.length === 0) {
		return {
			...result,
			summary: `Call to ${brief.to} did not connect (${result.status}). The objective was not pursued.`,
			artifacts: {},
			objectiveMet: false,
			humanFollowUp: `Retry the call to ${brief.to}, or confirm the number is correct.`,
			caveats: ['No conversation took place. Nothing about the objective was established.'],
		};
	}

	const report = await structured(
		`Objective: ${brief.objective}\nAuthorization granted: ${brief.authorization}\n` +
			`Call status: ${result.status}, duration ${result.durationSeconds}s\n\nTranscript:\n${result.transcript.text}`,
		REPORT_SYSTEM,
		outcomeSchema,
		OUTCOME_JSON_SCHEMA,
	);
	return { ...result, ...report };
}
