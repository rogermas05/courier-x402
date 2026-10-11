import type { CallProvider } from './provider.js';
import { ProviderError } from './provider.js';
import { greetingFor, instructionsFor } from './script.js';
import type { CallBrief, CallResult, CallStatus, Transcript } from '../types.js';

/**
 * ElevenLabs voice agent provider.
 *
 * ElevenLabs runs the whole conversation: speech recognition, the model, turn
 * taking and its own voice. Telnyx only carries the call, as a SIP trunk that
 * ElevenLabs dials out through (see scripts/elevenlabs-setup.ts).
 *
 * One agent is created per call and deleted afterwards, for the same reason as
 * the Telnyx provider: every job has a different objective and authorization,
 * and one agent per call means one conversation per call to read back.
 *
 * Endpoints used:
 *   POST   /v1/convai/agents/create
 *   POST   /v1/convai/sip-trunk/outbound-call
 *   GET    /v1/convai/conversations/{id}
 *   GET    /v1/convai/agents/{id}
 *   DELETE /v1/convai/agents/{id}
 *   GET    /v1/convai/phone-numbers/{id}
 */

const API = 'https://api.elevenlabs.io/v1';
const POLL_INTERVAL_MS = 5_000;
const RING_TIMEOUT_SECS = 60;
/** After hangup ElevenLabs spends a while processing before the conversation reads as done. */
const PROCESSING_SLACK_MS = 120_000;
/** Every agent Dispatch creates carries this prefix, and Dispatch refuses to delete anything without it. */
const AGENT_PREFIX = 'dispatch-';
/** A warm, clear default voice; override with ELEVENLABS_VOICE_ID. */
const DEFAULT_VOICE_ID = 'cjVigY5qzO86Huf0OWal';
/** ElevenLabs requires English agents to use a flash or turbo v2 model. */
const DEFAULT_TTS_MODEL = 'eleven_flash_v2';
const DEFAULT_LLM = 'claude-sonnet-4-6';
const BUILT_IN_TOOLS = ['end_call', 'play_keypad_touch_tone', 'voicemail_detection'] as const;
const UNANSWERED = new Set(['busy', 'no_answer', 'failed', 'voicemail']);

export interface ElevenLabsConfig {
	apiKey: string;
	/** The imported SIP trunk number calls are placed from. */
	phoneNumberId: string;
	voiceId?: string;
	ttsModel?: string;
	llm?: string;
	/** Injected in tests. */
	fetch?: typeof fetch;
	/** Injected in tests so polling does not wait. */
	sleep?: (ms: number) => Promise<void>;
}

interface ElevenLabsTurn {
	role: 'user' | 'agent';
	message?: string | null;
	time_in_call_secs: number;
}

interface ElevenLabsConversation {
	conversation_id: string;
	status: 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed';
	transcript: ElevenLabsTurn[];
	metadata: {
		call_duration_secs: number;
		termination_reason?: string;
		phone_call?: { call_result?: string | null } | null;
	};
}

/** The full shape ElevenLabs requires for a built-in tool; an empty object is rejected. */
function systemTool(name: string) {
	return { type: 'system', name, description: '', params: { system_tool_type: name } };
}

export class ElevenLabsCallProvider implements CallProvider {
	readonly name = 'elevenlabs';
	private readonly http: typeof fetch;
	private readonly sleep: (ms: number) => Promise<void>;

	constructor(private readonly cfg: ElevenLabsConfig) {
		this.http = cfg.fetch ?? fetch;
		this.sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
	}

	private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
		const res = await this.http(`${API}${path}`, {
			...init,
			headers: { 'xi-api-key': this.cfg.apiKey, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
		});
		if (!res.ok) {
			const body = await res.text().catch(() => '');
			throw new ProviderError(`elevenlabs ${init.method ?? 'GET'} ${path} -> ${res.status}: ${body.slice(0, 300)}`, res.status === 429 || res.status >= 500);
		}
		const text = await res.text();
		return (text ? JSON.parse(text) : {}) as T;
	}

	async healthy(): Promise<boolean> {
		try {
			await this.api(`/convai/phone-numbers/${this.cfg.phoneNumberId}`);
			return true;
		} catch {
			return false;
		}
	}

