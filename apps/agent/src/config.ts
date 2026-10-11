import type { Hex } from 'viem';
import { payingWallet, type PayingWallet } from './wallet.js';

const DEFAULT_URL = 'http://localhost:4021';
const DEFAULT_MAX_PER_CALL_AUSD = '2';

export interface AgentConfig {
	dispatchUrl: string;
	wallet: PayingWallet;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
	const key = env.BUYER_PRIVATE_KEY;
	if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('BUYER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key; run `npm run wallets` to create one');
	return {
		dispatchUrl: (env.DISPATCH_URL || DEFAULT_URL).replace(/\/$/, ''),
		wallet: payingWallet(key as Hex, env.MAX_PER_CALL_AUSD || DEFAULT_MAX_PER_CALL_AUSD),
	};
}
