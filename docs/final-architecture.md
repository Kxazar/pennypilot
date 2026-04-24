# PennyPilot Final Architecture

PennyPilot has four layers.

## 1. Agent UI

The browser creates a finance task, runs a compact paid-fact review, and exports the expense report. It can run in two modes:

- `circle-gateway-x402`: wallet signs one Circle Gateway x402 batch payment and receipts are anchored on Arc.
- `local-x402-preview`: server-backed 402 challenge flow for repeatable tests.
- `offline`: browser-only fallback if the server is not running.

## 2. Provider API

`server.mjs` exposes paid fact providers:

- `/api/providers/kyb/facts`
- `/api/providers/sanctions/facts`
- `/api/providers/invoice/facts`
- `/api/providers/risk/facts`
- `/api/providers/fx/facts`
- `/api/providers/identity/facts`

Each endpoint returns x402 `402 Payment Required` unless the request includes `PAYMENT-SIGNATURE`. After Circle Gateway settlement, it returns:

- paid fact
- receipt hash
- request hash
- contract digest
- provider signature
- provider revenue update

In the live app path, the payment retry is a Gateway EIP-712 authorization signed once by the connected wallet for the selected proof batch. Preview mode still requires a challenge-matched local authorization, so a random header cannot settle a provider call.

## 3. Contract Audit Anchor

`AgentExpenseCard.sol` enforces:

- task budget
- max per call
- expiry
- provider allowlist
- duplicate receipt prevention
- provider signature requirement for strict policy tasks

The current Arc Testnet deployment includes six allowlisted providers, strict policy task `#1`, and one anchored provider-signed receipt. The proof is checked by `npm run contracts:verify:arc`.

For real x402, use:

```solidity
createStrictPolicyTask(...)
recordSpendWithProviderSignature(...)
recordSpendsWithProviderSignatures(...)
```

## 4. Real Settlement Rail

The live flow is now:

1. The connected wallet tops up Circle Gateway if needed.
2. The user-owned card creates a strict policy task delegated to the PennyPilot Arc relayer.
3. PennyPilot prepares the selected proof batch and returns one x402 `PAYMENT-REQUIRED`.
4. Browser signs one Gateway `TransferWithAuthorization` as `PAYMENT-SIGNATURE`.
5. Circle Gateway settles the batch payment.
6. Providers sign their receipt struct hashes.
7. PennyPilot anchors the receipt batch on the user's `AgentExpenseCard`.

## Why This Is Hackathon-Ready

- The product story is clear: a spend-controlled card for autonomous finance agents.
- The demo shows a short, user-facing sub-cent paid fact flow.
- The budget panel shows why policy needs to live before every machine purchase.
- The backend proves a real paid-provider shape instead of a pure frontend mock.
- The contract is deployed on Arc Testnet and contains a verifiable anchored receipt.
- The 50-transaction proof pack shows repeated sub-cent receipt anchoring below the `$0.01` per-action threshold.

## Current Proof Set

- Public demo: `https://pennypilot-five.vercel.app`
- Contract: `0x4c8e7ae58d71130185de198af9285e65bb333047`
- Strict policy task: `#1`
- Anchored receipt tx: `0x60064479e955f2b9474665c3ea2e1f8150f7dea3677ca10373ba7778a128f996`
- 50 tx proof task: `0x9f652d4cd39b9858cfbd4b66209769522537ef12b4fbb87efcd6992bfc8f8ee7`
- 50 tx total spend: `0.1805 USDC`
