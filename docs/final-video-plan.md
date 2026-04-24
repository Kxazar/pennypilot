# PennyPilot compact video plan

Target length: 2:30 to 3:00.

## Prep tabs

1. Presentation: `presentation/PennyPilot-hackathon-demo.pdf`
2. Live demo: `https://pennypilot-five.vercel.app`
3. Contract: `https://testnet.arcscan.app/address/0x4c8e7ae58d71130185de198af9285e65bb333047`
4. Anchored receipt: `https://testnet.arcscan.app/tx/0x60064479e955f2b9474665c3ea2e1f8150f7dea3677ca10373ba7778a128f996`
5. 50 tx task: `https://testnet.arcscan.app/tx/0x9f652d4cd39b9858cfbd4b66209769522537ef12b4fbb87efcd6992bfc8f8ee7`
6. Circle Developer Console or Gateway testnet view

## Video structure

- 0:00-0:15: Product intro
- 0:15-1:30: Slide walkthrough
- 1:30-2:25: Live product and proof
- 2:25-2:55: Circle/Gateway transaction proof and close

## Slide script

### Slide 1: PennyPilot

Say:

> PennyPilot is a spend-control card for AI finance agents. The agent gets a tiny USDC task budget, buys paid financial facts through Circle Gateway x402, and anchors provider-signed receipts on Arc.

Point to:

- `$0.003885` average paid action
- `$0.25` budget
- `$0.006` max per call
- `50` receipt transactions

### Slide 2: Agents need policy first

Say:

> A wallet balance alone is too blunt for autonomous finance. We need policy before payment: what task is allowed, which providers are trusted, how much one call can cost, and what receipt proves the spend.

Point to:

- Wallets are too blunt
- Facts need receipts
- Sub-cent spend breaks easily

### Slide 3: Payment first. Proof next.

Say:

> The flow is simple: create a task policy, receive one x402 payment requirement for the selected proof batch, sign once, settle through Gateway, get provider-signed facts, then anchor the receipt batch on Arc.

Point to:

- `01 Set task policy`
- `03 Wallet signs`
- `06 Arc anchors proof`

### Slide 4: Four layers, one audit trail

Say:

> The product has four layers: the user interface, x402 payment flow, the Arc contract, and verifier scripts. This keeps funding, policy, settlement, and proof separate but connected.

Point to:

- UI line
- x402 line
- Contract line
- Verifier line

### Slide 5: Arc Testnet proof is already live

Say:

> This is not just a UI mock. The contract is deployed on Arc Testnet, a strict policy task exists, one provider-signed receipt is anchored, and the 50-transaction proof is verifiable from chain state.

Point to:

- contract address
- receipt tx
- 50 tx task
- verifier chips

### Slide 6: The unit economics are the feature

Say:

> The use case only makes sense with nano-payments. The compact review spends about 2.3 cents total, with an average paid action below half a cent. Traditional high-fee payment paths would erase the margin.

Point to:

- `$0.023308`
- `$0.003885`
- provider price bars

### Slide 7: Agent spend policy

Say:

> The same pattern applies beyond invoices: merchant risk checks, treasury routing, or any workflow where an agent needs to buy small external facts before making a decision.

Point to:

- Invoice ops
- Merchant risk
- Treasury ops
- Audit trail

## Live demo segment

Switch to the live app.

Say:

> Here is the public demo. The user sets a budget and a max per-call cap, connects a wallet, and runs a paid fact review.

Show:

- budget input
- max per-call cap
- wallet/connect area
- proof panel
- receipt table or exported JSON if available

Then say:

> Each successful paid fact leaves a provider receipt, and the proof panel links the receipt trail back to Arc.

## Arc proof segment

Open the Arc explorer tabs.

Say:

> This contract, task, and receipt can be checked independently in Arc Block Explorer. We also recorded 50 receipt transactions to show repeated sub-cent actions, not just a single demo event.

Show:

- contract page
- anchored receipt tx
- 50 tx task

## Circle/Gateway segment

Open Circle Developer Console or Gateway testnet view.

Say:

> On the payment side, the buyer funds Gateway once, then signs one x402 payment payload for the selected proof batch. Gateway handles settlement, and PennyPilot anchors the provider receipt batch on Arc.

If available, show:

- Gateway/testnet balance
- one wallet payment signature prompt
- provider response or receipt row

## What to do in Circle Developer Console

Use this as a short proof segment, not as the whole demo. The goal is to show that the Circle side of the flow exists: testnet USDC, Gateway funding, and x402 payment authorization.

### Option A: fastest for this project

Use this if you are demoing with MetaMask or Rabby.

1. Open Circle Developer Console.
2. Show you are in a testnet/developer environment.
3. Show the faucet or funding page if available.
4. If the Console faucet only supports Circle-created wallets, do not force it. Use the public Circle Faucet instead:
   `https://faucet.circle.com`
5. Select `USDC` and `Arc Testnet`.
6. Paste the same wallet address you will connect in PennyPilot.
7. Send testnet USDC, or show that the wallet already has testnet USDC.
8. Switch to PennyPilot.
9. Show the app checking Gateway balance.
10. If Gateway balance is low, show the wallet `approve` and `deposit` transactions into the Gateway Wallet.
11. Run the paid proof batch.
12. Show the wallet signing one batch x402 `PAYMENT-SIGNATURE`.
13. Show the receipt rows and open the Arc explorer batch receipt link.

Narration:

> Here I am using Circle's testnet tooling to fund the buyer wallet with Arc Testnet USDC. PennyPilot then deposits that USDC into Gateway once. After that, the selected paid facts share one gasless x402 batch payment signature, and the provider receipts are anchored on Arc.

### Option B: if judges expect a Console-created wallet

Use this only if you have time and want a stricter Circle Console proof.

1. In Circle Developer Console, create or open a developer-controlled wallet on `Arc Testnet`.
2. Use the Console Faucet to fund that Circle-created wallet with testnet USDC/native tokens.
3. Show the wallet address and balance in Console.
4. If you execute a small transfer from that wallet, open the transaction in Arc Explorer.
5. Then return to PennyPilot and say the product demo uses a browser wallet, but the same Arc/Gateway USDC flow is what funds the x402 payments.

Narration:

> This Console wallet segment is just to show the Circle developer-side transaction flow on Arc Testnet. The PennyPilot product demo uses a browser wallet so judges can see the Gateway deposit and x402 signature prompts directly.

### What not to show

- Do not show API key secrets.
- Do not show `.env.local`.
- Do not spend time explaining every Console menu.
- Do not imply that the Arc receipt anchor is the same thing as the Gateway payment settlement. Say: Gateway handles payment settlement; Arc anchors the provider receipt.

## Closing line

Say:

> PennyPilot is not a checkout demo. It is supervised machine spending: tiny paid API calls, strict policy, provider accountability, and Arc-verifiable receipts.
