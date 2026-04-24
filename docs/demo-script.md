# PennyPilot live demo script

## One-liner

PennyPilot lets an AI finance agent spend tiny amounts of USDC on paid financial facts while enforcing task budgets, per-call caps, provider accountability, and audit-ready receipts.

## What to show first

1. Open the public demo: `https://pennypilot-five.vercel.app`.
2. Point to the budget, per-call cap, wallet status, and Arc Testnet proof panel.
3. Open the contract link, task tx, anchored receipt tx, and 50-tx proof if judges ask for proof.
4. Explain that the app pays providers through Circle Gateway x402, then anchors provider-signed receipts on Arc.
5. Mention that the same proof can be verified from the repo with `npm run contracts:verify:arc` and `npm run contracts:verify-50:arc`.

## Live flow

1. Keep `Validate Nova Freight invoice`.
2. Keep policy budget at `$0.25`.
3. Keep max per call at `$0.006`.
4. Click `Run review`.
5. If Gateway balance is low, approve and deposit testnet USDC into Circle Gateway.
6. Sign one x402 `PAYMENT-SIGNATURE` prompt for the selected paid-fact batch.
7. Watch six paid facts settle from that batch, then show the receipt table and Arc anchor links.
8. Show the agent memo, remaining budget, provider signatures, and receipt proof.
9. Export JSON as the agent expense report.

## Proof points

- Contract: `0x4c8e7ae58d71130185de198af9285e65bb333047`
- Strict policy task: `#1`
- Anchored receipt tx: `0x60064479e955f2b9474665c3ea2e1f8150f7dea3677ca10373ba7778a128f996`
- Receipt hash: `0xb547677f15d71c38190c5ddcb00ccdd271830b74ad4347f7f4f4eaa9d4ad04c3`
- 50 tx proof task: `0x9f652d4cd39b9858cfbd4b66209769522537ef12b4fbb87efcd6992bfc8f8ee7`
- 50 tx total: `0.1805 USDC`

## Backup line if the wallet demo is flaky

The wallet path is live through Circle Gateway x402. If a browser wallet or Gateway balance is unavailable during judging, use the deployed Arc proof, 50-transaction proof, and verifier scripts to show that the receipt anchoring layer is already live and independently checkable.
