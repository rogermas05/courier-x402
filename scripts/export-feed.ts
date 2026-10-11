import { readFileSync, writeFileSync } from 'node:fs';
import { toAtomic } from '@dispatch/ausd';
import { privateKeyToAccount } from 'viem/accounts';
import { buildFeed } from '../apps/api/src/feed.js';
import type { Job } from '../apps/api/src/store.js';

/**
 * Snapshot chosen calls into the dashboard's recorded feed, which it shows
 * when no API is reachable (a static deploy, a demo without the server).
 *
 *   npm run export:feed -- <job id> [<job id> ...]
 *
 * Only the named jobs are exported, through the same masking as /v1/feed.
 */

const ids = process.argv.slice(2);
if (ids.length === 0) throw new Error('name the job ids to export');
const jobs = ids.map((id) => JSON.parse(readFileSync(`.local/jobs/${id}.json`, 'utf8')) as Job);
const key = process.env.SELLER_PRIVATE_KEY;
if (!key) throw new Error('SELLER_PRIVATE_KEY is not set');

const feed = buildFeed(jobs, {
	payTo: privateKeyToAccount(key as `0x${string}`).address,
	pricing: { base: toAtomic(process.env.PRICE_BASE_AUSD || '0.05'), perMinute: toAtomic(process.env.PRICE_PER_MINUTE_AUSD || '0.05') },
	provider: 'elevenlabs',
});
writeFileSync('apps/web/public/recorded-feed.json', `${JSON.stringify(feed, null, 2)}\n`);
console.log(`exported ${feed.calls.length} calls to apps/web/public/recorded-feed.json`);
