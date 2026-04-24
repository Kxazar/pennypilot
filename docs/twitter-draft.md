# PennyPilot Twitter/X post

We're building PennyPilot for the Circle Arc nanopayments hackathon.

It's a spend-control card for AI finance agents: give an agent a tiny USDC task budget, let it buy paid API facts, and make every machine payment explain itself.

Public demo:
https://pennypilot-five.vercel.app

What we have now:

- public Vercel demo
- Circle Gateway x402 payment path
- compact 6-fact review under a `$0.25` budget
- provider-signed receipts
- deployed spend-control contract on Arc Testnet
- six providers allowlisted
- strict policy task created
- one receipt anchored on-chain
- 50 on-chain receipt transactions verified on Arc Testnet
- read-only verifier checks the proof from contract state

Why it matters:

Agents should not just spend from a wallet. They should spend against policy: purpose, provider, cap, receipt, replay protection, and audit trail.

This is the unit economics:

- avg paid action: `$0.003885`
- every proof action under `$0.01`
- 50 tx proof total: `0.1805 USDC`

Proof:

Contract: `0x4c8e7ae58d71130185de198af9285e65bb333047`

Anchored receipt tx:
`0x60064479e955f2b9474665c3ea2e1f8150f7dea3677ca10373ba7778a128f996`

50 tx proof task:
`0x9f652d4cd39b9858cfbd4b66209769522537ef12b4fbb87efcd6992bfc8f8ee7`

GitHub:
https://github.com/Kxazar/pennypilot

Video:
paste final demo recording URL after upload
