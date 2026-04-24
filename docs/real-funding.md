# Real funding path

PennyPilot now uses a real Circle Gateway path for the wallet demo. The agent's spendable balance comes from the connected wallet's Gateway USDC balance, while the on-chain spend card enforces a separate task policy cap.

## Target architecture

1. Create or connect an EVM wallet for the agent.
2. Add Arc Testnet to the wallet.
3. Request testnet USDC from the Circle faucet.
4. Deposit a small amount into the Circle Gateway Wallet contract.
5. Let the agent use one x402 payment authorization for the selected paid-fact batch.
6. Keep the app-level policy budget separate from the wallet balance.

That last point matters. The wallet can hold 20 testnet USDC, while a single task may only authorize 0.25 USDC of spend.

## Arc Testnet

- Network name: Arc Testnet
- RPC URL: `https://rpc.testnet.arc.network`
- Chain ID: `5042002`
- Currency symbol: `USDC`
- Explorer: `https://testnet.arcscan.app`
- Faucet: `https://faucet.circle.com`

Arc uses native USDC for gas. The native balance follows EVM native-balance conventions and supports 18 decimals.

## What the current demo does

The UI has two funding paths:

- `Circle Gateway x402`: wallet funds Gateway once, signs one gasless batch `PAYMENT-SIGNATURE`, and receipts are anchored on Arc.
- `x402 preview`: no real Gateway settlement, kept for local tests and repeatable reports.

The exported JSON includes the connected wallet, Gateway config, payment settlement reference, and Arc receipt anchor.

The contract layer is already deployed on Arc Testnet. It includes allowlisted demo providers, a strict policy task, and one anchored provider-signed receipt that can be verified with `npm run contracts:verify:arc`.

## Demo flow

1. Connect a wallet on Arc Testnet.
2. Fund the wallet from the Circle faucet.
3. Run PennyPilot.
4. If Gateway balance is low, approve and deposit USDC into Circle Gateway.
5. Create the strict policy task on the user-owned spend card.
6. Sign one x402 batch payment.
7. Open the Arc explorer link for the anchored receipt-batch transaction.

## Demo line

Use this sentence during judging:

> The app pays for a selected proof batch through Circle Gateway x402, then anchors provider-signed receipts to a user-owned Arc spend card.
