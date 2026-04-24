# PennyPilot

PennyPilot is a near-final hackathon MVP for Circle Arc and Nanopayments. It treats an AI agent like a finance employee with a small USDC spend policy, paid provider APIs, and an auditable receipt trail.

The app now supports the real Circle Gateway path:

- The public wallet flow uses Circle Gateway x402 payments for paid provider calls.
- The user keeps USDC in Gateway, signs one gasless batch `PAYMENT-SIGNATURE` for the selected proofs, and PennyPilot anchors the provider-signed receipt batch on Arc.
- A local `x402-preview` path remains for repeatable tests by setting `PENNYPILOT_X402_MODE=preview`.

## Public demo

Live Vercel demo:

- https://pennypilot-five.vercel.app

Source:

- https://github.com/Kxazar/pennypilot

Open it in a browser with MetaMask or Rabby if you want to test the wallet flow directly.

## Run

```bash
npm install
npm run contracts:compile
npm run dev
```

Open `http://localhost:4173`.

If a stale local server is already running, stop the old node process and restart `npm run dev` so `/api/config` returns the current Arc Testnet proof.

## What works now

- The app creates an agent task with a policy budget and per-call cap.
- Any connected wallet can create its own user-owned spend card.
- The backend exposes paid provider endpoints under `/api/providers/:id/facts`.
- The batch proof endpoint returns one real x402 `PAYMENT-REQUIRED` challenge for the selected proof count.
- The browser signs one Circle Gateway EIP-712 payment and retries with `PAYMENT-SIGNATURE`.
- Circle Gateway verifies and settles the batch payment.
- Providers return paid facts, receipt hashes, contract digests, and provider signatures.
- PennyPilot relays `recordSpendsWithProviderSignatures()` to anchor the receipt batch on the user's spend card.
- The UI runs a compact paid-fact review, records provider receipts, and exports JSON.
- The UI shows the deployed Arc Testnet contract, strict policy task, and one anchored provider-signed receipt.
- The public Vercel deployment exposes the same config and sponsored card creation endpoints used by the wallet UI.
- Solidity contracts compile and artifacts are written to `artifacts/contracts`.

Generate the repeatable demo report:

```bash
npm run demo:report
```

Latest report: `reports/pennypilot-demo-report.json`.

## Why the economics matter

PennyPilot is built around sub-cent machine purchases:

- Compact review path: `6` paid facts
- Total compact review spend: `$0.023308`
- Average paid action: `$0.003885`
- Verified 50+ tx proof: `50` Arc Testnet receipt transactions
- Total 50 tx spend: `$0.1805`
- Per-action ceiling: `<= $0.01`

That is the core hackathon claim: these API purchases are economically meaningful only when the payment rail can support tiny, frequent, policy-bound actions. A traditional high-fee transaction path would erase the provider margin on calls priced at a few thousandths of a dollar.

## Demo script

1. Start the app with `npm run dev`.
2. Choose `Validate Nova Freight invoice`.
3. Keep budget at `$0.25` and max per call at `$0.006`.
4. Click `Run review`.
5. Point to the Arc Testnet proof panel:
   - `Contract`: deployed spend-control contract
   - `Policy task`: on-chain budget and per-call cap
   - `Anchored receipt`: provider-signed spend event
6. Point to the decision panel:
   - `Provider API`: Circle Gateway x402 challenge and settlement path
   - `Task`: backend task id
   - `Receipt proof`: provider signature required
   - `Contract`: strict policy receipt path
7. Open the receipts table and show provider-signed hashes.
8. Export JSON for the expense report.

## Required video flow

Use `docs/video-script.md` as the recording script for the submission video. It covers:

- public demo walkthrough
- wallet-funded spend card flow
- Arc explorer proof
- the required transaction-flow segment for judges

## Submission assets

