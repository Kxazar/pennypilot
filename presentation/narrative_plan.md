# PennyPilot final deck narrative plan

## Audience

Arc/Circle hackathon judges, fintech builders, and infrastructure reviewers.

## Objective

Explain why AI finance agents need spend controls, show how PennyPilot turns tiny paid API calls into auditable receipts, and prove that the contract layer is live on Arc Testnet.

## Narrative arc

1. AI agents are starting to make finance decisions, but wallets alone are too blunt.
2. PennyPilot gives every agent task a small budget, per-call cap, provider allowlist, and receipt trail.
3. The demo shows a compact paid-fact review under a `$0.25` budget.
4. The contract proof is already live: deployed contract, strict policy task, allowlisted provider, anchored receipt, and 50+ Arc transactions.
5. The economics matter because the average paid fact is only a fraction of a cent.
6. The final package is organized around live demo, Arc proof, 50+ transactions, Circle feedback, and the required video flow.

## Slide list

1. Cover: PennyPilot one-liner and proof status.
2. Problem: agents need policy, not just balances.
3. Product loop: challenge, payment, fact, receipt, anchor.
4. Architecture: UI, provider API, contract, Gateway/x402 rail.
5. Live proof: Arc Testnet contract, task, anchored receipt, and 50+ tx proof.
6. Demo result: six paid facts, low spend, zero blocked, under budget.
7. Why it matters: machine spending becomes auditable procurement and sub-cent unit economics.
8. Submission package: demo URL, verifier commands, video flow, and external links to paste after upload.

## Visual system

White and light gray canvas, black text, green/teal/coral/yellow accents from the app, monospaced hashes, compact fintech cards, and clear process diagrams. All meaningful text, proof links, metrics, and labels remain editable PowerPoint objects.

## Source plan

Use local project artifacts:

- `deployments/arc-testnet.json`
- `deployments/arc-testnet-task.json`
- `deployments/arc-testnet-anchor.json`
- `reports/pennypilot-demo-report.json`
- `README.md`
- `docs/demo-script.md`

## Editability plan

Use native PowerPoint text boxes, shapes, and cards. Avoid screenshot-only slides for core claims. Keep proof hashes as editable text.
