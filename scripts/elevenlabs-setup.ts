import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

/**
 * One-time setup so ElevenLabs voice agents can place calls over Telnyx.
 *
 *   npm run setup:elevenlabs
 *
 * On Telnyx it creates an outbound voice profile and a SIP credential
 * connection, both named dispatch-elevenlabs. Nothing existing is touched: the
 * account is shared with a production system, so this only ever adds, and the
 * profile carries its own spend and concurrency caps. The from-number stays
 * where it is; the connection only sets it as caller ID.
 *
 * On ElevenLabs it imports that number as a SIP trunk number pointing at
 * Telnyx, and writes ELEVENLABS_PHONE_NUMBER_ID to .env.
 *
 * Re-running reuses what earlier runs saved in .env.
 */

const NAME = 'dispatch-elevenlabs';
const TELNYX = 'https://api.telnyx.com/v2';
const ELEVENLABS = 'https://api.elevenlabs.io/v1';
const DAILY_SPEND_LIMIT_USD = '10.00';
const CONCURRENT_CALLS = 2;

function env(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`${name} is not set in .env`);
	return v;
}

function save(name: string, value: string): void {
	appendFileSync('.env', `${name}=${value}\n`);
	process.env[name] = value;
	console.log(`saved ${name} to .env`);
}

async function call<T>(base: string, path: string, headers: Record<string, string>, init: RequestInit = {}): Promise<T> {
	const res = await fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...headers } });
	const text = await res.text();
	if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${base}${path} -> ${res.status}: ${text.slice(0, 400)}`);
	return (text ? JSON.parse(text) : {}) as T;
}

const telnyx = <T>(path: string, init?: RequestInit) => call<T>(TELNYX, path, { Authorization: `Bearer ${env('TELNYX_API_KEY')}` }, init);
const elevenlabs = <T>(path: string, init?: RequestInit) => call<T>(ELEVENLABS, path, { 'xi-api-key': env('ELEVENLABS_API_KEY') }, init);

async function outboundProfile(): Promise<string> {
	const existing = await telnyx<{ data: Array<{ id: string; name: string }> }>(`/outbound_voice_profiles?filter%5Bname%5D%5Bcontains%5D=${NAME}`);
	const found = existing.data.find((p) => p.name === NAME);
	if (found) return found.id;
	const created = await telnyx<{ data: { id: string } }>('/outbound_voice_profiles', {
		method: 'POST',
		body: JSON.stringify({
			name: NAME,
			whitelisted_destinations: ['US', 'CA'],
			concurrent_call_limit: CONCURRENT_CALLS,
			daily_spend_limit: DAILY_SPEND_LIMIT_USD,
			daily_spend_limit_enabled: true,
		}),
	});
	console.log(`created Telnyx outbound voice profile ${created.data.id}`);
	return created.data.id;
}

async function sipConnection(profileId: string): Promise<void> {
	if (process.env.TELNYX_SIP_USERNAME && process.env.TELNYX_SIP_PASSWORD) return;
	const username = `dispatch${randomBytes(6).toString('hex')}`;
	const password = randomBytes(18).toString('base64url');
	const created = await telnyx<{ data: { id: string } }>('/credential_connections', {
		method: 'POST',
		body: JSON.stringify({
			connection_name: NAME,
			user_name: username,
			password,
			outbound: { outbound_voice_profile_id: profileId, ani_override: env('TELNYX_FROM_NUMBER'), ani_override_type: 'always' },
		}),
	});
	console.log(`created Telnyx SIP connection ${created.data.id}`);
	save('TELNYX_SIP_USERNAME', username);
	save('TELNYX_SIP_PASSWORD', password);
}

async function importNumber(): Promise<void> {
	if (process.env.ELEVENLABS_PHONE_NUMBER_ID) {
		console.log(`ElevenLabs number already imported: ${process.env.ELEVENLABS_PHONE_NUMBER_ID}`);
		return;
	}
	const imported = await elevenlabs<{ phone_number_id: string }>('/convai/phone-numbers', {
		method: 'POST',
		body: JSON.stringify({
			provider: 'sip_trunk',
			phone_number: env('TELNYX_FROM_NUMBER'),
			label: NAME,
			outbound_trunk_config: {
				address: 'sip.telnyx.com',
				transport: 'tcp',
				credentials: { username: env('TELNYX_SIP_USERNAME'), password: env('TELNYX_SIP_PASSWORD') },
			},
		}),
	});
	save('ELEVENLABS_PHONE_NUMBER_ID', imported.phone_number_id);
}

await sipConnection(await outboundProfile());
if (!process.env.ELEVENLABS_API_KEY) {
	console.log('\nTelnyx is ready. Add ELEVENLABS_API_KEY to .env and run this again to import the number into ElevenLabs.');
} else {
	await importNumber();
	console.log('\nDone. Set TELEPHONY_PROVIDER=elevenlabs in .env to place calls through ElevenLabs.');
}
