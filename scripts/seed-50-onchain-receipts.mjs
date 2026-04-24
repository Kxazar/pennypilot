import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
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

const TARGET_TX_COUNT = Number(process.env.DEMO_TX_COUNT ?? 50);
const TASK_BUDGET_USD = process.env.DEMO_TASK_BUDGET_USD ?? "0.35";
const TASK_MAX_PER_CALL_USD = process.env.DEMO_TASK_MAX_PER_CALL_USD ?? "0.006";
const REPORT_PATH = path.join(process.cwd(), "deployments", "arc-testnet-50tx.json");
const RECEIPT_TYPEHASH = keccak256(
  stringToHex("AgentExpenseReceipt(uint256 chainId,address card,uint256 taskId,address agent,address provider,uint128 amount,uint8 rail,bytes32 requestHash,bytes32 receiptHash)")
);

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
const { getProviderRegistry } = await import("../server.mjs");
const providers = getProviderRegistry().map((provider) => ({
  ...provider,
  address: getAddress(provider.address),
  account: privateKeyToAccount(providerPrivateKey(provider.id))
}));

if (TARGET_TX_COUNT < 50) {
  throw new Error("DEMO_TX_COUNT must be at least 50 for the hackathon proof.");
}

const owner = getAddress(await publicClient.readContract({
  address: deployment.contractAddress,
  abi: artifact.abi,
  functionName: "owner"
}));
if (owner !== account.address) {
  throw new Error(`DEPLOYER_PRIVATE_KEY signer ${account.address} is not contract owner ${owner}.`);
}

const report = {
  network: deployment.network,
  chainId: deployment.chainId,
  contractAddress: deployment.contractAddress,
  explorerUrl: deployment.explorerUrl,
  targetTransactionCount: TARGET_TX_COUNT,
  actionMaxUsd: Number(TASK_MAX_PER_CALL_USD),
  taskBudgetUsd: Number(TASK_BUDGET_USD),
  perActionUsdRequirement: "<= 0.01",
  signer: account.address,
  createdAt: new Date().toISOString(),
  providerSetupTxs: [],
  task: null,
  receipts: []
};

await setupProviders(report);
await createStrictTask(report);
await recordReceipts(report);

writeReport(report);
console.log(`50+ tx proof complete: ${report.receipts.length} receipt transactions`);
console.log(`Report: ${REPORT_PATH}`);
console.log(`Task tx: ${report.task.explorerUrl}`);

async function setupProviders(output) {
  console.log(`Contract: ${deployment.contractAddress}`);
  console.log(`Owner: ${account.address}`);
  for (const provider of providers) {
    const metadataURI = `pennypilot://providers/${provider.id}`;
    const current = await publicClient.readContract({
      address: deployment.contractAddress,
      abi: artifact.abi,
      functionName: "providers",
      args: [provider.address]
    });
    const alreadyReady = current[0] === true && current[1] === false;
    if (alreadyReady) {
      console.log(`Provider ready: ${provider.name}`);
      continue;
    }
    const { hash } = await writeContract({
      functionName: "setProvider",
      args: [provider.address, true, false, metadataURI],
      gas: 220000n
    });
    output.providerSetupTxs.push({
      providerId: provider.id,
      provider: provider.name,
      providerAddress: provider.address,
      transactionHash: hash,
      explorerUrl: txUrl(hash)
    });
    writeReport(output);
    console.log(`Provider allowlisted: ${provider.name} tx=${hash}`);
  }
}

async function createStrictTask(output) {
  const taskId = await publicClient.readContract({
    address: deployment.contractAddress,
    abi: artifact.abi,
    functionName: "nextTaskId"
  });
  const budget = parseUnits(TASK_BUDGET_USD, 6);
  const maxPerCall = parseUnits(TASK_MAX_PER_CALL_USD, 6);
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 72 * 60 * 60);
  const purposeHash = keccak256(stringToHex(`pennypilot-50tx-demo:${Date.now()}`));
  const { hash } = await writeContract({
    functionName: "createStrictPolicyTask",
    args: [account.address, budget, maxPerCall, expiresAt, purposeHash],
    gas: 360000n
  });
  output.task = {
    taskId: taskId.toString(),
    agent: account.address,
    budgetUnits: budget.toString(),
    maxPerCallUnits: maxPerCall.toString(),
    expiresAt: expiresAt.toString(),
    purposeHash,
    transactionHash: hash,
    explorerUrl: txUrl(hash),
    createdAt: new Date().toISOString()
  };
  writeReport(output);
  console.log(`Strict policy task #${taskId.toString()} tx=${hash}`);
}