	async place(brief: CallBrief): Promise<CallResult> {
		const { agent_id: agentId } = await this.api<{ agent_id?: string }>('/convai/agents/create', {
			method: 'POST',
			body: JSON.stringify({
				name: `${AGENT_PREFIX}${Date.now()}`,
				conversation_config: {
					agent: {
						first_message: greetingFor(brief),
						language: 'en',
						prompt: {
							prompt: instructionsFor(brief, { keypad: 'play_keypad_touch_tone', hangup: 'end_call' }),
							llm: this.cfg.llm ?? DEFAULT_LLM,
							built_in_tools: Object.fromEntries(BUILT_IN_TOOLS.map((name) => [name, systemTool(name)])),
						},
					},
					tts: { voice_id: this.cfg.voiceId ?? DEFAULT_VOICE_ID, model_id: this.cfg.ttsModel ?? DEFAULT_TTS_MODEL },
					conversation: { max_duration_seconds: brief.maxDurationSeconds },
					// Someone on hold is not an idle caller: never end the call on silence alone.
					turn: { silence_end_call_timeout: -1 },
				},
			}),
		});
		if (!agentId) throw new ProviderError('elevenlabs did not return an agent id', false);

		try {
			const call = await this.api<{ success?: boolean; message?: string; conversation_id?: string | null }>('/convai/sip-trunk/outbound-call', {
				method: 'POST',
				body: JSON.stringify({
					agent_id: agentId,
					agent_phone_number_id: this.cfg.phoneNumberId,
					to_number: brief.to,
					telephony_call_config: { ringing_timeout_secs: RING_TIMEOUT_SECS },
				}),
			});
			if (!call.success || !call.conversation_id) {
				throw new ProviderError(`elevenlabs could not place the call: ${call.message ?? 'no conversation id'}`, false);
			}
			return await this.awaitConversation(call.conversation_id, brief.maxDurationSeconds);
		} finally {
			await this.deleteOwnAgent(agentId).catch(() => {});
		}
	}

	private async awaitConversation(conversationId: string, maxDurationSeconds: number): Promise<CallResult> {
		const deadline = Date.now() + (RING_TIMEOUT_SECS + maxDurationSeconds) * 1000 + PROCESSING_SLACK_MS;
		let convo: ElevenLabsConversation | null = null;
		while (Date.now() < deadline) {
			await this.sleep(POLL_INTERVAL_MS);
			convo = await this.api<ElevenLabsConversation>(`/convai/conversations/${conversationId}`).catch(() => convo);
			if (convo && (convo.status === 'done' || convo.status === 'failed')) break;
		}
		if (!convo) throw new ProviderError(`no conversation record for ${conversationId}`, true);
		return toCallResult(convo, maxDurationSeconds);
	}

	/** Delete an agent, but only after re-reading it and confirming Dispatch created it. */
	private async deleteOwnAgent(agentId: string): Promise<void> {
		const record = await this.api<{ name?: string }>(`/convai/agents/${agentId}`);
		if (!record.name?.startsWith(AGENT_PREFIX)) {
			console.error(`[dispatch] refusing to delete ElevenLabs agent ${agentId} ("${record.name}"): not ours.`);
			return;
		}
		await this.api(`/convai/agents/${agentId}`, { method: 'DELETE' });
	}
}

export function toCallResult(convo: ElevenLabsConversation, maxDurationSeconds: number): CallResult {
	const turns = convo.transcript
		.filter((t) => typeof t.message === 'string' && t.message.trim().length > 0)
		.map((t) => ({ speaker: (t.role === 'agent' ? 'agent' : 'other') as 'agent' | 'other', text: t.message!.trim(), atSeconds: t.time_in_call_secs }));
	const transcript: Transcript = { turns, text: turns.map((t) => `${t.speaker === 'agent' ? 'Dispatch' : 'Them'}: ${t.text}`).join('\n') };

	const callResult = convo.metadata.phone_call?.call_result ?? null;
	const theySpoke = turns.some((t) => t.speaker === 'other');
	const duration = convo.metadata.call_duration_secs;
	const status: CallStatus =
		(callResult && UNANSWERED.has(callResult)) || !theySpoke
			? 'unreachable'
			: duration >= maxDurationSeconds || /max.*duration/i.test(convo.metadata.termination_reason ?? '')
				? 'timeout'
				: 'completed';

	return { status, durationSeconds: duration, transcript, recordingUrl: null, providerCallId: convo.conversation_id };
}
