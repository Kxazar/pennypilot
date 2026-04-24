# PennyPilot final video plan

Target length: 2:30 to 3:00.

## Recording rule

Do not jump between the deck and the app during the slide section. Record the video in three clean parts:

1. Pitch deck only.
2. Live app demo only.
3. Proof links only.

This keeps the story professional and easy to follow.

## Tabs to prepare before recording

1. Deck PDF: `presentation/PennyPilot-video-pitch.pdf`
2. Live app: `https://pennypilot-five.vercel.app`
3. GitHub repo: `https://github.com/Kxazar/pennypilot`
4. Arc contract: `https://testnet.arcscan.app/address/0x4c8e7ae58d71130185de198af9285e65bb333047`
5. Anchored receipt tx: `https://testnet.arcscan.app/tx/0x60064479e955f2b9474665c3ea2e1f8150f7dea3677ca10373ba7778a128f996`
6. 50+ tx proof: `https://testnet.arcscan.app/tx/0x9f652d4cd39b9858cfbd4b66209769522537ef12b4fbb87efcd6992bfc8f8ee7`
7. Circle Faucet if needed: `https://faucet.circle.com`
8. Circle x402 docs if needed: `https://developers.circle.com/gateway/nanopayments/concepts/x402`

## Timeline

- 0:00-1:05: Pitch deck, slides 1-5.
- 1:05-2:10: Live app demo.
- 2:10-2:45: Arc/Circle proof links.
- 2:45-3:00: Close.

## Part 1: pitch deck only

### Slide 1: PennyPilot

Say:

> PennyPilot is a spend-control card for AI finance agents. The agent can buy small paid financial facts through Circle Gateway x402, while every receipt is anchored on Arc. The goal is supervised machine spending: useful autonomy without losing budget control or auditability.

Show:

- Product name.
- Average paid action.
- Policy budget.
- Max per fact.
- 50+ proof signal.

### Slide 2: Tiny Spend Needs Control

Say:

> AI agents can buy useful facts, but a wallet balance alone is too risky. These calls are too small for traditional payment economics, too frequent for manual approval, and hard to trust without receipts. PennyPilot turns nano-payments into supervised procurement.

Show:

- Tiny spend problem.
- Need for policy.
- Need for receipts.

### Slide 3: Batch-Controlled Agent Spend

Say:

> The user defines the policy: task budget, max price per fact, provider allowlist, and how many proofs the agent may buy. Instead of signing every proof separately, the user signs once for the selected batch.

Show:

- The numbered batch flow.
- The single batch authorization idea.
- The cost summary.

### Slide 4: Payment First, Proof Next

Say:

> The flow starts with policy. A paid API returns an x402 payment request, the wallet signs one batch authorization, Circle Gateway verifies the payment, providers return signed receipts, and PennyPilot anchors the receipt batch on Arc.

Show:

- Policy.
- x402/Gateway.
- Provider receipts.
- Arc anchor.

### Slide 5: Agentic Commerce With Guardrails

Say:

> PennyPilot is a reusable pattern for agentic commerce with guardrails. Agents can buy what they need, but spend never goes dark: the user sets policy, x402 handles payment authorization, providers return signed receipts, and Arc keeps the audit trail verifiable.

Show:

- 60 max proofs per batch.
- 50+ verified receipt transactions.
- Less than one cent per paid action.
- One batch authorization.

## Part 2: live app demo only

Open: `https://pennypilot-five.vercel.app`

Say:

> Now here is the live product. The user controls the budget, the max price per fact, and how many paid facts the agent can buy in this task.

Show in this order:

1. Budget field: `$0.25`.
2. Max per fact field: `$0.006`.
3. Facts field: set or point to `60` to show the 50+ requirement is supported.
4. Wallet/connect area.
5. Click the review/run button only if the wallet is ready.
6. Show the one batch authorization prompt if it appears.
7. Show receipt rows.
8. Show proof drawer and Arc links.

Say:

> The important product change is that the selected proof batch shares one authorization. The user is not signing each proof one by one.

If the wallet flow is slow, do not wait on camera. Say:

> I will use the already recorded on-chain proof so the same flow can be verified from Arc.

## Part 3: proof links only

### Arc contract

Open: `https://testnet.arcscan.app/address/0x4c8e7ae58d71130185de198af9285e65bb333047`

Say:

> This is the deployed PennyPilot contract on Arc Testnet.

Show:

- Contract address.
- Arc Testnet explorer page.

### Anchored receipt transaction

Open: `https://testnet.arcscan.app/tx/0x60064479e955f2b9474665c3ea2e1f8150f7dea3677ca10373ba7778a128f996`

Say:

> This is an anchored provider receipt transaction. Gateway handles payment authorization, and Arc stores the verifiable receipt trail.

Show:

- Transaction page.
- Status.
- Hash.

### 50+ transaction proof

Open: `https://testnet.arcscan.app/tx/0x9f652d4cd39b9858cfbd4b66209769522537ef12b4fbb87efcd6992bfc8f8ee7`

Say:

> This proves the repeated nano-payment pattern at real demo scale: more than 50 receipt transactions, not just a single happy-path demo.

Show:

- Transaction page.
- Arc Testnet status.

### GitHub repo

Open: `https://github.com/Kxazar/pennypilot`

Say:

> The repo includes the app, contract, verifier scripts, and documentation, so the result is reproducible.

Show:

- README.
- Scripts or docs if visible.

## Optional Circle proof

Use this only if you have time. Do not make it a long Console tour.

Open: `https://faucet.circle.com`

Say:

> On the Circle side, the demo uses testnet USDC and x402-style payment authorization through Gateway. The user funds or deposits once, then authorizes the selected proof batch.

Show:

- Arc Testnet USDC faucet page, if needed.
- Do not show API keys.
- Do not show `.env`.

## Final line

Say:

> PennyPilot is not just a checkout demo. It is supervised machine spending: tiny paid API calls, strict policy, provider accountability, and Arc-verifiable receipts.
