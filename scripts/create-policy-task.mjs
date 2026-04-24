import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  keccak256,
  parseUnits,
  stringToHex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_TESTNET, normalizePrivateKey, readArcDeployment } from "./arc-runtime.mjs";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

const deployment = readArcDeployment({ required: true });
const artifactPath = path.join(process.cwd(), "artifacts", "contracts", "contracts", "AgentExpenseCard.json");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const privateKey = normalizePrivateKey(process.env.DEPLOYER_PRIVATE_KEY, "DEPLOYER_PRIVATE_KEY");
const account = privateKeyToAccount(privateKey);
const chain = {
  ...ARC_TESTNET,
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_URL ?? deployment.rpcUrl ?? ARC_TESTNET.rpcUrls.default.http[0]]
    }
  }
};
const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({ account, chain, transport: http() });

const agent = process.env.AGENT_ADDRESS ? getAddress(process.env.AGENT_ADDRESS) : account.address;
const budget = parseUnits(process.env.TASK_BUDGET_USD ?? "0.25", 6);
const maxPerCall = parseUnits(process.env.TASK_MAX_PER_CALL_USD ?? "0.006", 6);
const expiresAt = BigInt(Math.floor(Date.now() / 1000) + Number(process.env.TASK_TTL_SECONDS ?? 24 * 60 * 60));
const purposeHash = process.env.TASK_PURPOSE_HASH ?? keccak256(stringToHex("pennypilot-demo-paid-fact-market"));
const taskId = await publicClient.readContract({
  address: deployment.contractAddress,
  abi: artifact.abi,
  functionName: "nextTaskId"
});

const hash = await walletClient.writeContract({
  address: deployment.contractAddress,
  abi: artifact.abi,
  functionName: "createStrictPolicyTask",
  args: [agent, budget, maxPerCall, expiresAt, purposeHash]
});
await publicClient.waitForTransactionReceipt({ hash });

const taskDeployment = {
  network: deployment.network,
  chainId: deployment.chainId,
  contractAddress: deployment.contractAddress,
  taskId: taskId.toString(),
  agent,
  budgetUnits: budget.toString(),
  maxPerCallUnits: maxPerCall.toString(),
  expiresAt: expiresAt.toString(),
  purposeHash,
  transactionHash: hash,
  createdAt: new Date().toISOString(),
  explorerUrl: `${ARC_TESTNET.blockExplorers.default.url}/tx/${hash}`
};

const deploymentsDir = path.join(process.cwd(), "deployments");
fs.mkdirSync(deploymentsDir, { recursive: true });
fs.writeFileSync(
  path.join(deploymentsDir, "arc-testnet-task.json"),
  JSON.stringify(taskDeployment, null, 2)
);

console.log(`Strict policy task: #${taskId.toString()}`);
console.log(`Agent: ${agent}`);
console.log(`Tx: ${hash}`);
console.log(`Explorer: ${taskDeployment.explorerUrl}`);
