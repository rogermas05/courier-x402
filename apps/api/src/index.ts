import { fileURLToPath } from 'node:url';
import { AUSD, formatAusd, toAtomic } from '@dispatch/ausd';
import { allowlistFromEnv, reportOutcome, selectProvider } from '@dispatch/caller';
import type { Hex } from 'viem';
import { sellerWallet } from './chain.js';
import { callRoutes, createPaywall, localFacilitator } from './payments.js';
import { markInterrupted, runJob } from './runner.js';
import { createApp } from './server.js';
import { JobStore } from './store.js';

const DEFAULT_PORT = 4021;
/** The repo's .local/, wherever npm runs this from. */
const DEFAULT_JOB_DIR = fileURLToPath(new URL('../../../.local/jobs', import.meta.url));

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set; copy .env.example to .env`);
	return value;
}

async function main(): Promise<void> {
	const log = (message: string) => console.log(`[dispatch] ${message}`);
	const pricing = {
		base: toAtomic(process.env.PRICE_BASE_AUSD || '0.05'),
		perMinute: toAtomic(process.env.PRICE_PER_MINUTE_AUSD || '0.05'),
	};
	const wallet = sellerWallet(required('SELLER_PRIVATE_KEY') as Hex, process.env.RPC_URL || undefined);
	const store = new JobStore(process.env.JOB_DIR || DEFAULT_JOB_DIR);
	const provider = selectProvider();
	const allowedNumbers = allowlistFromEnv();
	if (allowedNumbers?.size === 0) log('DISPATCH_ALLOWED_NUMBERS is empty: every call will be refused before payment.');

	for (const job of markInterrupted(store)) log(`job ${job.id} was mid-call at the last shutdown; marked interrupted for review`);

	const paywall = await createPaywall(localFacilitator(wallet.facilitatorSigner), callRoutes(wallet.address, pricing));
	const runnerDeps = { store, provider, pricing, report: reportOutcome, refund: wallet.refund, log };

	const app = createApp({
		paywall,
		store,
		pricing,
		payTo: wallet.address,
		provider: provider.name,
		allowedNumbers,
		healthy: () => provider.healthy(),
		start: (job) => void runJob(job, runnerDeps).catch((err) => log(`job ${job.id}: runner crashed: ${err}`)),
		log,
	});

	const port = Number(process.env.PORT) || DEFAULT_PORT;
	app.listen(port, () => {
		log(`listening on :${port}  provider=${provider.name}  payTo=${wallet.address}`);
		log(`price: ${formatAusd(pricing.base)} AUSD + ${formatAusd(pricing.perMinute)} AUSD/min on ${AUSD.network}`);
	});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
