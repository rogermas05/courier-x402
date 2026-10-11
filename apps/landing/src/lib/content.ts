/**
 * Facts shown on the page. Everything here is real and checkable: the call was
 * placed by an ElevenLabs voice agent, and both transfers are on Base Sepolia.
 */
export const LINKS = {
  repo: "https://github.com/rogermas05/dispatch-x402",
  explorerTx: "https://sepolia.basescan.org/tx/",
  explorerAddress: "https://sepolia.basescan.org/address/",
  x402: "https://www.x402.org",
  agora: "https://www.agora.finance",
} as const;

export const CHAIN = {
  network: "Base Sepolia",
  ausd: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  payer: "0xCe46456CE19F5de29F12De977E381caF957B03e9",
  payTo: "0x9593Dee73E9FCe588fB79D6294d1C1e4e14344bF",
  paymentTx: "0xbcf99cc74e20ae7a33d8eb588416dd20cd3f704ef60c763434249c6f5d9b2f44",
  refundTx: "0x14fa30537cbb94bf6f4d76c28c88c97c192c68350c88b0e26d62f1607b656d71",
  authorizedAusd: "0.2",
  refundedAusd: "0.1",
  allowedMinutes: 3,
} as const;

export type Speaker = "dispatch" | "them";

export interface Turn {
  speaker: Speaker;
  /** Seconds into the real call. */
  at: number;
  text: string;
}

/** The spoken turns of a paid call placed by an ElevenLabs voice agent (11 Oct 2026, 16 seconds). */
export const CALL = {
  durationSeconds: 16,
  /** Length of the spoken exchange on the transcript's own clock. */
  dialogueSeconds: 15,
  turns: [
    { speaker: "dispatch", at: 0, text: "Hi, I'm calling on behalf of Roger." },
    { speaker: "them", at: 4, text: "Hey. How's it going?" },
    { speaker: "dispatch", at: 6, text: "Good thanks! Quick question — what's your favourite colour?" },
    { speaker: "them", at: 10, text: "Red." },
    { speaker: "dispatch", at: 12, text: "Great, red it is. Thanks for your time, goodbye!" },
  ] satisfies Turn[],
} as const;

/** What another agent needs in order to hire Dispatch. */
export const HIRE = {
  protocol: "x402, exact scheme",
  asset: "AUSD, ERC-3009",
  price: "0.05 AUSD per call plus 0.05 AUSD per allowed minute",
  route: "POST /v1/calls",
  body: '{"to": "+1…", "objective": "…", "max_minutes": 5}',
  mcp: "claude mcp add dispatch -- npm run --silent mcp --prefix dispatch-x402",
} as const;

/** The pricing rule, shared by the page's calculator and the API. Atomic AUSD has 6 decimals. */
export const PRICING = { baseAusd: 0.05, perMinuteAusd: 0.05 } as const;
