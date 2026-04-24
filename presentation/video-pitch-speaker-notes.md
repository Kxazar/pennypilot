# PennyPilot video pitch speaker notes

## Slide 1: PennyPilot

Hi, this is PennyPilot: a spend-control card for AI finance agents. The agent can buy small paid financial facts through Circle Gateway x402, and the receipts are anchored on Arc. The key point is supervised machine spending: useful agent autonomy without losing budget control or auditability.

## Slide 2: Tiny Spend Needs Control

AI agents can buy useful facts, but the payment rail needs guardrails. These proof calls are too small for traditional payment economics, too frequent for one approval per call, and too risky without receipts. PennyPilot turns nano-payments into supervised procurement.

## Slide 3: Batch-Controlled Agent Spend

Here the user sets the policy: task budget, per-call cap, provider allowlist, and how many proofs the agent may buy. Instead of signing every proof separately, the user signs once for the selected batch. In this compact review, six paid proofs cost 0.023308 USDC, with an average paid action below one cent.

## Slide 4: Payment First, Proof Next

The flow starts with policy. A paid API returns an x402 payment request, the wallet signs once, Circle Gateway verifies the authorization, providers return signed receipts, and PennyPilot anchors the receipt batch on Arc. In the video, the important proof is Circle-side payment authorization followed by Arc-side receipt verification.

## Slide 5: Agentic Commerce With Guardrails

PennyPilot is a reusable pattern for agentic commerce with guardrails. It lets agents buy what they need without letting spend go dark: the user sets policy, the payment happens through x402, providers return signed receipts, and Arc keeps the audit trail verifiable. The live system supports up to 60 proofs in a batch and includes a 50-plus transaction proof.