- Demo script: `docs/demo-script.md`
- Video script: `docs/video-script.md`
- Final submission summary: `docs/final-submission.md`
- Circle feedback copy: `docs/circle-feedback-draft.md`
- Arc forum copy: `docs/arc-forum-draft.md`
- Twitter/X copy: `docs/twitter-draft.md`
- Submission checklist: `docs/submission-checklist.md`
- Final presentation deck: `presentation/PennyPilot-hackathon-demo.pptx`
- Presentation PDF: `presentation/PennyPilot-hackathon-demo.pdf`
- Social card: `assets/pennypilot-twitter-card.svg`
- Cover image: `assets/pennypilot-cover-16x9.png`

## Contract layer

Primary contract:

- `contracts/AgentExpenseCard.sol`

Modes:

- `PolicyOnly`: external rail such as x402/Gateway pays providers, while the contract enforces budget and anchors receipts.
- `Escrowed`: contract holds funds and transfers provider payments directly.
- `StrictPolicy`: use `createStrictPolicyTask()` plus `recordSpendWithProviderSignature()` for one receipt or `recordSpendsWithProviderSignatures()` for a batch.

Compile:

```bash
npm run contracts:compile
```

Deploy helper:

```bash
DEPLOYER_PRIVATE_KEY=0x... npm run contracts:deploy:arc
```

Current Arc Testnet deployment:

- Contract: `0x4c8e7ae58d71130185de198af9285e65bb333047`
- Deploy tx: `0x5bb0754c0b95421797eae3bcd96199ab55f8534e59bdf36c9a5b218e4849a1bb`
- Explorer: https://testnet.arcscan.app/address/0x4c8e7ae58d71130185de198af9285e65bb333047

Current on-chain proof:

- Strict policy task: `#1`
- Task tx: `0x86a4d76dddead84017d1d49c585c1cf8e647b53564832e7809b77b3f788eb63b`
- Anchored receipt tx: `0x60064479e955f2b9474665c3ea2e1f8150f7dea3677ca10373ba7778a128f996`
- Receipt hash: `0xb547677f15d71c38190c5ddcb00ccdd271830b74ad4347f7f4f4eaa9d4ad04c3`

`PAYMENT_ASSET=0x0000000000000000000000000000000000000000` means native Arc USDC. It is a sentinel value, not an ERC-20 contract address.

After deploy:

```bash
npm run contracts:setup:arc
npm run contracts:create-task:arc
npm run contracts:anchor:arc
npm run contracts:verify:arc
```

These scripts allowlist demo providers, create a strict policy task, anchor one provider-signed receipt on Arc Testnet, and verify the proof by reading contract state.

The verifier checks bytecode, asset, provider allowlist, task budget, per-call cap, provider spend, receipt replay status, and digest equality.

50+ transaction hackathon proof:

```bash
npm run contracts:seed-50:arc
npm run contracts:verify-50:arc
```

Current 50+ transaction proof:

- Task: `#9`
- Task tx: `0x9f652d4cd39b9858cfbd4b66209769522537ef12b4fbb87efcd6992bfc8f8ee7`
- Receipt transactions: `50`
- Total recorded spend: `0.1805 USDC`
- Report: `deployments/arc-testnet-50tx.json`

## Real funding path

1. Connect an agent wallet.
2. Add Arc Testnet.
3. Request testnet USDC from the Circle faucet.
4. Deposit once into Circle Gateway.
5. Run the review in the app.
6. Sign one batch x402 `PAYMENT-SIGNATURE` in the wallet for the selected proof count.
7. After the batch settles, PennyPilot anchors the provider receipts with `recordSpendsWithProviderSignatures()`.

See `docs/real-funding.md`.

## Tests

```bash
npm test
npm run contracts:verify:arc
```

The test suite starts the local server, creates tasks, verifies the 402 challenge flow, rejects replayed challenges, verifies wallet signatures in testnet mode, confirms provider-signed receipts, and runs the compact 6-fact preview path under the `$0.25` budget.

## License

MIT. See `LICENSE`.

## Reference material

- Hackathon brief: https://lablab.ai/ai-hackathons/nano-payments-arc
- Arc docs: https://docs.arc.network/
- Arc gas and fees: https://docs.arc.network/arc/references/gas-and-fees
- Circle Nanopayments: https://developers.circle.com/gateway/nanopayments
- x402 overview: https://developers.circle.com/gateway/nanopayments/concepts/x402
