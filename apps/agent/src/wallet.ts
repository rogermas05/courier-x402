import { AUSD, formatAusd, toAtomic } from '@dispatch/ausd';
import type { PaymentRequirements } from '@x402/core/types';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch';
import { createPublicClient, erc20Abi, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

/**
 * The paying agent's wallet: AUSD only, no gas.
 *
 * It never sends a transaction. When Dispatch answers 402 it signs an ERC-3009
 * authorization for the quoted amount, and Dispatch submits it. Two guards sit
 * in front of the signature: it only ever pays in AUSD on the expected network,
 * whatever else a server offers, and never more than maxPerCall in one payment.
 */

export interface PayingWallet {
	address: Hex;
	fetch: typeof fetch;
	maxPerCall: bigint;
}

export function payingWallet(privateKey: Hex, maxPerCallAusd: string): PayingWallet {
	const account = privateKeyToAccount(privateKey);
	const maxPerCall = toAtomic(maxPerCallAusd);
	const onlyAusd = (_version: number, options: PaymentRequirements[]) =>
		options.filter((o) => o.network === AUSD.network && o.asset.toLowerCase() === AUSD.address.toLowerCase());

	const paying = wrapFetchWithPaymentFromConfig(fetch, {
		schemes: [{ network: AUSD.network, client: new ExactEvmScheme(account) }],
		policies: [onlyAusd],
		spendControls: { allowedAssets: [{ network: AUSD.network, asset: AUSD.address, maxAmountPerPayment: maxPerCall.toString() }] },
	});
	return { address: account.address, fetch: paying, maxPerCall };
}

export async function balances(address: Hex, rpcUrl: string = AUSD.rpcUrl): Promise<{ ausd: string; eth: string }> {
	const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
	const [ausd, eth] = await Promise.all([
		client.readContract({ address: AUSD.address, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
		client.getBalance({ address }),
	]);
	return { ausd: formatAusd(ausd), eth: (Number(eth) / 1e18).toString() };
}
