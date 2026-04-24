import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createPublicClient, getAddress, http, parseUnits } from "viem";
import { ARC_TESTNET, readArcDeployment } from "./arc-runtime.mjs";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

const REPORT_PATH = path.join(process.cwd(), "deployments", "arc-testnet-50tx.json");
if (!fs.existsSync(REPORT_PATH)) {
  throw new Error("Missing deployments/arc-testnet-50tx.json. Run npm run contracts:seed-50:arc first.");
}

const deployment = readArcDeployment({ required: true });
const artifactPath = path.join(process.cwd(), "artifacts", "contracts", "contracts", "AgentExpenseCard.json");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
const chain = {
  ...ARC_TESTNET,
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_URL ?? deployment.rpcUrl ?? ARC_TESTNET.rpcUrls.default.http[0]]
    }
  }
};
const publicClient = createPublicClient({ chain, transport: http() });
const contractAddress = getAddress(report.contractAddress);
const taskId = BigInt(report.task.taskId);
const maxOneCent = parseUnits("0.01", 6);

if (report.receipts.length < 50) {
  throw new Error(`Expected at least 50 receipts, found ${report.receipts.length}.`);
}

const task = await publicClient.readContract({
  address: contractAddress,
  abi: artifact.abi,
  functionName: "tasks",
  args: [taskId]
});

const taskAgent = getAddress(task[0]);
const taskBudget = BigInt(task[2]);
const taskSpent = BigInt(task[3]);
const taskMaxPerCall = BigInt(task[4]);
const requireProviderSignature = Boolean(task[7]);
const expectedSpent = report.receipts.reduce((sum, receipt) => sum + BigInt(receipt.amountUnits), 0n);

if (taskAgent !== getAddress(report.task.agent)) {
  throw new Error(`Task agent mismatch: ${taskAgent}`);
}
if (!requireProviderSignature) {
  throw new Error("Task does not require provider signatures.");
}
if (taskSpent !== expectedSpent) {
  throw new Error(`Task spent mismatch: chain=${taskSpent} report=${expectedSpent}`);
}
if (taskBudget < expectedSpent) {
  throw new Error("Task budget is below recorded spend.");
}

const spendByProvider = new Map();
for (const receipt of report.receipts) {
  const amount = BigInt(receipt.amountUnits);
  if (amount > maxOneCent) {
    throw new Error(`Receipt ${receipt.index} exceeds $0.01: ${receipt.amountUsd}`);
  }
  if (amount > taskMaxPerCall) {
    throw new Error(`Receipt ${receipt.index} exceeds task maxPerCall.`);
  }
  const used = await publicClient.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "usedReceiptHashes",
    args: [taskId, receipt.receiptHash]
  });
  if (!used) {
    throw new Error(`Receipt hash is not marked used on-chain: ${receipt.receiptHash}`);
  }
  const provider = getAddress(receipt.providerAddress);
  spendByProvider.set(provider, (spendByProvider.get(provider) ?? 0n) + amount);
}

for (const [provider, amount] of spendByProvider) {
  const chainSpend = await publicClient.readContract({
    address: contractAddress,
    abi: artifact.abi,
    functionName: "taskProviderSpend",
    args: [taskId, provider]
  });
  if (BigInt(chainSpend) < amount) {
    throw new Error(`Provider spend mismatch for ${provider}: chain=${chainSpend} report=${amount}`);
  }
}

console.log(`50+ receipt proof verified on Arc Testnet.`);
console.log(`Task #${taskId.toString()}: ${report.task.explorerUrl}`);
console.log(`Receipt transactions: ${report.receipts.length}`);
console.log(`Total recorded spend: ${Number(expectedSpent) / 1_000_000} USDC`);
