# PennyPilot forum post

## Title

PennyPilot: spend controls and audit receipts for AI agents buying paid financial facts

## Summary

PennyPilot is a small fintech primitive for agentic finance. It gives an AI agent a tiny USDC task budget, lets it buy paid API facts through Circle Gateway x402, and records provider-signed receipts against strict on-chain spend controls on Arc.

Public demo: https://pennypilot-five.vercel.app
GitHub: https://github.com/Kxazar/pennypilot
Video: paste final demo recording URL after upload

The demo focuses on a simple but high-leverage workflow: before approving an invoice, onboarding a merchant, or routing a treasury payout, an agent can buy only the facts it needs: KYB, sanctions, invoice proof, fraud, identity, and FX signals. Each call costs fractions of a cent, must fit under a per-call cap, and returns an audit-ready receipt.

## Why this matters

Crypto payment rails are usually optimized for user payments, swaps, and transfers. PennyPilot explores a different shape: machine spending where every tiny payment has a business purpose, a provider, a receipt hash, and a policy reason.

This makes AI agents easier to supervise:

- The wallet may hold testnet USDC, but each task receives a separate budget.
- Providers must be allowlisted.
- A strict policy task can require provider signatures.
- Receipt hashes cannot be replayed.
- A verifier can read the contract and check that the anchored receipt matches the provider-signed digest.

## What works now

- Public wallet-first demo on Vercel.
- Circle Gateway x402 payment challenge, signature, verification, and settlement path.
- Provider-signed receipts for paid facts.
- Compact 6-fact agent review under a `$0.25` budget.
- Arc Testnet contract deployment.
- Six demo providers allowlisted on-chain.
- One strict policy task created on-chain.
- One provider-signed receipt anchored on-chain.
- One 50+ transaction proof pack recorded on Arc Testnet.
- Read-only verifier script for the deployed proof.

## Arc Testnet proof

- Contract: `0x4c8e7ae58d71130185de198af9285e65bb333047`
- Deploy tx: `0x5bb0754c0b95421797eae3bcd96199ab55f8534e59bdf36c9a5b218e4849a1bb`
- Policy task tx: `0x86a4d76dddead84017d1d49c585c1cf8e647b53564832e7809b77b3f788eb63b`
- Anchored receipt tx: `0x60064479e955f2b9474665c3ea2e1f8150f7dea3677ca10373ba7778a128f996`
- 50 tx task: `0x9f652d4cd39b9858cfbd4b66209769522537ef12b4fbb87efcd6992bfc8f8ee7`
- 50 tx total spend: `0.1805 USDC`

## Unit economics

The compact review demo spends `$0.023308` across `6` paid facts, or about `$0.003885` per action on average. The 50-transaction Arc proof keeps each paid action under the `$0.01` hackathon threshold. That is the point of the project: these agent purchases are too small for traditional high-fee transaction paths, but meaningful once payments, policy, and receipts can all live on a nano-payment rail.

## How to verify

Run:

```bash
npm install
npm run contracts:compile
npm test
npm run contracts:verify:arc
npm run contracts:verify-50:arc
```

The verifier reads Arc Testnet state and checks contract bytecode, task budget, per-call cap, provider allowlist, receipt replay status, provider spend, and digest equality.
