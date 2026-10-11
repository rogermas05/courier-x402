/**
 * A thin client for the Dispatch API. The paying fetch does the x402 part;
 * this only shapes requests and reads answers.
 */

export interface CallRequest {
	to: string;
	objective: string;
	authorization?: string;
	on_behalf_of?: string;
	context?: string;
	max_minutes?: number;
}

/** The job as Dispatch reports it. Only the fields this client reads are typed. */
export interface CallView {
	call_id: string;
	status: 'calling' | 'completed' | 'failed' | 'interrupted';
	explanation: string;
	payment: { amount_ausd: string; transaction: string; explorer: string };
	refund: { status: string; amount_ausd?: string; explorer?: string };
	result?: { summary: string; objective_met: boolean; artifacts: Record<string, string>; human_follow_up: string | null; caveats: string[] };
	error?: string;
	poll_after_seconds?: number;
	[key: string]: unknown;
}

const DEFAULT_POLL_SECONDS = 15;

async function readJson(res: Response): Promise<any> {
	const text = await res.text();
	try {
		return JSON.parse(text);
	} catch {
		return { error: text.slice(0, 300) };
	}
}

function paymentRefusal(header: string | null): string | null {
	if (!header) return null;
	try {
		return (JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as { error?: string }).error ?? null;
	} catch {
		return null;
	}
}

export async function quote(baseUrl: string, maxMinutes: number): Promise<{ price_ausd: string; refund_policy: string }> {
	const res = await fetch(`${baseUrl}/v1/quote?max_minutes=${maxMinutes}`);
	const body = await readJson(res);
	if (!res.ok) throw new Error(body.error ?? `quote failed with ${res.status}`);
	return body;
}

/** Pays and starts the call. Throws with Dispatch's own explanation if it refused or payment did not settle. */
export async function placeCall(baseUrl: string, pay: typeof fetch, request: CallRequest): Promise<CallView> {
	const res = await pay(`${baseUrl}/v1/calls`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
	const body = await readJson(res);
	if (res.status === 402) {
		// After a paid retry, a 402 means the payment itself was refused; x402 says why in the header.
		const reason = paymentRefusal(res.headers.get('payment-required'));
		throw new Error(`payment refused${reason ? `: ${reason}` : ''}. Check the wallet holds enough AUSD on Base Sepolia.`);
	}
	if (res.status !== 202) {
		const details = Array.isArray(body.details) ? `: ${body.details.join('; ')}` : '';
		throw new Error(`${body.error ?? `Dispatch answered ${res.status}`}${details}`);
	}
	return body as CallView;
}

export async function getCall(baseUrl: string, callId: string): Promise<CallView> {
	const res = await fetch(`${baseUrl}/v1/calls/${encodeURIComponent(callId)}`);
	const body = await readJson(res);
	if (!res.ok) throw new Error(body.error ?? `status check failed with ${res.status}`);
	return body as CallView;
}

/** Poll until the call is over and any refund has been sent. */
export async function waitForCall(baseUrl: string, callId: string, onTick?: (view: CallView) => void): Promise<CallView> {
	for (;;) {
		const view = await getCall(baseUrl, callId);
		onTick?.(view);
		if (view.status !== 'calling' && view.refund.status !== 'sending') return view;
		await new Promise((r) => setTimeout(r, (view.poll_after_seconds ?? DEFAULT_POLL_SECONDS) * 1000));
	}
}
