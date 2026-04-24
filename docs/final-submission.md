# PennyPilot final submission summary

## One-liner

PennyPilot is a spend-control card for AI finance agents: it lets an agent buy sub-cent paid financial facts through Circle Gateway x402 while enforcing task budgets, per-call caps, provider signatures, and Arc-anchored receipts.

## Demo

- Public app: `https://pennypilot-five.vercel.app`
- GitHub: `https://github.com/Kxazar/pennypilot`
- Cover image: `assets/pennypilot-cover-16x9.png`
- Final deck: `presentation/PennyPilot-hackathon-demo.pptx`
- Final PDF: `presentation/PennyPilot-hackathon-demo.pdf`

## Core claim

The compact demo buys `6` paid facts for `$0.023308`, averaging `$0.003885` per action. The 50-transaction proof records `50` Arc Testnet receipt transactions for `0.1805 USDC`, keeping every action below the `$0.01` hackathon threshold.

## Arc proof

- Contract: `https://testnet.arcscan.app/address/0x4c8e7ae58d71130185de198af9285e65bb333047`
- Deploy tx: `https://testnet.arcscan.app/tx/0x5bb0754c0b95421797eae3bcd96199ab55f8534e59bdf36c9a5b218e4849a1bb`
- Policy task tx: `https://testnet.arcscan.app/tx/0x86a4d76dddead84017d1d49c585c1cf8e647b53564832e7809b77b3f788eb63b`
- Anchored receipt tx: `https://testnet.arcscan.app/tx/0x60064479e955f2b9474665c3ea2e1f8150f7dea3677ca10373ba7778a128f996`
- 50 tx task: `https://testnet.arcscan.app/tx/0x9f652d4cd39b9858cfbd4b66209769522537ef12b4fbb87efcd6992bfc8f8ee7`
- 50 tx report: `deployments/arc-testnet-50tx.json`

## Verification commands

```bash
npm install
npm run contracts:compile
npm test
npm run contracts:verify:arc
npm run contracts:verify-50:arc
```

## Required final paste-ins

- Public GitHub URL: `https://github.com/Kxazar/pennypilot`
- Final video URL after upload.
- Optional product screenshots after the wallet-connected recording.
