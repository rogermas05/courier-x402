import { fileURLToPath } from 'node:url';
import type { Hex } from 'viem';
import { sellerWallet } from './chain.js';
import { retryFailedRefunds } from './runner.js';
import { JobStore } from './store.js';

/** npm run refunds: send every refund that is owed but was never sent. */

const DEFAULT_JOB_DIR = fileURLToPath(new URL('../../../.local/jobs', import.meta.url));
const key = process.env.SELLER_PRIVATE_KEY;
if (!key) throw new Error('SELLER_PRIVATE_KEY is not set');

const wallet = sellerWallet(key as Hex, process.env.RPC_URL || undefined);
const results = await retryFailedRefunds(new JobStore(process.env.JOB_DIR || DEFAULT_JOB_DIR), { refund: wallet.refund, log: (m) => console.log(m) });
console.log(results.length ? `${results.filter((j) => j.refund?.transaction).length}/${results.length} refunds sent` : 'no refunds owed');
