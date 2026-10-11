# Dispatch

A voice agent that makes phone calls for other AI agents, paid per call in AUSD over x402.

An agent that needs a phone call made has no way to make one. It has no number, no telephony
account and no real-time audio. Dispatch turns that into one HTTP request. The agent posts what
the call must achieve, gets a `402 Payment Required` quoting a price in AUSD, signs an ERC-3009
authorization, and retries. Dispatch settles the payment on Base Sepolia, places the call, and
returns the transcript and a structured outcome. Unused minutes go back to the agent in AUSD.

The paying agent never holds gas. It signs; Dispatch submits the authorization and pays for it.

The voice on the call is an ElevenLabs voice agent. ElevenLabs runs the conversation, and Telnyx
carries it as a SIP trunk.

A paid call on Base Sepolia, from a buyer wallet holding AUSD and no ETH:
[payment, 0.3 AUSD](https://sepolia.basescan.org/tx/0x355fb0295828b76bf1e67dc90ea36e3b6f2b01dade901a68d56df01a0a93025e)
for up to five minutes, then
[refund, 0.2 AUSD](https://sepolia.basescan.org/tx/0x35c79fdab27dfd78583b09944b6a25ce7d3302c74fd37de070c6c2a1dfaf60fe)
for the four minutes it did not use.

A real call placed by an ElevenLabs voice agent, paid the same way:
[0.2 AUSD for up to three minutes](https://sepolia.basescan.org/tx/0xbcf99cc74e20ae7a33d8eb588416dd20cd3f704ef60c763434249c6f5d9b2f44),
16 seconds on the phone, [0.1 AUSD refunded](https://sepolia.basescan.org/tx/0x14fa30537cbb94bf6f4d76c28c88c97c192c68350c88b0e26d62f1607b656d71).

## How a call is paid

```
agent                                   Dispatch                              Base Sepolia
-----                                   --------                              ------------
POST /v1/calls {to, objective}  ──────► validate (bad input: 400, free)
                                ◄────── 402  PAYMENT-REQUIRED: AUSD, amount, "Agora Dollar" v1
sign transferWithAuthorization
POST /v1/calls + PAYMENT-SIGNATURE ───► verify signature and balance
                                        settle  ─────────────────────────────► AUSD moves, Dispatch pays gas
                                ◄────── 202 {call_id, payment tx}
                                        dial, talk, summarise
GET /v1/calls/{id}              ◄────── outcome, transcript   refund  ───────► unused minutes back in AUSD
```

The order is the point. A request Dispatch would refuse is refused before any quote, so it costs
nothing. A call is dialed only after the payment has settled on-chain, never on a verified but
unsettled signature.

**Pricing.** The x402 `exact` scheme moves one fixed amount, signed before the call exists, so the
agent authorizes a ceiling: a base fee plus every minute it allows (defaults: 0.05 AUSD plus 0.05
AUSD a minute, so a ten-minute ceiling is 0.55). After the call Dispatch refunds the unused whole
minutes. A call that never connects is refunded in full.

## Layout

| Path | What it is |
|---|---|
| `apps/api` | The paid HTTP API. x402 resource server with an in-process facilitator, job store, refunds. |
| `apps/agent` | The paying side: an AUSD-only wallet with a per-call cap, a CLI, and an MCP server. |
| `apps/web` | The dashboard: every call, its x402 payment and refund on Base, and what was said. |
| `packages/caller` | The call engine: ElevenLabs voice agents over a Telnyx SIP trunk, a Telnyx-only provider, a mock, and the transcript-to-outcome report. |
| `packages/ausd` | AUSD on Base Sepolia: address, EIP-712 domain, faucet, amount conversion. |

## Run it

```bash
npm install
npm run wallets          # creates SELLER_ and BUYER_PRIVATE_KEY in .env, prints balances
```

The seller needs a little Base Sepolia ETH, since it pays gas for settlement and refunds. Send some
from any Base Sepolia faucet to the seller address `npm run wallets` printed. Then fund the buyer
with AUSD from Agora's faucet. The seller sends that request too, so the buyer still holds no ETH:

```bash
npm run wallets -- --fund
```

Start the API, then hire it:

```bash
npm run api
npm run hire -- --to +14155550123 --objective "Ask whether they have a table for two at 8pm tonight" --minutes 5
```

With `TELEPHONY_PROVIDER` unset, the mock provider dials nothing and says so in the transcript; the
payment and refund are still real.

## Real calls with ElevenLabs

Each paid call gets its own ElevenLabs voice agent, briefed with the objective and what it may
agree to, and deleted when the call ends. It dials out through a Telnyx SIP trunk, ends the call
itself, presses keypad tones for phone menus, and recognises voicemail. The conversation comes
back from ElevenLabs as the transcript, and its length sets the refund.

With `TELNYX_API_KEY`, `TELNYX_FROM_NUMBER` and `ELEVENLABS_API_KEY` in `.env`:

```bash
npm run setup:elevenlabs   # Telnyx SIP connection + ElevenLabs number import, saved to .env
```

Then set `TELEPHONY_PROVIDER=elevenlabs` and list the numbers Dispatch may call in
`DISPATCH_ALLOWED_NUMBERS`. With real telephony, any other number is refused before payment.

## Dashboard

```bash
npm run api    # in one terminal
npm run web    # in another, then open the URL it prints
```

The dashboard reads `GET /v1/feed` every few seconds: each call with its stage, the transcript,
the outcome, the x402 receipt and every AUSD transfer on Base Sepolia, linked to Basescan. Phone
numbers are masked to their last two digits. With no API reachable it shows calls recorded from
Base Sepolia instead, and says so in the header. `npm run export:feed -- <job id> ...` refreshes
that recording from the jobs you choose.

## Use it from any agent (MCP)

`npm run --silent mcp` serves three tools over stdio (`--silent` keeps npm's banner off the stdio channel): `place_phone_call`, `get_phone_call` and
`phone_call_wallet`. For Claude Code:

```bash
claude mcp add dispatch -- npm run --silent mcp --prefix /path/to/dispatch-x402
```

The spending cap (`MAX_PER_CALL_AUSD`, default 2) is enforced in the wallet, below the model. The
wallet also signs only for AUSD on Base Sepolia, whatever else a server offers, so a confused or
manipulated agent cannot sign for more, or in another token.

## API

| | |
|---|---|
| `POST /v1/calls` | Paid. `{to, objective, authorization?, on_behalf_of?, context?, max_minutes?}`. 402, then 202 with `call_id`. |
| `GET /v1/calls/{call_id}` | Status, then outcome, transcript, payment and refund transactions. |
| `GET /v1/quote?max_minutes=N` | What a call of up to N minutes costs. |
| `GET /v1/feed` | Every call for the dashboard, phone numbers masked. |
| `GET /` | Service description, for agents deciding whether to hire it. |

`authorization` is what Dispatch may agree to on the caller's behalf. Leave it out and the call
gathers information only and commits to nothing.

## AUSD notes

AUSD on Base Sepolia is `0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`, 6 decimals. It is not in
x402's default asset table, so every 402 names it explicitly with its EIP-712 domain, read from
the contract's `eip712Domain()`: name `Agora Dollar`, version `1`. Its `name()` returns `AUSD`,
which differs from the domain name. Signing over `AUSD` fails; signing over `Agora Dollar` passes.

That difference trips x402's failure diagnosis. When a transfer simulation fails, x402 checks
`name()` against the domain name before it checks the balance, so every failed AUSD payment is
reported as `token_name_mismatch`, including a payer who simply has no AUSD. Dispatch corrects the
reason by checking the balance itself (`apps/api/src/payments.ts`), so agents are told the real
cause.

## Tests

```bash
npm test
npm run typecheck
```

The server tests drive the real x402 client against the real resource server: real ERC-3009
signatures, with only the facilitator stubbed. They check that bad requests are never charged,
that nothing is dialed when settlement fails, and that the agent wallet refuses other tokens and
amounts over its cap.