async function recordReceipts(output) {
  const taskId = BigInt(output.task.taskId);
  const scenario = "invoice";
  const purposes = [
    "invoice duplicate check",
    "vendor KYB refresh",
    "sanctions screen",
    "bank account match",
    "fraud anomaly score",
    "FX route check"
  ];

  for (let index = output.receipts.length; index < TARGET_TX_COUNT; index += 1) {
    const provider = providers[index % providers.length];
    const purpose = purposes[index % purposes.length];
    const amountUnits = BigInt(provider.priceUnits);
    if (amountUnits > parseUnits(TASK_MAX_PER_CALL_USD, 6)) {
      throw new Error(`${provider.name} amount ${amountUnits.toString()} exceeds per-call cap.`);
    }
    const requestHash = hashJson({
      demo: "pennypilot-50tx",
      taskId: output.task.taskId,
      index,
      provider: provider.id,
      purpose,
      amountUnits: amountUnits.toString()
    });
    const receiptHash = hashJson({
      demo: "pennypilot-50tx-receipt",
      taskId: output.task.taskId,
      index,
      provider: provider.id,
      requestHash,
      createdAt: Date.now()
    });
    const structHash = receiptStructHash({
      taskId,
      agent: account.address,
      provider: provider.address,
      amountUnits,
      rail: 0,
      requestHash,
      receiptHash
    });
    const providerSignature = await provider.account.signMessage({
      message: { raw: structHash }
    });

    const { hash, receipt } = await writeContract({
      functionName: "recordSpendWithProviderSignature",
      args: [
        taskId,
        provider.address,
        amountUnits,
        0,
        requestHash,
        receiptHash,
        providerSignature
      ],
      gas: 420000n
    });
    const row = {
      index: index + 1,
      providerId: provider.id,
      provider: provider.name,
      providerAddress: provider.address,
      purpose,
      amountUsd: Number(provider.price),
      amountUnits: amountUnits.toString(),
      rail: "X402Gateway",
      railId: 0,
      requestHash,
      receiptHash,
      receiptStructHash: structHash,
      providerSignature,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      explorerUrl: txUrl(hash),
      recordedAt: new Date().toISOString()
    };
    output.receipts.push(row);
    output.completedTransactionCount = output.receipts.length;
    output.updatedAt = new Date().toISOString();
    writeReport(output);
    console.log(`[${index + 1}/${TARGET_TX_COUNT}] ${provider.name} ${provider.price} USDC tx=${hash}`);
  }
}

async function writeContract({ functionName, args, gas }) {
  const nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "latest"
  });
  let lastError;
  for (const multiplier of [3n, 5n, 8n]) {
    const hash = await walletClient.writeContract({
      address: deployment.contractAddress,
      abi: artifact.abi,
      functionName,
      args,
      nonce,
      gas,
      gasPrice: await gasPrice(multiplier)
    });
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 120000
      });
      if (receipt.status !== "success") {
        throw new Error(`Transaction reverted: ${hash}`);
      }
      return { hash, receipt };
    } catch (error) {
      lastError = error;
      const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
      if (receipt) {
        if (receipt.status !== "success") {
          throw new Error(`Transaction reverted: ${hash}`);
        }
        return { hash, receipt };
      }
      const latestNonce = await publicClient.getTransactionCount({
        address: account.address,
        blockTag: "latest"
      });
      if (latestNonce > nonce) {
        throw new Error(`Nonce ${nonce} was consumed by another transaction.`);
      }
      await sleep(1500);
    }
  }
  throw lastError;
}

async function gasPrice(multiplier) {
  const current = await publicClient.getGasPrice();
  const floor = 250000000n;
  const boosted = current * multiplier;
  return boosted > floor ? boosted : floor;
}

function receiptStructHash({ taskId, agent, provider, amountUnits, rail, requestHash, receiptHash }) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "uint128" },
        { type: "uint8" },
        { type: "bytes32" },
        { type: "bytes32" }
      ],
      [
        RECEIPT_TYPEHASH,
        BigInt(ARC_TESTNET.id),
        deployment.contractAddress,
        taskId,
        agent,
        provider,
        amountUnits,
        rail,
        requestHash,
        receiptHash
      ]
    )
  );
}

function providerPrivateKey(providerId) {
  const envName = `PROVIDER_PRIVATE_KEY_${providerId.toUpperCase()}`;
  const configured = process.env[envName];
  if (configured) {
    return normalizePrivateKey(configured, envName);
  }
  const hash = crypto
    .createHash("sha256")
    .update(`agent-expense-card-local-preview-provider:${providerId}`)
    .digest("hex");
  return `0x${hash}`;
}

function hashJson(value) {
  return keccak256(stringToHex(JSON.stringify(value)));
}

function txUrl(hash) {
  return `${ARC_TESTNET.blockExplorers.default.url}/tx/${hash}`;
}

function writeReport(output) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(output, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
