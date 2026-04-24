import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createPublicClient, getAddress, http } from "viem";
import { ARC_TESTNET, readArcDeployment } from "./arc-runtime.mjs";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

const deployment = readArcDeployment({ required: true });
const taskProof = readRequiredJson("deployments", "arc-testnet-task.json");
const anchorProof = readRequiredJson("deployments", "arc-testnet-anchor.json");
const artifact = readRequiredJson("artifacts", "contracts", "contracts", "AgentExpenseCard.json");
const chain = {
  ...ARC_TESTNET,
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_URL ?? deployment.rpcUrl ?? ARC_TESTNET.rpcUrls.default.http[0]]
    }
  }
};
const publicClient = createPublicClient({ chain, transport: http() });
const contract = deployment.contractAddress;
const taskId = BigInt(taskProof.taskId);
const providerAddress = getAddress(anchorProof.providerAddress);
const receiptHash = anchorProof.receiptHash;

const bytecode = await publicClient.getBytecode({ address: contract });
assert(Boolean(bytecode), "Contract bytecode exists");

const asset = await publicClient.readContract({
  address: contract,
  abi: artifact.abi,
  functionName: "asset"
});
assert(getAddress(asset) === getAddress(deployment.asset), "Contract asset matches deployment");

const provider = await publicClient.readContract({
  address: contract,
  abi: artifact.abi,
  functionName: "providers",
  args: [providerAddress]
});
assert(provider[0] === true, "Anchor provider is allowlisted");
assert(provider[1] === false, "Anchor provider is not paused");

const task = await publicClient.readContract({
  address: contract,
  abi: artifact.abi,
  functionName: "tasks",
  args: [taskId]
});
const taskSpent = BigInt(task[3]);
assert(getAddress(task[0]) === getAddress(taskProof.agent), "Task agent matches proof artifact");
assert(BigInt(task[2]) === BigInt(taskProof.budgetUnits), "Task budget matches proof artifact");
assert(BigInt(task[4]) === BigInt(taskProof.maxPerCallUnits), "Task per-call cap matches proof artifact");
assert(taskSpent >= BigInt(anchorProof.amountUnits), "Task recorded at least the anchored spend");
assert(task[6] === false, "Task remains open");
assert(task[7] === true, "Task requires provider signatures");

const providerSpend = await publicClient.readContract({
  address: contract,
  abi: artifact.abi,
  functionName: "taskProviderSpend",
  args: [taskId, providerAddress]
});
assert(BigInt(providerSpend) >= BigInt(anchorProof.amountUnits), "Provider spend includes anchored receipt");

const receiptUsed = await publicClient.readContract({
  address: contract,
  abi: artifact.abi,
  functionName: "usedReceiptHashes",
  args: [taskId, receiptHash]
});
assert(receiptUsed === true, "Receipt hash is marked used on-chain");

const digest = await publicClient.readContract({
  address: contract,
  abi: artifact.abi,
  functionName: "receiptDigest",
  args: [
    taskId,
    providerAddress,
    BigInt(anchorProof.amountUnits),
    0,
    anchorProof.requestHash,
    receiptHash
  ]
});
assert(digest === anchorProof.contractDigest, "On-chain digest matches provider-signed digest");

console.log("Arc proof verified");
console.log(`Contract: ${contract}`);
console.log(`Task: #${taskId.toString()}`);
console.log(`Provider: ${providerAddress}`);
console.log(`Spent units: ${taskSpent.toString()}`);
console.log(`Receipt: ${receiptHash}`);

function readRequiredJson(...segments) {
  const filePath = path.join(process.cwd(), ...segments);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${segments.join("/")}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Verification failed: ${message}`);
  }
  console.log(`ok - ${message}`);
}
