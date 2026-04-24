import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createPublicClient, createWalletClient, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_TESTNET, normalizePrivateKey, readArcDeployment } from "./arc-runtime.mjs";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

const deployment = readArcDeployment({ required: true });
const taskPath = path.join(process.cwd(), "deployments", "arc-testnet-task.json");
if (!fs.existsSync(taskPath)) {
  console.error("Missing deployments/arc-testnet-task.json. Run npm run contracts:create-task:arc first.");
  process.exit(1);
}

const taskDeployment = JSON.parse(fs.readFileSync(taskPath, "utf8"));
const artifactPath = path.join(process.cwd(), "artifacts", "contracts", "contracts", "AgentExpenseCard.json");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const ownerPrivateKey = normalizePrivateKey(process.env.DEPLOYER_PRIVATE_KEY, "DEPLOYER_PRIVATE_KEY");
const ownerAccount = privateKeyToAccount(ownerPrivateKey);
const agentPrivateKey = normalizePrivateKey(process.env.AGENT_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY, "AGENT_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY");
const agentAccount = privateKeyToAccount(agentPrivateKey);
const expectedAgent = getAddress(taskDeployment.agent);

if (agentAccount.address !== expectedAgent) {
  console.error(`Agent signer ${agentAccount.address} does not match task agent ${expectedAgent}.`);
  process.exit(1);
}

const chain = {
  ...ARC_TESTNET,
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_URL ?? deployment.rpcUrl ?? ARC_TESTNET.rpcUrls.default.http[0]]
    }
  }
};
const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({ account: ownerAccount, chain, transport: http() });
const { createAppServer, createState } = await import("../server.mjs");
const state = createState();
state.nextTaskId = Number(taskDeployment.taskId);
const server = createAppServer({ state });

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  const providerId = process.env.ANCHOR_PROVIDER_ID ?? "sanctions";
  const purpose = process.env.ANCHOR_PURPOSE ?? "sanctions screen";
  const index = Number(process.env.ANCHOR_INDEX ?? 0);
  const taskResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenarioKey: "invoice",
      budgetUsd: "0.25",
      maxPerCallUsd: "0.006",
      fundingMode: "testnet",
      agentAddress: expectedAgent
    })
  });
  if (!taskResponse.ok) {
    throw new Error(`Local task creation failed with ${taskResponse.status}: ${await taskResponse.text()}`);
  }
  const localTask = await taskResponse.json();
  if (String(localTask.id) !== String(taskDeployment.taskId)) {
    throw new Error(`Local task #${localTask.id} does not match on-chain task #${taskDeployment.taskId}.`);
  }

  const challengeResponse = await fetch(`${baseUrl}/api/providers/${providerId}/facts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      taskId: localTask.id,
      scenarioKey: "invoice",
      index,
      purpose
    })
  });
  if (challengeResponse.status !== 402) {
    throw new Error(`Expected local 402 challenge, got ${challengeResponse.status}: ${await challengeResponse.text()}`);
  }
  const challengeBody = await challengeResponse.json();
  const signature = await agentAccount.signMessage({
    message: challengeBody.x402.paymentMessage
  });
  const payment = Buffer.from(JSON.stringify({
    protocol: "x402-preview",
    challengeId: challengeBody.x402.id,
    taskId: localTask.id,
    providerId,
    amountUnits: challengeBody.x402.amountUnits,
    requestHash: challengeBody.x402.requestHash,
    signer: agentAccount.address,
    signature
  }), "utf8").toString("base64url");
  const paidResponse = await fetch(`${baseUrl}/api/providers/${providerId}/facts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-payment": payment
    },
    body: JSON.stringify({
      taskId: localTask.id,
      scenarioKey: "invoice",
      index,
      purpose
    })
  });
  if (!paidResponse.ok) {
    throw new Error(`Local paid fact failed with ${paidResponse.status}: ${await paidResponse.text()}`);
  }
  const settled = await paidResponse.json();
  const receipt = settled.receipt;

  const hash = await walletClient.writeContract({
    address: deployment.contractAddress,
    abi: artifact.abi,
    functionName: "recordSpendWithProviderSignature",
    args: [
      BigInt(taskDeployment.taskId),
      receipt.providerAddress,
      BigInt(receipt.amountUnits),
      Number(receipt.railId ?? 0),
      receipt.requestHash,
      receipt.receiptHash,
      receipt.providerSignature
    ]
  });
  await publicClient.waitForTransactionReceipt({ hash });

  const anchor = {
    network: deployment.network,
    chainId: deployment.chainId,
    contractAddress: deployment.contractAddress,
    taskId: taskDeployment.taskId,
    providerId,
    providerAddress: receipt.providerAddress,
    agentAddress: receipt.agentAddress,
    amountUnits: receipt.amountUnits,
    requestHash: receipt.requestHash,
    receiptHash: receipt.receiptHash,
    receiptStructHash: receipt.receiptStructHash,
    contractDigest: receipt.contractDigest,
    transactionHash: hash,
    anchoredAt: new Date().toISOString(),
    explorerUrl: `${ARC_TESTNET.blockExplorers.default.url}/tx/${hash}`
  };
  fs.writeFileSync(
    path.join(process.cwd(), "deployments", "arc-testnet-anchor.json"),
    JSON.stringify(anchor, null, 2)
  );

  console.log(`Anchored receipt ${receipt.receiptHash}`);
  console.log(`Provider: ${receipt.providerAddress}`);
  console.log(`Amount units: ${receipt.amountUnits}`);
  console.log(`Tx: ${hash}`);
  console.log(`Explorer: ${anchor.explorerUrl}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
