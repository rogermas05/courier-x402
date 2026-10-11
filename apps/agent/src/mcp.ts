import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { formatAusd } from '@dispatch/ausd';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { getCall, placeCall, quote } from './dispatch.js';
import { balances } from './wallet.js';

/**
 * Dispatch as tools, for any MCP-capable agent.
 *
 * The agent gets a phone without holding a phone number, a telephony account,
 * or gas: it holds AUSD, and each call is paid with one signed authorization.
 * The per-payment cap in MAX_PER_CALL_AUSD is enforced here, below the model,
 * so a confused or manipulated agent still cannot sign for more.
 */

const { dispatchUrl, wallet } = loadConfig();
const server = new McpServer({ name: 'dispatch', version: '0.1.0' });

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
const failure = (err: unknown) => ({ ...text(err instanceof Error ? err.message : String(err)), isError: true });

server.registerTool(
	'place_phone_call',
	{
		description:
			'Have Dispatch phone a business or person and pursue an objective: it navigates menus, waits on hold, and talks. ' +
			'Costs AUSD, paid automatically from this wallet; unused minutes are refunded. Returns a call_id at once; ' +
			'the call takes minutes, so check it with get_phone_call. Only call numbers the user asked you to call.',
		inputSchema: {
			to: z.string().describe('E.164 number to call, e.g. +14155550123'),
			objective: z.string().describe('What the call must achieve, in plain language'),
			authorization: z.string().optional().describe('What Dispatch may agree to on the user’s behalf. Omit to gather information only.'),
			on_behalf_of: z.string().optional().describe('Who the call is for, as the person answering would recognise them'),
			context: z.string().optional().describe('Facts the caller may need: names, account or order numbers, dates'),
			max_minutes: z.number().int().min(1).max(30).optional().describe('Ceiling on call length; the price is set by this. Default 10.'),
		},
	},
	async (args) => {
		try {
			const view = await placeCall(dispatchUrl, wallet.fetch, args);
			return text({ call_id: view.call_id, status: view.status, paid_ausd: view.payment.amount_ausd, payment: view.payment.explorer, next: 'Call get_phone_call with this call_id in about a minute.' });
		} catch (err) {
			return failure(err);
		}
	},
);

server.registerTool(
	'get_phone_call',
	{
		description: 'Status of a call placed with place_phone_call: in progress, or the outcome, transcript and refund.',
		inputSchema: { call_id: z.string() },
	},
	async ({ call_id }) => {
		try {
			return text(await getCall(dispatchUrl, call_id));
		} catch (err) {
			return failure(err);
		}
	},
);

server.registerTool(
	'phone_call_wallet',
	{ description: 'This agent’s AUSD balance, the per-call spending cap, and what a call costs.', inputSchema: {} },
	async () => {
		try {
			const [funds, price] = await Promise.all([balances(wallet.address), quote(dispatchUrl, 10)]);
			return text({ address: wallet.address, ausd: funds.ausd, eth: funds.eth, cap_per_call_ausd: formatAusd(wallet.maxPerCall), ten_minute_call_ausd: price.price_ausd, refund_policy: price.refund_policy });
		} catch (err) {
			return failure(err);
		}
	},
);

await server.connect(new StdioServerTransport());
