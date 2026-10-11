import { describe, expect, it } from 'vitest';
import { ElevenLabsCallProvider, toCallResult } from './elevenlabs.js';
import type { CallBrief } from '../types.js';

const brief: CallBrief = { to: '+14155550123', objective: 'Ask if they are open Sunday.', authorization: 'Nothing.', onBehalfOf: 'Aman', maxDurationSeconds: 300 };

type Route = (body: any) => { status?: number; json: unknown };

/** A fake ElevenLabs API that records what Dispatch sent it. */
function fakeApi(routes: Record<string, Route>) {
	const calls: Array<{ method: string; path: string; body: any }> = [];
	const http = (async (url: string, init: RequestInit = {}) => {
		const path = url.replace('https://api.elevenlabs.io/v1', '');
		const method = init.method ?? 'GET';
		const body = init.body ? JSON.parse(String(init.body)) : undefined;
		calls.push({ method, path, body });
		const route = routes[`${method} ${path}`];
		if (!route) return new Response('not found', { status: 404 });
		const out = route(body);
		return new Response(JSON.stringify(out.json), { status: out.status ?? 200 });
	}) as typeof fetch;
	return { http, calls };
}

const done = (overrides: object = {}) => ({
	conversation_id: 'conv_1',
	status: 'done',
	transcript: [
		{ role: 'agent', message: "Hi, I'm calling on behalf of Aman.", time_in_call_secs: 0 },
		{ role: 'user', message: 'Yes, we open at ten on Sundays.', time_in_call_secs: 4 },
		{ role: 'agent', message: null, time_in_call_secs: 6 },
	],
	metadata: { call_duration_secs: 42, phone_call: { call_result: 'answered' } },
	...overrides,
});

function provider(routes: Record<string, Route>) {
	const api = fakeApi({
		'POST /convai/agents/create': () => ({ json: { agent_id: 'agent_1' } }),
		'POST /convai/sip-trunk/outbound-call': () => ({ json: { success: true, message: 'ok', conversation_id: 'conv_1' } }),
		'GET /convai/conversations/conv_1': () => ({ json: done() }),
		'GET /convai/agents/agent_1': () => ({ json: { name: 'dispatch-1' } }),
		'DELETE /convai/agents/agent_1': () => ({ json: {} }),
		...routes,
	});
	const p = new ElevenLabsCallProvider({ apiKey: 'k', phoneNumberId: 'pn_1', fetch: api.http, sleep: async () => {} });
	return { p, calls: api.calls };
}

describe('ElevenLabsCallProvider', () => {
	it('briefs a per-call agent, dials through the SIP trunk, and returns the transcript', async () => {
		const { p, calls } = provider({});
		const result = await p.place(brief);

		const agent = calls.find((c) => c.path === '/convai/agents/create')!.body.conversation_config;
		expect(agent.agent.first_message).toBe("Hi, I'm calling on behalf of Aman.");
		expect(agent.agent.prompt.prompt).toContain('Ask if they are open Sunday.');
		expect(agent.agent.prompt.prompt).toContain('end_call');
		expect(agent.conversation.max_duration_seconds).toBe(300);
		expect(agent.agent.prompt.built_in_tools.end_call).toEqual({ type: 'system', name: 'end_call', description: '', params: { system_tool_type: 'end_call' } });
		expect(agent.tts.model_id).toBe('eleven_flash_v2');
		expect(calls.find((c) => c.path === '/convai/sip-trunk/outbound-call')!.body).toMatchObject({ agent_id: 'agent_1', agent_phone_number_id: 'pn_1', to_number: '+14155550123' });

		expect(result).toMatchObject({ status: 'completed', durationSeconds: 42, providerCallId: 'conv_1' });
		expect(result.transcript.turns).toHaveLength(2);
		expect(result.transcript.text).toContain('Them: Yes, we open at ten on Sundays.');
	});

	it('deletes the agent after the call', async () => {
		const { p, calls } = provider({});
		await p.place(brief);
		expect(calls.some((c) => c.method === 'DELETE' && c.path === '/convai/agents/agent_1')).toBe(true);
	});

	it('refuses to delete an agent it did not create', async () => {
		const { p, calls } = provider({ 'GET /convai/agents/agent_1': () => ({ json: { name: 'production-receptionist' } }) });
		await p.place(brief);
		expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
	});

	it('still deletes the agent when the call cannot be placed', async () => {
		const { p, calls } = provider({ 'POST /convai/sip-trunk/outbound-call': () => ({ json: { success: false, message: 'trunk rejected', conversation_id: null } }) });
		await expect(p.place(brief)).rejects.toThrow(/trunk rejected/);
		expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
	});
});

describe('toCallResult', () => {
	it('treats busy, no answer and voicemail as unreachable', () => {
		for (const call_result of ['busy', 'no_answer', 'voicemail']) {
			expect(toCallResult(done({ metadata: { call_duration_secs: 20, phone_call: { call_result } } }) as never, 300).status).toBe('unreachable');
		}
	});

	it('treats a call where only Dispatch spoke as unreachable', () => {
		const convo = done({ transcript: [{ role: 'agent', message: 'Hello?', time_in_call_secs: 0 }] });
		expect(toCallResult(convo as never, 300).status).toBe('unreachable');
	});

	it('reports a call that ran to its ceiling as a timeout', () => {
		expect(toCallResult(done({ metadata: { call_duration_secs: 300, phone_call: { call_result: 'answered' } } }) as never, 300).status).toBe('timeout');
	});
});
