import { AUSD, formatAusd } from '@dispatch/ausd';
import { x402Facilitator } from '@x402/core/facilitator';
import { x402HTTPResourceServer, x402ResourceServer, type FacilitatorClient, type RoutesConfig } from '@x402/core/server';
import type { PaymentRequirements, SupportedResponse, VerifyResponse } from '@x402/core/types';
import type { FacilitatorEvmSigner } from '@x402/evm';
import { ExactEvmScheme as ExactEvmFacilitator } from '@x402/evm/exact/facilitator';
import { ExactEvmScheme as ExactEvmServer } from '@x402/evm/exact/server';
import { erc20Abi } from 'viem';
import { validateCall } from './input.js';
import { priceForCall, REFUND_POLICY, type Pricing } from './price.js';

/**
 * x402 for POST /v1/calls, priced per request and paid in AUSD.
 *
 * The facilitator runs in-process rather than at a hosted URL: AUSD is not in
 * the default asset tables hosted facilitators ship with, and running it here
 * means the same wallet that receives payment submits it, so the payer never
 * needs gas. The 402 names AUSD and its EIP-712 domain, and the payer signs an
 * ERC-3009 transferWithAuthorization over exactly that.
 */

export const CALL_ROUTE = 'POST /v1/calls';
/** How long a signed authorization stays valid. Long enough for an agent to decide, short enough to be stale soon. */
const AUTHORIZATION_TTL_SECONDS = 300;

const NAME_MISMATCH = 'invalid_exact_evm_token_name_mismatch';
const INSUFFICIENT_BALANCE = 'invalid_exact_evm_insufficient_balance';
const SIMULATION_FAILED = 'invalid_exact_evm_transaction_simulation_failed';

/**
 * Correct x402's diagnosis of a failed AUSD payment.
 *
 * When the transfer simulation fails, x402 compares the token's name() with the
 * EIP-712 domain name before it looks at the balance. AUSD's name() is "AUSD"
 * but its domain name is "Agora Dollar", so every AUSD failure is reported as a
 * name mismatch, including the common one: a payer without enough AUSD. The
 * domain is verified (a signature over it simulates cleanly), so the mismatch
 * is never the real cause; the balance is checked instead.
 */
export async function diagnose(result: VerifyResponse, requirements: PaymentRequirements, balanceOf: (owner: string) => Promise<bigint>): Promise<VerifyResponse> {
	if (result.isValid || result.invalidReason !== NAME_MISMATCH || !result.payer) return result;
	const balance = await balanceOf(result.payer).catch(() => null);
	const short = balance !== null && balance < BigInt(requirements.amount);
	return { ...result, invalidReason: short ? INSUFFICIENT_BALANCE : SIMULATION_FAILED };
}

export function localFacilitator(signer: FacilitatorEvmSigner): FacilitatorClient {
	const facilitator = new x402Facilitator().register(AUSD.network, new ExactEvmFacilitator(signer));
	const balanceOf = async (owner: string) =>
		(await signer.readContract({ address: AUSD.address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] })) as bigint;
	return {
		verify: async (payload, requirements) => diagnose(await facilitator.verify(payload, requirements), requirements, balanceOf),
		settle: (payload, requirements) => facilitator.settle(payload, requirements),
		// The facilitator types network as string; it only ever holds CAIP-2 ids registered above.
		getSupported: async () => facilitator.getSupported() as SupportedResponse,
	};
}

export function callRoutes(payTo: string, pricing: Pricing): RoutesConfig {
	return {
		[CALL_ROUTE]: {
			accepts: {
				scheme: 'exact',
				network: AUSD.network,
				payTo,
				maxTimeoutSeconds: AUTHORIZATION_TTL_SECONDS,
				// The body was validated before the paywall runs, so it parses here.
				price: (context) => {
					const parsed = validateCall(context.adapter.getBody?.(), null);
					if (!parsed.ok) throw new Error(`unpriceable request: ${parsed.errors.join('; ')}`);
					return {
						asset: AUSD.address,
						amount: priceForCall(pricing, parsed.call.maxMinutes).toString(),
						extra: { ...AUSD.eip712 },
					};
				},
			},
			// For agents that read the body rather than the PAYMENT-REQUIRED header.
			unpaidResponseBody: (context) => {
				const parsed = validateCall(context.adapter.getBody?.(), null);
				const amount = parsed.ok ? priceForCall(pricing, parsed.call.maxMinutes) : null;
				return {
					contentType: 'application/json',
					body: {
						error: 'payment required',
						...(amount !== null ? { price_ausd: formatAusd(amount) } : {}),
						how_to_pay: 'x402 exact scheme: sign an ERC-3009 transferWithAuthorization for AUSD and retry with the PAYMENT-SIGNATURE header. No gas needed.',
						refund_policy: REFUND_POLICY,
					},
				};
			},
			description: 'Dispatch places one phone call for you and returns the transcript and outcome. Unused minutes are refunded in AUSD.',
			mimeType: 'application/json',
			serviceName: 'Dispatch',
		},
	};
}

export async function createPaywall(facilitator: FacilitatorClient, routes: RoutesConfig): Promise<x402HTTPResourceServer> {
	const server = new x402ResourceServer(facilitator).register(AUSD.network, new ExactEvmServer());
	const http = new x402HTTPResourceServer(server, routes);
	await http.initialize();
	return http;
}
