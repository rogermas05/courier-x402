import { randomBytes } from 'node:crypto';
import { AUSD, formatAusd } from '@dispatch/ausd';
import type { x402HTTPResourceServer } from '@x402/core/server';
import { ExpressAdapter } from '@x402/express';
import express, { type Request, type Response } from 'express';
import { buildFeed } from './feed.js';
import { DEFAULT_MINUTES, MAX_MINUTES, validateCall } from './input.js';
import { priceForCall, REFUND_POLICY, type Pricing } from './price.js';
import type { Job, JobStore } from './store.js';
import { jobView } from './view.js';

/**
 * The HTTP surface.
 *
 * POST /v1/calls is the only paid route, and its order is the point of this
 * file: validate (free), quote with a 402, verify the signed authorization,
 * settle it on-chain, and only then dial. A call is never placed on a payment
 * that has not landed, and a request Dispatch would refuse is never charged.
 */

export interface AppDeps {
	paywall: x402HTTPResourceServer;
	store: JobStore;
	pricing: Pricing;
	payTo: string;
	provider: string;
	allowedNumbers: ReadonlySet<string> | null;
	/** Starts the call in the background. The job is already saved and paid. */
	start: (job: Job) => void;
	healthy: () => Promise<boolean>;
	log?: (message: string) => void;
}

const CALLS_PER_MINUTE_PER_CLIENT = 30;
const RATE_WINDOW_MS = 60_000;

function rateLimiter(limit: number) {
	const windows = new Map<string, { start: number; count: number }>();
	return (key: string): boolean => {
		const now = Date.now();
		const w = windows.get(key);
		if (!w || now - w.start > RATE_WINDOW_MS) {
			windows.set(key, { start: now, count: 1 });
			return true;
		}
		w.count += 1;
		return w.count <= limit;
	};
}

function quote(pricing: Pricing, maxMinutes: number) {
	return {
		max_minutes: maxMinutes,
		price_ausd: formatAusd(priceForCall(pricing, maxMinutes)),
		base_fee_ausd: formatAusd(pricing.base),
		per_minute_ausd: formatAusd(pricing.perMinute),
		refund_policy: REFUND_POLICY,
	};
}

export function createApp(deps: AppDeps) {
	const log = deps.log ?? (() => {});
	const allowCall = rateLimiter(CALLS_PER_MINUTE_PER_CLIENT);
	const app = express();
	app.disable('x-powered-by');
	app.use(express.json({ limit: '32kb' }));

	app.get('/', (_req, res) => {
		res.json({
			name: 'Dispatch',
			description:
				'A voice agent that makes phone calls for other AI agents. It navigates phone menus, waits on hold, pursues your objective within the authorization you give, and returns the transcript with a structured outcome.',
			payment: { protocol: 'x402', scheme: 'exact', asset: 'AUSD', asset_address: AUSD.address, network: AUSD.network, pay_to: deps.payTo, gasless: 'ERC-3009: the payer signs, Dispatch submits and pays the gas' },
			pricing: quote(deps.pricing, DEFAULT_MINUTES),
			endpoints: {
				'POST /v1/calls': 'Paid. Body: {to, objective, authorization?, on_behalf_of?, context?, max_minutes?}. Returns 402 with the AUSD price, then 202 with a call_id once paid.',
				'GET /v1/calls/{call_id}': 'Free. Status, then the outcome and transcript, and the refund transaction.',
				'GET /v1/quote?max_minutes=N': 'Free. What a call of up to N minutes costs.',
				'GET /v1/feed': 'Free. Every call, numbers masked, for the dashboard.',
			},
		});
	});

	app.get('/health', async (_req, res) => {
		const ok = await deps.healthy().catch(() => false);
		res.status(ok ? 200 : 503).json({ ok, provider: deps.provider });
	});

	app.get('/v1/quote', (req, res) => {
		const raw = req.query.max_minutes;
		const minutes = raw === undefined ? DEFAULT_MINUTES : Number(raw);
		if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
			res.status(400).json({ error: `max_minutes must be a whole number between 1 and ${MAX_MINUTES}` });
			return;
		}
		res.json(quote(deps.pricing, minutes));
	});

	app.post('/v1/calls', async (req: Request, res: Response) => {
		if (!allowCall(req.ip ?? 'unknown')) {
			res.status(429).json({ error: 'too many call requests; retry in a minute' });
			return;
		}

		const parsed = validateCall(req.body, deps.allowedNumbers);
		if (!parsed.ok) {
			res.status(400).json({ error: 'invalid call request; you have not been charged', details: parsed.errors });
			return;
		}

		const adapter = new ExpressAdapter(req);
		const result = await deps.paywall.processHTTPRequest({
			adapter,
			path: req.path,
			method: req.method,
			paymentHeader: adapter.getHeader('payment-signature') ?? adapter.getHeader('x-payment'),
		});

		if (result.type === 'payment-error') {
			res.status(result.response.status).set(result.response.headers).json(result.response.body ?? {});
			return;
		}
		if (result.type !== 'payment-verified') {
			res.status(500).json({ error: 'paywall did not engage for a paid route' });
			return;
		}

		const settled = await deps.paywall.processSettlement(result.paymentPayload, result.paymentRequirements, result.declaredExtensions);
		if (!settled.success) {
			log(`settlement failed: ${settled.errorReason} ${settled.errorMessage ?? ''}`);
			res.status(settled.response.status).set(settled.response.headers).json(settled.response.body ?? { error: settled.errorReason });
			return;
		}

		const job = deps.store.create({
			id: randomBytes(16).toString('hex'),
			status: 'calling',
			brief: parsed.call.brief,
			maxMinutes: parsed.call.maxMinutes,
			payment: { payer: settled.payer ?? 'unknown', amount: result.paymentRequirements.amount, transaction: settled.transaction },
		});
		log(`job ${job.id}: paid ${formatAusd(job.payment.amount)} AUSD in ${settled.transaction}, dialing ${job.brief.to}`);
		deps.start(job);
		res.status(202).set(settled.headers).json(jobView(job));
	});

	// Read-only and masked, so the dashboard may be served from anywhere.
	app.get('/v1/feed', (_req, res) => {
		res.set('Access-Control-Allow-Origin', '*').json(buildFeed(deps.store.all(), { payTo: deps.payTo, pricing: deps.pricing, provider: deps.provider }));
	});

	app.get('/v1/calls/:id', (req, res) => {
		const job = deps.store.get(req.params.id);
		if (!job) {
			res.status(404).json({ error: 'no call with that id' });
			return;
		}
		res.json(jobView(job));
	});

	app.use((err: unknown, _req: Request, res: Response, _next: unknown) => {
		// Body-parser errors (malformed JSON, oversized body) are the caller's, and say so.
		const status = (err as { status?: number }).status;
		if (status && status >= 400 && status < 500) {
			res.status(status).json({ error: err instanceof Error ? err.message : 'bad request' });
			return;
		}
		log(`unhandled error: ${err instanceof Error ? err.stack : String(err)}`);
		res.status(500).json({ error: 'internal error' });
	});

	return app;
}
