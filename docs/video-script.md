# PennyPilot final video script

## Target length

2 to 3 minutes.

## Goal

Show judges that PennyPilot is a real fintech workflow for agent spending:

1. a public app is live
2. the app enforces small-budget machine spending
3. receipts are anchored on Arc Testnet
4. the project already has a 50+ transaction proof set
5. the Circle-side transaction flow can be shown alongside Arc explorer verification

## Recording order

### 1. Open with the live product

- Open `https://pennypilot-five.vercel.app`
- Say: "PennyPilot is an expense card for AI finance agents. It gives the agent a tiny USDC budget, a per-call cap, and an auditable receipt trail for every paid fact."

### 2. Show the core UX

- Point at the budget input, per-fact cap, and fact count
- Point at the wallet connection
- Say: "The user connects a wallet, sets the budget, and the agent can only buy the facts it needs for one decision."

### 3. Show the on-chain proof panel

- Point at contract, task, and receipt proof areas
- Say: "Each spend path uses Circle Gateway x402 for payment, then anchors a provider-signed receipt on a user-owned Arc Testnet card."

### 4. Show the economics

- Say: "Our compact review buys 6 paid facts under a 25-cent budget. The average paid action is about four-tenths of a cent. These unit economics break on traditional high-fee transaction paths, which is why nano-payments matter."

### 5. Show the 50+ transaction proof

- Open the 50-tx task explorer link:
  `https://testnet.arcscan.app/tx/0x9f652d4cd39b9858cfbd4b66209769522537ef12b4fbb87efcd6992bfc8f8ee7`
- Open the contract explorer link:
  `https://testnet.arcscan.app/address/0x4c8e7ae58d71130185de198af9285e65bb333047`
- Say: "We also recorded 50 separate receipt transactions on Arc Testnet, all under the hackathon micro-payment threshold."

### 6. Required transaction-flow segment

This is the part that should satisfy the hackathon's required transaction-flow video:

- Open Circle Developer Console or the relevant Circle Gateway testnet view
- Show the testnet wallet or Gateway balance used for the demo
- Open the live PennyPilot app
- Show the wallet approving/depositing USDC into Circle Gateway if the Gateway balance is low
- Show one x402 `PAYMENT-SIGNATURE` wallet prompt for the paid-fact batch
- Show the provider responses or receipt rows that include the payment/receipt reference
- Open the returned Arc explorer receipt link
- Say: "This transaction can be verified independently in Arc Block Explorer."

### 7. Close

- Return to the app
- Say: "PennyPilot explores a different kind of crypto UX: not swaps or consumer checkout, but supervised machine spending for finance operations."

## Links to keep ready before recording

- Demo: `https://pennypilot-five.vercel.app`
- Contract: `https://testnet.arcscan.app/address/0x4c8e7ae58d71130185de198af9285e65bb333047`
- Policy task: `https://testnet.arcscan.app/tx/0x86a4d76dddead84017d1d49c585c1cf8e647b53564832e7809b77b3f788eb63b`
- Anchored receipt: `https://testnet.arcscan.app/tx/0x60064479e955f2b9474665c3ea2e1f8150f7dea3677ca10373ba7778a128f996`
- 50 tx task: `https://testnet.arcscan.app/tx/0x9f652d4cd39b9858cfbd4b66209769522537ef12b4fbb87efcd6992bfc8f8ee7`

## Final recording checklist

- Browser tabs are pre-opened
- Wallet address is visible if needed
- Circle Developer Console or Gateway view is ready
- Arc explorer pages load correctly
- No secret keys or env files are visible
- Demo narration stays under 3 minutes
