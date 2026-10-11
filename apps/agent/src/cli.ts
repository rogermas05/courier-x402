import { parseArgs } from 'node:util';
import { formatAusd } from '@dispatch/ausd';
import { loadConfig } from './config.js';
import { placeCall, quote, waitForCall, type CallView } from './dispatch.js';
import { balances } from './wallet.js';

/**
 * Hire Dispatch from the terminal, paying in AUSD over x402.
 *
 *   npm run hire -- --to +14155550123 --objective "Ask if they have a table for two at 8pm tonight"
 */

const USAGE = `usage: npm run hire -- --to <E.164> --objective "<what the call must achieve>"
       [--for "<who it is on behalf of>"] [--authorization "<what may be agreed to>"]
       [--context "<facts the caller may need>"] [--minutes <1-30>]`;

function printResult(view: CallView): void {
	console.log(`\n${view.status.toUpperCase()}: ${view.explanation}`);
	if (view.result) {
		console.log(`\n${view.result.summary}`);
		for (const [k, v] of Object.entries(view.result.artifacts)) console.log(`  ${k}: ${v}`);
		if (view.result.human_follow_up) console.log(`\nStill to do: ${view.result.human_follow_up}`);
		for (const c of view.result.caveats) console.log(`  caveat: ${c}`);
	}
	if (view.error) console.log(`\nerror: ${view.error}`);
	console.log(`\npaid     ${view.payment.amount_ausd} AUSD  ${view.payment.explorer}`);
	console.log(`refund   ${view.refund.amount_ausd ?? '0'} AUSD  ${view.refund.explorer ?? view.refund.status}`);
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			to: { type: 'string' },
			objective: { type: 'string' },
			for: { type: 'string' },
			authorization: { type: 'string' },
			context: { type: 'string' },
			minutes: { type: 'string', default: '10' },
		},
	});
	if (!values.to || !values.objective) {
		console.error(USAGE);
		process.exit(2);
	}

	const { dispatchUrl, wallet } = loadConfig();
	const maxMinutes = Number(values.minutes);
	const before = await balances(wallet.address);
	const price = await quote(dispatchUrl, maxMinutes);
	console.log(`wallet   ${wallet.address}  ${before.ausd} AUSD, ${before.eth} ETH`);
	console.log(`quote    ${price.price_ausd} AUSD for up to ${maxMinutes} min (cap ${formatAusd(wallet.maxPerCall)})`);
	console.log(`         ${price.refund_policy}`);

	const started = await placeCall(dispatchUrl, wallet.fetch, {
		to: values.to,
		objective: values.objective,
		max_minutes: maxMinutes,
		...(values.for ? { on_behalf_of: values.for } : {}),
		...(values.authorization ? { authorization: values.authorization } : {}),
		...(values.context ? { context: values.context } : {}),
	});
	console.log(`paid     ${started.payment.amount_ausd} AUSD, signed only, no gas  ${started.payment.explorer}`);
	console.log(`calling  ${started.call_id}`);

	const done = await waitForCall(dispatchUrl, started.call_id, () => process.stdout.write('.'));
	printResult(done);
	const after = await balances(wallet.address);
	console.log(`\nwallet   ${after.ausd} AUSD, ${after.eth} ETH`);
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
