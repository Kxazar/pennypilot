# Contracts

This folder contains the contract core for PennyPilot. The UI can stay a demo while these contracts define the production behavior we want later.

## AgentExpenseCard

`AgentExpenseCard.sol` is a spend-control and receipt contract for AI agents buying sub-cent finance facts.

It supports two modes:

- `PolicyOnly`: no funds are held in the contract. The task budget is a policy cap over an external funding rail such as Circle Gateway/x402. `recordSpend()` emits an audit receipt and deducts the task policy balance.
- `Escrowed`: funds are held in the contract. `recordSpend()` transfers the asset to an allowed provider and emits the same audit receipt.

For x402-style settlement, prefer `createStrictPolicyTask()`. It requires recorded spend to use provider-signed receipts before the agent can anchor it. Use `recordSpendWithProviderSignature()` for one receipt or `recordSpendsWithProviderSignatures()` for a batch.

The `asset` constructor argument controls the payment asset:

- `address(0)`: use the chain native asset. On Arc, native gas is USDC.
- ERC20 address: use token transfers for escrowed tasks.

## Core Flow

1. Owner allowlists providers with `setProvider()`.
2. Owner creates a task with `createPolicyTask()`, `createStrictPolicyTask()`, or `fundEscrowTask()`.
3. The task agent buys facts through `recordSpend()`, `recordSpendWithProviderSignature()`, or the batch receipt function.
4. The contract enforces:
   - allowed provider
   - active task
   - unexpired task
   - per-call cap
   - total budget cap
   - no duplicate `receiptHash` per task
   - rail must match funding mode
   - provider signature if the task is strict
5. Agent or owner closes the task with `closeTask()`.

## Units

Amounts are raw asset units.

- ERC20 USDC with 6 decimals: `$0.25` is `250000`.
- Native Arc USDC follows the network native-balance convention. Use the exact unit returned by wallet/RPC tooling.

## x402 Mapping

For real Circle Gateway/x402 integration, use `PolicyOnly` tasks:

- The agent wallet is funded through faucet/testnet USDC.
- The agent deposits into Gateway outside this contract.
- The x402 batch settlement returns a payment reference for the selected proof pack.
- Hash each paid request and settlement receipt.
- Ask the provider to sign `receiptStructHash(taskId, provider, amount, X402Gateway, requestHash, receiptHash)` with a standard wallet `personal_sign` / `signMessage` flow.
- Call `recordSpendsWithProviderSignatures(taskId, receipts)` to anchor the whole selected proof batch in one transaction, or `recordSpendWithProviderSignature(...)` for a single receipt.

`receiptDigest(...)` returns the EIP-191 hash that the contract recovers against. Most wallet libraries add that prefix inside `signMessage`, so they should sign `receiptStructHash(...)`, not `receiptDigest(...)`.

This keeps Gateway as the payment rail and the contract as the policy/audit anchor.

## Local Mock

`mocks/MockUSDC.sol` is only for local tests. It is not production USDC.

## Threat Model Notes

- The owner is trusted to create budgets and providers.
- Providers must be allowlisted before any spend can be recorded.
- Agents cannot spend after expiry, above per-call cap, above budget, or reuse a receipt hash.
- Basic `PolicyOnly` mode does not prove the x402 payment happened by itself. Use strict policy tasks for provider-signed receipt anchoring.
- Provider signatures prove that the allowlisted provider attested to the receipt data. They do not prove Gateway settlement unless the provider signs only after settlement.
- Escrowed native transfers can call provider fallback code, so state is updated before transfer and `nonReentrant` is used.
