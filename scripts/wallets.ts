import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { AUSD, formatAusd } from '@dispatch/ausd';
import { createWalletClient, erc20Abi, formatEther, http, parseAbi, publicActions, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

/**
 * Set up and inspect the two wallets.
 *
 *   npm run wallets           create missing keys in .env, print balances
 *   npm run wallets -- --fund the seller asks Agora's faucet to send AUSD to the buyer
 *
 * The seller needs a little Base Sepolia ETH: it submits payments and refunds.
 * The buyer never does, and funding it from the seller keeps it that way.
 */

const ENV = '.env';
const faucetAbi = parseAbi(['function requestFunds(address _receiver)', 'function faucetDripAmount() view returns (uint256)']);

function ensureKey(name: string): Hex {
	const current = existsSync(ENV) ? readFileSync(ENV, 'utf8').match(new RegExp(`^${name}=(0x[0-9a-fA-F]{64})\\s*$`, 'm'))?.[1] : undefined;
	if (current) return current as Hex;
	const key = generatePrivateKey();
	appendFileSync(ENV, `${name}=${key}\n`);
	console.log(`created ${name} in ${ENV}`);
	return key;
}

const seller = createWalletClient({ account: privateKeyToAccount(ensureKey('SELLER_PRIVATE_KEY')), chain: baseSepolia, transport: http(AUSD.rpcUrl) }).extend(publicActions);
const buyer = privateKeyToAccount(ensureKey('BUYER_PRIVATE_KEY'));

async function show(label: string, address: Hex): Promise<void> {
	const [ausd, eth] = await Promise.all([
		seller.readContract({ address: AUSD.address, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
		seller.getBalance({ address }),
	]);
	console.log(`${label.padEnd(7)} ${address}  ${formatAusd(ausd).padStart(10)} AUSD  ${formatEther(eth)} ETH`);
}

if (process.argv.includes('--fund')) {
	const drip = await seller.readContract({ address: AUSD.faucet, abi: faucetAbi, functionName: 'faucetDripAmount' });
	console.log(`asking the Agora faucet for ${formatAusd(drip)} AUSD for the buyer...`);
	const hash = await seller.writeContract({ address: AUSD.faucet, abi: faucetAbi, functionName: 'requestFunds', args: [buyer.address] });
	const receipt = await seller.waitForTransactionReceipt({ hash });
	console.log(`${receipt.status}  ${AUSD.explorer}/tx/${hash}`);
}

await show('seller', seller.account.address);
await show('buyer', buyer.address);
console.log(`\nThe seller pays gas for settlement and refunds; fund it with Base Sepolia ETH from any faucet.`);
