import { AUSD } from '@dispatch/ausd';
import { toFacilitatorEvmSigner } from '@x402/evm';
import { createWalletClient, erc20Abi, http, publicActions, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

/**
 * Dispatch's one wallet on Base Sepolia.
 *
 * It is the x402 payTo, so AUSD lands here. It is also the facilitator: it
 * submits the payer's signed ERC-3009 authorization and pays the gas, which is
 * why the paying agent needs AUSD and nothing else. And it sends refunds. One
 * key keeps the demo legible; production would split the roles.
 */

const RECEIPT_TIMEOUT_MS = 60_000;

export function sellerWallet(privateKey: Hex, rpcUrl: string = AUSD.rpcUrl) {
	const account = privateKeyToAccount(privateKey);
	const client = createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) }).extend(publicActions);

	const facilitatorSigner = toFacilitatorEvmSigner(
		{
			address: account.address,
			readContract: (args) => client.readContract(args as Parameters<typeof client.readContract>[0]),
			verifyTypedData: (args) => client.verifyTypedData(args as Parameters<typeof client.verifyTypedData>[0]),
			writeContract: (args) => client.writeContract(args as Parameters<typeof client.writeContract>[0]),
			sendTransaction: (args) => client.sendTransaction(args as Parameters<typeof client.sendTransaction>[0]),
			waitForTransactionReceipt: (args) => client.waitForTransactionReceipt(args),
			getCode: (args) => client.getCode(args),
		},
		{ confirmationTimeoutMs: RECEIPT_TIMEOUT_MS },
	);

	/** Send AUSD back to a payer and wait until it is mined. */
	async function refund(to: string, amount: bigint): Promise<string> {
		const hash = await client.writeContract({ address: AUSD.address, abi: erc20Abi, functionName: 'transfer', args: [to as Hex, amount] });
		const receipt = await client.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
		if (receipt.status !== 'success') throw new Error(`refund transaction ${hash} reverted`);
		return hash;
	}

	return { address: account.address, client, facilitatorSigner, refund };
}
