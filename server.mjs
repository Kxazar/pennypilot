import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
import { BatchFacilitatorClient } from "@circle-fin/x402-batching/server";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader
} from "@x402/core/http";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  getAddress,
  http as viemHttp,
  isAddress,
  keccak256,
  recoverMessageAddress,
  stringToHex
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ARC_TESTNET,
  CONTRACT_PREVIEW_FALLBACK_ADDRESS,
  getActiveContractAddress,
  getArcRpcUrl,
  normalizePrivateKey,
  readArcDeployment
} from "./scripts/arc-runtime.mjs";
import { loadLocalEnv } from "./scripts/load-local-env.mjs";

loadLocalEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

const ACTION_TARGET = 6;
const USDC_UNIT = 1_000_000n;
const ARC_CHAIN_ID = BigInt(ARC_TESTNET.id);
const ARC_DEPLOYMENT = readArcDeployment();
const ARC_TASK_DEPLOYMENT = readPublicJson("deployments", "arc-testnet-task.json");
const ARC_ANCHOR_PROOF = readPublicJson("deployments", "arc-testnet-anchor.json");
const ARC_RPC_URL = getArcRpcUrl();
const ACTIVE_CONTRACT_ADDRESS = getActiveContractAddress();
const CONTRACT_ARTIFACT = readPublicJson("artifacts", "contracts", "contracts", "AgentExpenseCard.json");
const CONTRACT_ABI = CONTRACT_ARTIFACT?.abi ?? null;
const ONCHAIN_RUNTIME = createOnchainRuntime();
const X402_MODE = String(process.env.PENNYPILOT_X402_MODE ?? "gateway").toLowerCase();
const GATEWAY_TESTNET_URL = process.env.CIRCLE_GATEWAY_URL ?? "https://gateway-api-testnet.circle.com";
const GATEWAY_CHAIN = CHAIN_CONFIGS.arcTestnet;
const GATEWAY_SCHEME = "exact";
const GATEWAY_NETWORK = `eip155:${ARC_TESTNET.id}`;
const GATEWAY_BATCH_NAME = "GatewayWalletBatched";
const GATEWAY_BATCH_VERSION = "1";
const GATEWAY_FACILITATOR = X402_MODE === "preview"
  ? null
  : new BatchFacilitatorClient({ url: GATEWAY_TESTNET_URL });
const ANCHOR_RELAYER_ADDRESS = ONCHAIN_RUNTIME?.account.address ?? null;
const SIM_AGENT_ADDRESS = "0xaec0000000000000000000000000000000000001";
const MAX_JSON_BODY_BYTES = 32 * 1024;
const MAX_PAYMENT_HEADER_BYTES = 8 * 1024;
const MAX_ACTIVE_CHALLENGES = 1_000;
const MAX_TASKS = 500;
const MAX_BATCH_PROOFS = 12;
const STATIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/client.js", "client.js"],
  ["/styles.css", "styles.css"]
]);
const RECEIPT_TYPEHASH = keccak256(
  stringToHex("AgentExpenseReceipt(uint256 chainId,address card,uint256 taskId,address agent,address provider,uint128 amount,uint8 rail,bytes32 requestHash,bytes32 receiptHash)")
);

const scenarios = {
  invoice: {
    label: "Nova Freight invoice",
    valueUsd: 18,
    providerOrder: ["invoice", "kyb", "sanctions", "identity", "risk", "fx"],
    purposes: [
      "invoice duplicate check",
      "vendor KYB refresh",
      "sanctions screen",
      "bank account match",
      "delivery proof",
      "FX route check",
      "fraud anomaly score",
      "payment memo parse"
    ]
  },
  merchant: {
    label: "Merchant onboarding",
    valueUsd: 24,
    providerOrder: ["kyb", "risk", "identity", "sanctions", "invoice", "fx"],
    purposes: [
      "beneficial owner match",
      "card testing pattern",
      "MCC risk lookup",
      "website evidence",
      "sanctions screen",
      "settlement velocity",
      "chargeback prior",
      "bank account match"
    ]
  },
  treasury: {
    label: "Treasury payout",
    valueUsd: 16,
    providerOrder: ["fx", "sanctions", "risk", "identity", "kyb", "invoice"],
    purposes: [
      "FX quote",
      "liquidity depth",
      "counterparty KYB",
      "wallet risk",
      "sanctions screen",
      "settlement ETA",
      "fee comparison",
      "routing memo parse"
    ]
  }
};

const providers = [
  { id: "kyb", name: "KybTrail", initials: "KY", category: "KYB", priceUsd: 0.0042, quality: 91, value: 0.52, color: "#087c58" },
  { id: "sanctions", name: "ClearList", initials: "CL", category: "Compliance", priceUsd: 0.0035, quality: 94, value: 0.61, color: "#0c8f91" },
  { id: "invoice", name: "ProofDesk", initials: "PD", category: "Documents", priceUsd: 0.0028, quality: 88, value: 0.44, color: "#d85245" },
  { id: "risk", name: "FraudLens", initials: "FL", category: "Risk", priceUsd: 0.0048, quality: 89, value: 0.73, color: "#e8b923" },
  { id: "fx", name: "QuoteMesh", initials: "QM", category: "FX", priceUsd: 0.0019, quality: 84, value: 0.36, color: "#2f7fbc" },
  { id: "identity", name: "AccountLock", initials: "AL", category: "Identity", priceUsd: 0.0044, quality: 92, value: 0.57, color: "#7a5bdb" }
].map((provider) => {
  const account = privateKeyToAccount(providerPrivateKey(provider.id));
  return {
    ...provider,
    account,
    address: account.address,
    priceUnits: usdToUnits(provider.priceUsd)
  };
});
const BATCH_SETTLEMENT_ACCOUNT = privateKeyToAccount(providerPrivateKey("batch-settlement"));

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

export function createState() {
  return {
    tasks: new Map(),
    challenges: new Map(),
    walletCards: new Map(),
    nextTaskId: 1,
    providerRevenue: Object.fromEntries(providers.map((provider) => [provider.id, 0n]))
  };
}

function providerPrivateKey(providerId) {
  const envName = `PROVIDER_PRIVATE_KEY_${providerId.toUpperCase()}`;
  const configured = process.env[envName];
  if (configured) {
    return configured;
  }
  const hash = crypto
    .createHash("sha256")
    .update(`agent-expense-card-local-preview-provider:${providerId}`)
    .digest("hex");
  return `0x${hash}`;
}

function readPublicJson(...segments) {
  const filePath = path.join(root, ...segments);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function createOnchainRuntime() {
  if (!CONTRACT_ABI || !process.env.DEPLOYER_PRIVATE_KEY) {
    return null;
  }
  try {
    const account = privateKeyToAccount(normalizePrivateKey(process.env.DEPLOYER_PRIVATE_KEY, "DEPLOYER_PRIVATE_KEY"));
    const chain = {
      ...ARC_TESTNET,
      rpcUrls: {
        default: {
          http: [ARC_RPC_URL]
        }
      }
    };
    return {
      account,
      chain,
      contractAddress: ARC_DEPLOYMENT?.contractAddress ?? ACTIVE_CONTRACT_ADDRESS,
      publicClient: createPublicClient({ chain, transport: viemHttp() }),
      walletClient: createWalletClient({ account, chain, transport: viemHttp() })
    };
  } catch {
    return null;
  }
}

export function createAppServer(options = {}) {
  const state = options.state ?? createState();
  const server = http.createServer(async (request, response) => {
    await handleAppRequest(request, response, state);
  });
  server.state = state;
  return server;
}

export async function handleAppRequest(request, response, state = createState()) {
  try {
    await routeRequest(request, response, state);
  } catch (error) {
    const statusCode = error.statusCode ?? 500;
    sendJson(response, statusCode, {
      error: error.code ?? "server_error",
      message: statusCode >= 500
        ? publicErrorMessage(error)
        : error instanceof Error ? error.message : "Unknown server error"
    });
  }
}

async function routeRequest(request, response, state) {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/api/config") {
    sendJson(response, 200, {
      actionTarget: ACTION_TARGET,
      arc: {
        chainId: Number(ARC_CHAIN_ID),
        rpcUrl: ARC_RPC_URL,
        explorerUrl: ARC_TESTNET.blockExplorers.default.url,
        currency: "USDC"
      },
      contract: {
        address: ACTIVE_CONTRACT_ADDRESS,
        previewAddress: CONTRACT_PREVIEW_FALLBACK_ADDRESS,
        bytecode: CONTRACT_ARTIFACT?.bytecode ?? null,
        constructorAsset: "0x0000000000000000000000000000000000000000",
        source: ARC_DEPLOYMENT ? "arc-testnet-deployment" : "local-preview-fallback",
        deploymentTx: ARC_DEPLOYMENT?.transactionHash ?? null,
        strictPolicyFunction: "createStrictPolicyTask",
        receiptFunction: "recordSpendWithProviderSignature",
        batchReceiptFunction: "recordSpendsWithProviderSignatures",
        walletCardFunction: "fundEscrowTask"
      },
      onchain: {
        available: Boolean(ONCHAIN_RUNTIME),
        chainId: Number(ARC_CHAIN_ID),
        contractAddress: ONCHAIN_RUNTIME?.contractAddress ?? null,
        signerAddress: ONCHAIN_RUNTIME?.account.address ?? null,
        taskFunction: "createStrictPolicyTask",
        receiptFunction: "recordSpendWithProviderSignature",
        batchReceiptFunction: "recordSpendsWithProviderSignatures"
      },
      cards: {
        sponsoredCreation: Boolean(ONCHAIN_RUNTIME && CONTRACT_ABI && CONTRACT_ARTIFACT?.bytecode),
        endpoint: "/api/cards"
      },
      x402: {
        mode: X402_MODE,
        gatewayUrl: GATEWAY_TESTNET_URL,
        network: GATEWAY_NETWORK,
        scheme: GATEWAY_SCHEME,
        asset: GATEWAY_CHAIN.usdc,
        gatewayWallet: GATEWAY_CHAIN.gatewayWallet,
        relayAgentAddress: ANCHOR_RELAYER_ADDRESS,
        batchSettlementAddress: BATCH_SETTLEMENT_ACCOUNT.address,
        maxBatchProofs: MAX_BATCH_PROOFS
      },
      proof: {
        deployment: publicDeploymentProof(),
        task: publicTaskProof(),
        anchor: publicAnchorProof()
      },
      providers: publicProviders(),
      providerRevenue: publicProviderRevenue(state)
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/cards") {
    const body = await readJson(request);
    const card = await createWalletCard(body, state);
    sendJson(response, 201, publicWalletCard(card));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/gateway/balance") {
    const address = requireAddress(url.searchParams.get("address"));
    sendJson(response, 200, await gatewayBalance(address));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/gateway/batch-facts") {
    const body = await readJson(request);
    const scenarioKey = scenarios[body.scenarioKey] ? body.scenarioKey : "invoice";
    const gatewayTask = await loadGatewayTask(body, scenarioKey);
    await handleGatewayBatchRequest({ request, response, state, body, task: gatewayTask });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJson(request);
    const task = await createTask(body, state);
    sendJson(response, 201, publicTask(task, state));
    return;
  }

  const providerMatch = url.pathname.match(/^\/api\/providers\/([^/]+)\/facts$/);
  if (request.method === "POST" && providerMatch) {
    await handleFactRequest(providerMatch[1], request, response, state);
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/tasks/")) {
    const taskId = Number(url.pathname.split("/").at(-1));
    const task = state.tasks.get(taskId);
    if (!task) {
      sendJson(response, 404, { error: "task_not_found" });
      return;
    }
    sendJson(response, 200, publicTask(task, state));
    return;
  }

  serveStatic(url.pathname, response);
}

async function createTask(body, state) {
  cleanupState(state);
  if (state.tasks.size >= MAX_TASKS) {
    throw httpError(429, "task_limit_reached", "Too many in-memory preview tasks are active.");
  }
  const scenarioKey = scenarios[body.scenarioKey] ? body.scenarioKey : "invoice";
  const settlementMode = body.settlementMode === "onchain" ? "onchain" : "preview";
  if (settlementMode === "onchain" && !ONCHAIN_RUNTIME) {
    throw httpError(503, "onchain_unavailable", "On-chain mode needs an Arc deployment, compiled contract ABI, and a local deployer key.");
  }
  const fundingMode = body.fundingMode === "testnet" ? "testnet" : "simulated";
  const budgetUnits = parseUsdUnits(body.budgetUsd ?? 0.25);
  const maxPerCallUnits = parseUsdUnits(body.maxPerCallUsd ?? 0.006);
  const agentAddress = settlementMode === "onchain"
    ? ONCHAIN_RUNTIME.account.address
    : fundingMode === "testnet"
    ? requireAddress(body.agentAddress)
    : normalizeAddress(body.agentAddress);

  if (budgetUnits <= 0n || maxPerCallUnits <= 0n || maxPerCallUnits > budgetUnits) {
    throw httpError(400, "invalid_budget", "Invalid budget or per-call cap.");
  }

  const onchainTask = settlementMode === "onchain"
    ? await createOnchainPolicyTask({ agentAddress, budgetUnits, maxPerCallUnits, scenarioKey })
    : null;
  const taskId = onchainTask ? Number(onchainTask.taskId) : state.nextTaskId;
  const task = {
    id: taskId,
    scenarioKey,
    label: scenarios[scenarioKey].label,
    fundingMode,
    settlementMode,
    agentAddress,
    budgetUnits,
    maxPerCallUnits,
    spentUnits: 0n,
    denied: 0,
    closed: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    purposeHash: hashJson({ scenarioKey, label: scenarios[scenarioKey].label }),
    receipts: [],
    onchain: onchainTask
  };
  state.nextTaskId = Math.max(state.nextTaskId, taskId + 1);
  state.tasks.set(task.id, task);
  return task;
}

async function createOnchainPolicyTask({ agentAddress, budgetUnits, maxPerCallUnits, scenarioKey }) {
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
  const purposeHash = hashJson({ scenarioKey, label: scenarios[scenarioKey].label });
  const { hash, receipt } = await writeOnchainContract({
    functionName: "createStrictPolicyTask",
    args: [
      agentAddress,
      budgetUnits,
      maxPerCallUnits,
      expiresAt,
      purposeHash
    ]
  });
  const taskId = extractTaskCreatedId(receipt);
  return {
    enabled: true,
    taskId: taskId.toString(),
    createTx: hash,
    createExplorerUrl: `${ARC_TESTNET.blockExplorers.default.url}/tx/${hash}`,
    contractAddress: ONCHAIN_RUNTIME.contractAddress,
    signerAddress: ONCHAIN_RUNTIME.account.address
  };
}

function extractTaskCreatedId(receipt) {
  for (const log of receipt.logs) {
    try {
      const parsed = decodeEventLog({
        abi: CONTRACT_ABI,
        data: log.data,
        topics: log.topics
      });
      if (parsed.eventName === "TaskCreated") {
        return BigInt(parsed.args.taskId);
      }
    } catch {
      // Ignore logs from other contracts or events.
    }
  }
  throw httpError(502, "onchain_task_event_missing", "On-chain task was mined, but TaskCreated was not found.");
}

async function handleFactRequest(providerId, request, response, state) {
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) {
    sendJson(response, 404, { error: "provider_not_found" });
    return;
  }

  const body = await readJson(request);
  const scenarioKey = scenarios[body.scenarioKey] ? body.scenarioKey : "invoice";
  if (X402_MODE !== "preview" && body.contractAddress && body.taskId) {
    const gatewayTask = await loadGatewayTask(body, scenarioKey);
    await handleGatewayFactRequest({ provider, request, response, state, body, task: gatewayTask });
    return;
  }

  const task = state.tasks.get(Number(body.taskId));
  if (!task || task.closed) {
    sendJson(response, 404, { error: "task_not_found" });
    return;
  }

  const index = Number(body.index ?? task.receipts.length);
  if (!Number.isInteger(index) || index < 0 || index >= 10_000) {
    sendJson(response, 400, { error: "invalid_index" });
    return;
  }
  const amountUnits = quotedAmountUnits(provider, index);
  const requestHash = hashJson({
    taskId: task.id,
    provider: provider.id,
    index,
    purpose: body.purpose,
    scenarioKey: task.scenarioKey,
    amountUnits: amountUnits.toString()
  });

  if (amountUnits > task.maxPerCallUnits) {
    task.denied += 1;
    sendJson(response, 409, {
      error: "per_call_cap_exceeded",
      amount: unitsToUsd(amountUnits),
      maxPerCall: unitsToUsd(task.maxPerCallUnits)
    });
    return;
  }

  if (task.spentUnits + amountUnits > task.budgetUnits) {
    task.denied += 1;
    sendJson(response, 409, {
      error: "budget_exceeded",
      amount: unitsToUsd(amountUnits),
      remaining: unitsToUsd(task.budgetUnits - task.spentUnits)
    });
    return;
  }

  const paymentHeader = request.headers["x-agent-payment"];
  if (!paymentHeader) {
    const challenge = createChallenge(task, provider, amountUnits, requestHash, body, state);
    sendJson(response, 402, {
      error: "payment_required",
      x402: challenge
    });
    return;
  }

  const payment = parsePaymentHeader(paymentHeader);
  const challenge = state.challenges.get(payment.challengeId);
  if (!challenge) {
    sendJson(response, 402, { error: "payment_challenge_missing" });
    return;
  }
  if (challenge.verifying) {
    sendJson(response, 409, { error: "payment_challenge_in_progress" });
    return;
  }
  if (challenge.expiresAtMs < Date.now()) {
    state.challenges.delete(payment.challengeId);
    sendJson(response, 402, { error: "payment_challenge_expired" });
    return;
  }
  if (
    challenge.taskId !== task.id ||
    challenge.providerId !== provider.id ||
    challenge.amountUnits !== amountUnits.toString() ||
    challenge.requestHash !== requestHash
  ) {
    sendJson(response, 402, { error: "payment_challenge_mismatch" });
    return;
  }
  challenge.verifying = true;
  let paymentCheck;
  try {
    paymentCheck = await verifyPayment(payment, challenge, task);
  } catch (error) {
    challenge.verifying = false;
    throw error;
  }
  if (!paymentCheck.ok) {
    challenge.verifying = false;
    sendJson(response, 402, {
      error: paymentCheck.error,
      message: paymentCheck.message
    });
    return;
  }

  state.challenges.delete(payment.challengeId);
  const fact = buildFact(task, provider, index, body.purpose);
  const receipt = await buildReceipt(task, provider, amountUnits, requestHash, fact, paymentCheck);
  if (task.settlementMode === "onchain") {
    receipt.onchain = await anchorReceiptOnchain(task, receipt);
    receipt.settlement = "arc-testnet-onchain-provider-signed";
    receipt.network = "arc-testnet";
  }
  task.spentUnits += amountUnits;
  task.receipts.push(receipt);
  state.providerRevenue[provider.id] += amountUnits;

  sendJson(response, 200, {
    fact,
    receipt,
    task: publicTask(task, state),
    providerRevenue: publicProviderRevenue(state)
  });
}

async function loadGatewayTask(body, scenarioKey) {
  if (!ONCHAIN_RUNTIME || !CONTRACT_ABI || !ANCHOR_RELAYER_ADDRESS) {
    throw httpError(503, "onchain_unavailable", "Circle Gateway receipt anchoring needs the Arc relayer runtime.");
  }
  const contractAddress = requireAddress(body.contractAddress);
  const buyerAddress = requireAddress(body.buyerAddress ?? body.walletAddress);
  const taskId = parsePositiveBigInt(body.taskId, "taskId");
  const taskRow = await ONCHAIN_RUNTIME.publicClient.readContract({
    address: contractAddress,
    abi: CONTRACT_ABI,
    functionName: "tasks",
    args: [taskId]
  });
  const agentAddress = getAddress(taskRow[0]);
  const budgetUnits = BigInt(taskRow[2]);
  const spentUnits = BigInt(taskRow[3]);
  const maxPerCallUnits = BigInt(taskRow[4]);
  const expiresAtSeconds = BigInt(taskRow[5]);
  const closed = Boolean(taskRow[6]);
  const requireProviderSignature = Boolean(taskRow[7]);
  const purposeHash = taskRow[8];

  if (agentAddress !== ANCHOR_RELAYER_ADDRESS) {
    throw httpError(400, "relay_agent_mismatch", "This policy task must delegate receipt anchoring to the PennyPilot Arc relayer.");
  }
  if (closed) {
    throw httpError(409, "task_closed", "This policy task is already closed.");
  }
  if (!requireProviderSignature) {
    throw httpError(400, "provider_signature_required", "Circle Gateway receipts must use a strict provider-signed policy task.");
  }
  if (expiresAtSeconds <= BigInt(Math.floor(Date.now() / 1000))) {
    throw httpError(409, "task_expired", "This policy task has expired.");
  }

  const taskNumber = Number(taskId);
  if (!Number.isSafeInteger(taskNumber)) {
    throw httpError(400, "task_id_too_large", "Task id is too large for the demo report format.");
  }
  return {
    id: taskNumber,
    scenarioKey,
    label: scenarios[scenarioKey].label,
    fundingMode: "gateway",
    settlementMode: "circle-gateway",
    agentAddress,
    buyerAddress,
    contractAddress,
    budgetUnits,
    maxPerCallUnits,
    spentUnits,
    denied: 0,
    closed: false,
    createdAt: null,
    expiresAt: new Date(Number(expiresAtSeconds) * 1000).toISOString(),
    purposeHash,
    receipts: [],
    onchain: {
      enabled: true,
      taskId: taskId.toString(),
      contractAddress,
      signerAddress: ANCHOR_RELAYER_ADDRESS
    }
  };
}

async function handleGatewayFactRequest({ provider, request, response, state, body, task }) {
  if (!GATEWAY_FACILITATOR) {
    throw httpError(503, "x402_gateway_unavailable", "Circle Gateway integration is not enabled on this runtime.");
  }

  const scenario = scenarios[task.scenarioKey];
  const index = Number(body.index ?? 0);
  if (!Number.isInteger(index) || index < 0 || index >= 10_000) {
    sendJson(response, 400, { error: "invalid_index" });
    return;
  }
  const purpose = String(body.purpose ?? scenario.purposes[index % scenario.purposes.length] ?? "paid fact");
  const amountUnits = quotedAmountUnits(provider, index);
  const requestHash = hashJson({
    contractAddress: task.contractAddress,
    taskId: task.id,
    provider: provider.id,
    index,
    purpose,
    scenarioKey: task.scenarioKey,
    amountUnits: amountUnits.toString()
  });

  if (amountUnits > task.maxPerCallUnits) {
    sendJson(response, 409, {
      error: "per_call_cap_exceeded",
      amount: unitsToUsd(amountUnits),
      maxPerCall: unitsToUsd(task.maxPerCallUnits)
    });
    return;
  }

  if (task.spentUnits + amountUnits > task.budgetUnits) {
    sendJson(response, 409, {
      error: "budget_exceeded",
      amount: unitsToUsd(amountUnits),
      remaining: unitsToUsd(task.budgetUnits - task.spentUnits)
    });
    return;
  }

  const paymentRequirements = buildGatewayPaymentRequirements(request, provider.address, amountUnits);
  const paymentHeader = request.headers["payment-signature"];
  if (!paymentHeader) {
    sendJson(response, 402, {
      error: "payment_required",
      protocol: "x402-circle-gateway",
      amount: unitsToUsd(amountUnits),
      amountUnits: amountUnits.toString(),
      asset: GATEWAY_CHAIN.usdc,
      payTo: provider.address,
      requestHash
    }, {
      "PAYMENT-REQUIRED": encodePaymentRequiredHeader({
        x402Version: 2,
        resource: gatewayResource(request, provider),
        accepts: [paymentRequirements]
      })
    });
    return;
  }

  let paymentPayload;
  try {
    paymentPayload = decodePaymentSignatureHeader(String(paymentHeader));
  } catch {
    sendJson(response, 400, {
      error: "payment_signature_invalid",
      message: "The PAYMENT-SIGNATURE header could not be decoded."
    });
    return;
  }

  const verifyResult = await GATEWAY_FACILITATOR.verify(paymentPayload, paymentRequirements);
  if (!verifyResult.isValid) {
    sendJson(response, 402, {
      error: "payment_verification_failed",
      message: verifyResult.invalidReason ?? "Circle Gateway rejected the payment payload."
    });
    return;
  }

  const settleResult = await GATEWAY_FACILITATOR.settle(paymentPayload, paymentRequirements);
  if (!settleResult.success) {
    sendJson(response, 402, {
      error: "payment_settlement_failed",
      message: settleResult.errorReason ?? "Circle Gateway could not settle this payment."
    });
    return;
  }

  const fact = buildFact(task, provider, index, purpose);
  const receipt = await buildReceipt(task, provider, amountUnits, requestHash, fact, {
    mode: "circle-gateway-x402",
    signer: settleResult.payer ?? verifyResult.payer ?? task.buyerAddress,
    settlement: "circle-gateway-x402",
    network: settleResult.network || "arc-testnet",
    transaction: settleResult.transaction
  });
  receipt.onchain = await anchorReceiptOnchain(task, receipt);
  task.spentUnits += amountUnits;
  task.receipts.push(receipt);
  state.providerRevenue[provider.id] += amountUnits;

  sendJson(response, 200, {
    fact,
    receipt,
    task: publicTask(task, state),
    providerRevenue: publicProviderRevenue(state)
  }, {
    "PAYMENT-RESPONSE": encodePaymentResponseHeader(settleResult)
  });
}

async function handleGatewayBatchRequest({ request, response, state, body, task }) {
  if (!GATEWAY_FACILITATOR) {
    throw httpError(503, "x402_gateway_unavailable", "Circle Gateway integration is not enabled on this runtime.");
  }

  const items = buildGatewayBatchPlan(body, task);
  const totalAmountUnits = items.reduce((sum, item) => sum + item.amountUnits, 0n);
  if (task.spentUnits + totalAmountUnits > task.budgetUnits) {
    sendJson(response, 409, {
      error: "budget_exceeded",
      amount: unitsToUsd(totalAmountUnits),
      remaining: unitsToUsd(task.budgetUnits - task.spentUnits)
    });
    return;
  }

  const paymentRequirements = buildGatewayPaymentRequirements(
    request,
    BATCH_SETTLEMENT_ACCOUNT.address,
    totalAmountUnits
  );
  const paymentHeader = request.headers["payment-signature"];
  if (!paymentHeader) {
    sendJson(response, 402, {
      error: "payment_required",
      protocol: "x402-circle-gateway-batch",
      count: items.length,
      amount: unitsToUsd(totalAmountUnits),
      amountUnits: totalAmountUnits.toString(),
      asset: GATEWAY_CHAIN.usdc,
      payTo: BATCH_SETTLEMENT_ACCOUNT.address,
      requestHashes: items.map((item) => item.requestHash)
    }, {
      "PAYMENT-REQUIRED": encodePaymentRequiredHeader({
        x402Version: 2,
        resource: gatewayBatchResource(request, items.length),
        accepts: [paymentRequirements]
      })
    });
    return;
  }

  let paymentPayload;
  try {
    paymentPayload = decodePaymentSignatureHeader(String(paymentHeader));
  } catch {
    sendJson(response, 400, {
      error: "payment_signature_invalid",
      message: "The PAYMENT-SIGNATURE header could not be decoded."
    });
    return;
  }

  const verifyResult = await GATEWAY_FACILITATOR.verify(paymentPayload, paymentRequirements);
  if (!verifyResult.isValid) {
    sendJson(response, 402, {
      error: "payment_verification_failed",
      message: verifyResult.invalidReason ?? "Circle Gateway rejected the batch payment payload."
    });
    return;
  }

  const settleResult = await GATEWAY_FACILITATOR.settle(paymentPayload, paymentRequirements);
  if (!settleResult.success) {
    sendJson(response, 402, {
      error: "payment_settlement_failed",
      message: settleResult.errorReason ?? "Circle Gateway could not settle this batch payment."
    });
    return;
  }

  const facts = [];
  const receipts = [];
  const batchId = crypto.randomUUID();
  for (const item of items) {
    const fact = buildFact(task, item.provider, item.index, item.purpose);
    const receipt = await buildReceipt(task, item.provider, item.amountUnits, item.requestHash, fact, {
      mode: "circle-gateway-x402-batch",
      signer: settleResult.payer ?? verifyResult.payer ?? task.buyerAddress,
      settlement: "circle-gateway-x402-batch",
      network: settleResult.network || "arc-testnet",
      transaction: settleResult.transaction,
      contractFunction: "recordSpendsWithProviderSignatures",
      batch: {
        id: batchId,
        size: items.length,
        totalAmountUnits: totalAmountUnits.toString(),
        settlementPayTo: BATCH_SETTLEMENT_ACCOUNT.address
      }
    });
    facts.push(fact);
    receipts.push(receipt);
  }

  const onchain = await anchorReceiptsOnchain(task, receipts);
  for (const [index, receipt] of receipts.entries()) {
    receipt.onchain = {
      ...onchain,
      batchIndex: index,
      batchSize: receipts.length
    };
    task.spentUnits += BigInt(receipt.amountUnits);
    task.receipts.push(receipt);
    state.providerRevenue[receipt.providerId] += BigInt(receipt.amountUnits);
  }

  sendJson(response, 200, {
    facts,
    receipts,
    batch: {
      id: batchId,
      count: receipts.length,
      amount: unitsToUsd(totalAmountUnits),
      amountUnits: totalAmountUnits.toString(),
      paymentTransaction: settleResult.transaction ?? null,
      anchorTransaction: onchain.transactionHash
    },
    task: publicTask(task, state),
    providerRevenue: publicProviderRevenue(state)
  }, {
    "PAYMENT-RESPONSE": encodePaymentResponseHeader(settleResult)
  });
}

async function anchorReceiptOnchain(task, receipt) {
  if (!ONCHAIN_RUNTIME) {
    throw httpError(503, "onchain_unavailable", "On-chain mode is not configured.");
  }
  const { hash, receipt: txReceipt } = await writeOnchainContract({
    address: task.contractAddress ?? ONCHAIN_RUNTIME.contractAddress,
    functionName: "recordSpendWithProviderSignature",
    args: [
      BigInt(task.id),
      receipt.providerAddress,
      BigInt(receipt.amountUnits),
      Number(receipt.railId ?? 0),
      receipt.requestHash,
      receipt.receiptHash,
      receipt.providerSignature
    ]
  });
  return {
    transactionHash: hash,
    explorerUrl: `${ARC_TESTNET.blockExplorers.default.url}/tx/${hash}`,
    blockNumber: txReceipt.blockNumber.toString(),
    contractAddress: task.contractAddress ?? ONCHAIN_RUNTIME.contractAddress
  };
}

async function anchorReceiptsOnchain(task, receipts) {
  if (!ONCHAIN_RUNTIME) {
    throw httpError(503, "onchain_unavailable", "On-chain mode is not configured.");
  }
  const { hash, receipt: txReceipt } = await writeOnchainContract({
    address: task.contractAddress ?? ONCHAIN_RUNTIME.contractAddress,
    functionName: "recordSpendsWithProviderSignatures",
    args: [
      BigInt(task.id),
      receipts.map((receipt) => ({
        provider: receipt.providerAddress,
        amount: BigInt(receipt.amountUnits),
        rail: Number(receipt.railId ?? 0),
        requestHash: receipt.requestHash,
        receiptHash: receipt.receiptHash,
        providerSignature: receipt.providerSignature
      }))
    ],
    gas: 300000n + BigInt(receipts.length) * 260000n
  });
  return {
    transactionHash: hash,
    explorerUrl: `${ARC_TESTNET.blockExplorers.default.url}/tx/${hash}`,
    blockNumber: txReceipt.blockNumber.toString(),
    contractAddress: task.contractAddress ?? ONCHAIN_RUNTIME.contractAddress,
    functionName: "recordSpendsWithProviderSignatures"
  };
}

async function createWalletCard(body, state) {
  if (!ONCHAIN_RUNTIME || !CONTRACT_ABI || !CONTRACT_ARTIFACT?.bytecode) {
    throw httpError(503, "onchain_unavailable", "Sponsored card creation needs Arc on-chain runtime and compiled bytecode.");
  }
  const ownerAddress = requireWalletAddress(body.ownerAddress ?? body.owner);
  const cacheKey = ownerAddress.toLowerCase();
  const cached = state.walletCards.get(cacheKey);
  if (cached) {
    return cached;
  }

  const { hash: deployTx, receipt: deployReceipt } = await deployOnchainCard();
  if (!deployReceipt.contractAddress) {
    throw httpError(502, "card_deploy_failed", "Card deployment was mined, but no contract address was returned.");
  }

  const contractAddress = getAddress(deployReceipt.contractAddress);
  const providerAddresses = providers.map((provider) => provider.address);
  const { hash: setupTx } = await writeOnchainContract({
    address: contractAddress,
    functionName: "setProviders",
    args: [providerAddresses],
    gas: 900_000n
  });
  const { hash: ownershipTx } = await writeOnchainContract({
    address: contractAddress,
    functionName: "transferOwnership",
    args: [ownerAddress],
    gas: 250_000n
  });

  const owner = await ONCHAIN_RUNTIME.publicClient.readContract({
    address: contractAddress,
    abi: CONTRACT_ABI,
    functionName: "owner"
  });
  if (getAddress(owner) !== ownerAddress) {
    throw httpError(502, "card_owner_mismatch", "Sponsored card was created but ownership was not transferred to the wallet.");
  }

  const card = {
    owner: ownerAddress,
    contractAddress,
    deployTx,
    setupTx,
    ownershipTx,
    providersReady: true,
    explorerUrl: `${ARC_TESTNET.blockExplorers.default.url}/address/${contractAddress}`,
    createdAt: new Date().toISOString()
  };
  state.walletCards.set(cacheKey, card);
  return card;
}

async function gatewayBalance(address) {
  const response = await fetch(`${GATEWAY_TESTNET_URL}/balances`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: "USDC",
      sources: [{ depositor: address, domain: GATEWAY_CHAIN.domain }]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(502, "gateway_balance_unavailable", payload.message ?? "Circle Gateway balance is unavailable.");
  }
  const balance = payload.balances?.[0] ?? {};
  const available = String(balance.balance ?? "0");
  const withdrawing = String(balance.withdrawing ?? "0");
  const withdrawable = String(balance.withdrawable ?? "0");
  return {
    address,
    network: GATEWAY_NETWORK,
    domain: GATEWAY_CHAIN.domain,
    available,
    availableUnits: decimalUsdcToUnits(available).toString(),
    withdrawing,
    withdrawingUnits: decimalUsdcToUnits(withdrawing).toString(),
    withdrawable,
    withdrawableUnits: decimalUsdcToUnits(withdrawable).toString()
  };
}

async function deployOnchainCard() {
  const nonce = await nextOnchainNonce();
  let lastError;
  for (const multiplier of [3n, 5n, 8n]) {
    const hash = await ONCHAIN_RUNTIME.walletClient.deployContract({
      abi: CONTRACT_ABI,
      bytecode: CONTRACT_ARTIFACT.bytecode,
      args: ["0x0000000000000000000000000000000000000000"],
      nonce,
      gas: 7_000_000n,
      gasPrice: await onchainGasPrice(multiplier)
    });
    try {
      const receipt = await ONCHAIN_RUNTIME.publicClient.waitForTransactionReceipt({
        hash,
        timeout: 120000
      });
      return { hash, receipt };
    } catch (error) {
      lastError = error;
      const receipt = await ONCHAIN_RUNTIME.publicClient.getTransactionReceipt({ hash }).catch(() => null);
      if (receipt) {
        return { hash, receipt };
      }
      const latestNonce = await ONCHAIN_RUNTIME.publicClient.getTransactionCount({
        address: ONCHAIN_RUNTIME.account.address,
        blockTag: "latest"
      });
      if (latestNonce > nonce) {
        throw httpError(502, "onchain_nonce_replaced", "On-chain transaction nonce was consumed by another transaction.");
      }
      await sleep(1500);
    }
  }
  throw lastError;
}

async function writeOnchainContract({ address = ONCHAIN_RUNTIME.contractAddress, functionName, args, gas = 500000n }) {
  const nonce = await nextOnchainNonce();
  let lastError;
  for (const multiplier of [3n, 5n, 8n]) {
    const hash = await ONCHAIN_RUNTIME.walletClient.writeContract({
      address,
      abi: CONTRACT_ABI,
      functionName,
      args,
      nonce,
      gas,
      gasPrice: await onchainGasPrice(multiplier)
    });
    try {
      const receipt = await ONCHAIN_RUNTIME.publicClient.waitForTransactionReceipt({
        hash,
        timeout: 90000
      });
      return { hash, receipt };
    } catch (error) {
      lastError = error;
      const receipt = await ONCHAIN_RUNTIME.publicClient.getTransactionReceipt({ hash }).catch(() => null);
      if (receipt) {
        return { hash, receipt };
      }
      const latestNonce = await ONCHAIN_RUNTIME.publicClient.getTransactionCount({
        address: ONCHAIN_RUNTIME.account.address,
        blockTag: "latest"
      });
      if (latestNonce > nonce) {
        throw httpError(502, "onchain_nonce_replaced", "On-chain transaction nonce was consumed by another transaction.");
      }
      await sleep(1500);
    }
  }
  throw lastError;
}

async function nextOnchainNonce() {
  return ONCHAIN_RUNTIME.publicClient.getTransactionCount({
    address: ONCHAIN_RUNTIME.account.address,
    blockTag: "latest"
  });
}

async function onchainGasPrice(multiplier = 4n) {
  const gasPrice = await ONCHAIN_RUNTIME.publicClient.getGasPrice();
  return gasPrice * multiplier;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createChallenge(task, provider, amountUnits, requestHash, body, state) {
  cleanupState(state);
  if (state.challenges.size >= MAX_ACTIVE_CHALLENGES) {
    throw httpError(429, "challenge_limit_reached", "Too many pending payment challenges.");
  }
  const challenge = {
    id: crypto.randomUUID(),
    protocol: "x402-preview",
    network: "arc-testnet-usdc",
    taskId: task.id,
    providerId: provider.id,
    provider: provider.name,
    payTo: provider.address,
    amount: unitsToUsd(amountUnits),
    amountUnits: amountUnits.toString(),
    asset: "USDC",
    requestHash,
    purpose: String(body.purpose ?? "paid fact"),
    expiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
    expiresAtMs: Date.now() + 60 * 1000
  };
  challenge.paymentMessage = paymentMessage(challenge);
  state.challenges.set(challenge.id, challenge);
  return challenge;
}

function parsePaymentHeader(header) {
  if (String(header).length > MAX_PAYMENT_HEADER_BYTES) {
    return {};
  }
  try {
    return JSON.parse(Buffer.from(String(header), "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

async function verifyPayment(payment, challenge, task) {
  const fieldsMatch =
    payment.protocol === "x402-preview" &&
    payment.challengeId === challenge.id &&
    Number(payment.taskId) === task.id &&
    payment.providerId === challenge.providerId &&
    String(payment.amountUnits) === challenge.amountUnits &&
    payment.requestHash === challenge.requestHash;

  if (!fieldsMatch) {
    return {
      ok: false,
      error: "payment_authorization_mismatch",
      message: "Payment authorization did not match the issued challenge."
    };
  }

  if (payment.signature) {
    try {
      const signer = await recoverMessageAddress({
        message: challenge.paymentMessage,
        signature: payment.signature
      });
      const expected = getAddress(payment.signer);
      if (getAddress(signer) !== expected) {
        return {
          ok: false,
          error: "payment_signature_mismatch",
          message: "Payment signature did not recover to the declared signer."
        };
      }
      if (task.fundingMode === "testnet" && expected !== task.agentAddress) {
        return {
          ok: false,
          error: "payment_signer_not_agent",
          message: "Testnet payments must be signed by the task agent wallet."
        };
      }
      return {
        ok: true,
        mode: "wallet-signature",
        signer: expected
      };
    } catch {
      return {
        ok: false,
        error: "payment_signature_invalid",
        message: "Payment signature could not be verified."
      };
    }
  }

  if (task.fundingMode === "testnet") {
    return {
      ok: false,
      error: "wallet_signature_required",
      message: "Arc testnet mode requires a wallet signature over the payment challenge."
    };
  }

  if (payment.authorization !== "browser-preview-payment-authorization") {
    return {
      ok: false,
      error: "preview_authorization_missing",
      message: "Simulated mode requires the local preview authorization token."
    };
  }

  return {
    ok: true,
    mode: "preview-challenge-match",
    signer: SIM_AGENT_ADDRESS
  };
}

function buildFact(task, provider, index, purpose) {
  const qualityLift = Number(((provider.quality / 100) * (0.45 + seededNoise(index, 4) * 0.55)).toFixed(4));
  const riskDrop = Number(((provider.id === "risk" || provider.id === "sanctions" ? 0.9 : 0.42) + seededNoise(index, 6) * 0.08).toFixed(4));
  const latency = Math.round(72 + seededNoise(index, 9) * 180);
  const confidence = Math.min(99, Math.round(provider.quality + seededNoise(index, 12) * 5));
  return {
    id: crypto.randomUUID(),
    providerId: provider.id,
    provider: provider.name,
    category: provider.category,
    purpose,
    scenario: task.label,
    verdict: confidence > 90 ? "clear" : confidence > 86 ? "usable" : "review",
    confidence,
    qualityLift,
    riskDrop,
    latency,
    evidence: evidenceFor(provider.id, task.scenarioKey, index)
  };
}

function buildGatewayBatchPlan(body, task) {
  const rawItems = Array.isArray(body.items)
    ? body.items
    : defaultGatewayBatchItems(task.scenarioKey, body.count ?? body.taskCount ?? body.proofCount, body.startIndex);
  if (rawItems.length === 0) {
    throw httpError(400, "empty_batch", "Select at least one proof for the batch.");
  }
  if (rawItems.length > MAX_BATCH_PROOFS) {
    throw httpError(400, "batch_too_large", `Batch proof count cannot exceed ${MAX_BATCH_PROOFS}.`);
  }

  const seen = new Set();
  return rawItems.map((item) => {
    const provider = providerById(item.providerId);
    const index = parseBatchIndex(item.index);
    const scenario = scenarios[task.scenarioKey];
    const purpose = String(item.purpose ?? scenario.purposes[index % scenario.purposes.length] ?? "paid fact");
    const dedupeKey = `${provider.id}:${index}:${purpose}`;
    if (seen.has(dedupeKey)) {
      throw httpError(400, "duplicate_batch_item", "Batch contains a duplicate proof request.");
    }
    seen.add(dedupeKey);

    const amountUnits = quotedAmountUnits(provider, index);
    if (amountUnits > task.maxPerCallUnits) {
      throw httpError(409, "per_call_cap_exceeded", `${provider.name} quote exceeds the per-call cap.`);
    }
    const requestHash = hashJson({
      contractAddress: task.contractAddress,
      taskId: task.id,
      provider: provider.id,
      index,
      purpose,
      scenarioKey: task.scenarioKey,
      amountUnits: amountUnits.toString()
    });
    return {
      provider,
      index,
      purpose,
      amountUnits,
      requestHash
    };
  });
}

function defaultGatewayBatchItems(scenarioKey, countValue, startIndexValue) {
  const scenario = scenarios[scenarioKey];
  const count = parseBatchCount(countValue ?? ACTION_TARGET);
  const startIndex = parseBatchIndex(startIndexValue ?? 0);
  return Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;
    const providerOrder = scenario.providerOrder ?? providers.map((provider) => provider.id);
    return {
      providerId: providerOrder[index % providerOrder.length],
      index,
      purpose: scenario.purposes[index % scenario.purposes.length]
    };
  });
}

function providerById(providerId) {
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) {
    throw httpError(400, "provider_not_found", `Unknown provider "${providerId}".`);
  }
  return provider;
}

function parseBatchCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH_PROOFS) {
    throw httpError(400, "invalid_batch_count", `Batch proof count must be between 1 and ${MAX_BATCH_PROOFS}.`);
  }
  return count;
}

function parseBatchIndex(value) {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index >= 10_000) {
    throw httpError(400, "invalid_index", "Proof index must be a non-negative integer below 10000.");
  }
  return index;
}

async function buildReceipt(task, provider, amountUnits, requestHash, fact, paymentCheck) {
  const receiptHash = hashJson({
    taskId: task.id,
    factId: fact.id,
    provider: provider.id,
    amountUnits: amountUnits.toString(),
    requestHash,
    settledAt: new Date().toISOString()
  });
  const { structHash, digest } = receiptHashes(task, provider, amountUnits, requestHash, receiptHash);
  const providerSignature = await provider.account.signMessage({
    message: { raw: structHash }
  });
  return {
    id: crypto.randomUUID(),
    taskId: task.id,
    providerId: provider.id,
    provider: provider.name,
    providerAddress: provider.address,
    agentAddress: task.agentAddress,
    settlement: paymentCheck.settlement ?? "x402-preview-provider-signed",
    rail: "X402Gateway",
    railId: 0,
    network: paymentCheck.network ?? "arc-testnet-usdc",
    amount: unitsToUsd(amountUnits),
    amountUnits: amountUnits.toString(),
    requestHash,
    receiptHash,
    receiptStructHash: structHash,
    contractDigest: digest,
    providerSignature,
    paymentVerification: paymentCheck.mode,
    paymentSigner: paymentCheck.signer ?? null,
    paymentTransaction: paymentCheck.transaction ?? null,
    paymentBatch: paymentCheck.batch ?? null,
    contractPreview: {
      address: task.contractAddress ?? ACTIVE_CONTRACT_ADDRESS,
      functionName: paymentCheck.contractFunction ?? "recordSpendWithProviderSignature"
    },
    settledAt: new Date().toISOString()
  };
}

function receiptHashes(task, provider, amountUnits, requestHash, receiptHash) {
  const contractAddress = task.contractAddress ?? ACTIVE_CONTRACT_ADDRESS;
  const structHash = keccak256(
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
        ARC_CHAIN_ID,
        contractAddress,
        BigInt(task.id),
        task.agentAddress,
        provider.address,
        amountUnits,
        0,
        requestHash,
        receiptHash
      ]
    )
  );
  const digest = keccak256(
    `0x${Buffer.concat([
      Buffer.from("\x19Ethereum Signed Message:\n32", "binary"),
      Buffer.from(structHash.slice(2), "hex")
    ]).toString("hex")}`
  );
  return { structHash, digest };
}

function buildGatewayPaymentRequirements(request, payTo, amountUnits) {
  void request;
  return {
    scheme: GATEWAY_SCHEME,
    network: GATEWAY_NETWORK,
    amount: amountUnits.toString(),
    asset: GATEWAY_CHAIN.usdc,
    payTo,
    maxTimeoutSeconds: 10 * 60,
    extra: {
      name: GATEWAY_BATCH_NAME,
      version: GATEWAY_BATCH_VERSION,
      verifyingContract: GATEWAY_CHAIN.gatewayWallet
    }
  };
}

function gatewayBatchResource(request, count) {
  const host = request.headers["x-forwarded-host"] ?? request.headers.host ?? "localhost";
  const proto = request.headers["x-forwarded-proto"] ?? "https";
  const url = new URL(request.url ?? "/", `${proto}://${host}`);
  return {
    url: url.toString(),
    description: `PennyPilot ${count}-proof batch settlement`,
    mimeType: "application/json"
  };
}

function gatewayResource(request, provider) {
  const host = request.headers["x-forwarded-host"] ?? request.headers.host ?? "localhost";
  const proto = request.headers["x-forwarded-proto"] ?? "https";
  const url = new URL(request.url ?? "/", `${proto}://${host}`);
  return {
    url: url.toString(),
    description: `${provider.name} paid financial fact`,
    mimeType: "application/json"
  };
}

function paymentMessage(challenge) {
  return JSON.stringify({
    protocol: challenge.protocol,
    network: challenge.network,
    challengeId: challenge.id,
    taskId: challenge.taskId,
    providerId: challenge.providerId,
    payTo: challenge.payTo,
    amountUnits: challenge.amountUnits,
    asset: challenge.asset,
    requestHash: challenge.requestHash,
    expiresAt: challenge.expiresAt
  });
}

function evidenceFor(providerId, scenarioKey, index) {
  const table = {
    kyb: ["entity active", "beneficial owner matched", "registration fresh"],
    sanctions: ["no list match", "screening timestamp attached", "country risk normal"],
    invoice: ["invoice unique", "PO reference matched", "delivery proof attached"],
    risk: ["velocity normal", "device pattern stable", "fraud cluster absent"],
    fx: ["spread below threshold", "route liquid", "quote fresh"],
    identity: ["account owner matched", "bank name consistent", "routing details valid"]
  };
  const values = table[providerId] ?? ["fact returned"];
  return `${values[index % values.length]} for ${scenarioKey}`;
}

function publicTask(task, state) {
  return {
    id: task.id,
    scenarioKey: task.scenarioKey,
    label: task.label,
    fundingMode: task.fundingMode,
    settlementMode: task.settlementMode,
    agentAddress: task.agentAddress,
    buyerAddress: task.buyerAddress ?? null,
    budget: unitsToUsd(task.budgetUnits),
    budgetUnits: task.budgetUnits.toString(),
    maxPerCall: unitsToUsd(task.maxPerCallUnits),
    maxPerCallUnits: task.maxPerCallUnits.toString(),
    spent: unitsToUsd(task.spentUnits),
    spentUnits: task.spentUnits.toString(),
    remaining: unitsToUsd(task.budgetUnits - task.spentUnits),
    denied: task.denied,
    expiresAt: task.expiresAt,
    purposeHash: task.purposeHash,
    contractAddress: task.contractAddress ?? null,
    receiptCount: task.receipts.length,
    onchain: task.onchain ?? null,
    providerRevenue: publicProviderRevenue(state)
  };
}

export function publicProviders() {
  return providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    initials: provider.initials,
    category: provider.category,
    price: provider.priceUsd,
    priceUnits: provider.priceUnits.toString(),
    quality: provider.quality,
    value: provider.value,
    color: provider.color,
    address: provider.address
  }));
}

export function getProviderRegistry() {
  return publicProviders();
}

function publicWalletCard(card) {
  return {
    owner: card.owner,
    contractAddress: card.contractAddress,
    deployTx: card.deployTx,
    setupTx: card.setupTx,
    ownershipTx: card.ownershipTx,
    providersReady: card.providersReady,
    explorerUrl: card.explorerUrl,
    createdAt: card.createdAt
  };
}

function publicDeploymentProof() {
  if (!ARC_DEPLOYMENT) {
    return null;
  }
  return {
    network: ARC_DEPLOYMENT.network,
    chainId: ARC_DEPLOYMENT.chainId,
    contractAddress: ARC_DEPLOYMENT.contractAddress,
    transactionHash: ARC_DEPLOYMENT.transactionHash,
    explorerUrl: ARC_DEPLOYMENT.explorerUrl
  };
}

function publicTaskProof() {
  if (!ARC_TASK_DEPLOYMENT) {
    return null;
  }
  return {
    taskId: ARC_TASK_DEPLOYMENT.taskId,
    agent: ARC_TASK_DEPLOYMENT.agent,
    budgetUnits: ARC_TASK_DEPLOYMENT.budgetUnits,
    maxPerCallUnits: ARC_TASK_DEPLOYMENT.maxPerCallUnits,
    transactionHash: ARC_TASK_DEPLOYMENT.transactionHash,
    explorerUrl: ARC_TASK_DEPLOYMENT.explorerUrl
  };
}

function publicAnchorProof() {
  if (!ARC_ANCHOR_PROOF) {
    return null;
  }
  return {
    taskId: ARC_ANCHOR_PROOF.taskId,
    providerId: ARC_ANCHOR_PROOF.providerId,
    providerAddress: ARC_ANCHOR_PROOF.providerAddress,
    agentAddress: ARC_ANCHOR_PROOF.agentAddress,
    amountUnits: ARC_ANCHOR_PROOF.amountUnits,
    receiptHash: ARC_ANCHOR_PROOF.receiptHash,
    receiptStructHash: ARC_ANCHOR_PROOF.receiptStructHash,
    contractDigest: ARC_ANCHOR_PROOF.contractDigest,
    transactionHash: ARC_ANCHOR_PROOF.transactionHash,
    explorerUrl: ARC_ANCHOR_PROOF.explorerUrl
  };
}

function publicProviderRevenue(state) {
  return Object.fromEntries(
    providers.map((provider) => [
      provider.id,
      {
        amount: unitsToUsd(state.providerRevenue[provider.id] ?? 0n),
        amountUnits: String(state.providerRevenue[provider.id] ?? 0n)
      }
    ])
  );
}

function serveStatic(urlPath, response) {
  const fileName = STATIC_FILES.get(urlPath);
  if (!fileName) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }
  const filePath = path.join(root, fileName);
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(response, 404, { error: "not_found" });
      return;
    }
    response.writeHead(200, {
      ...securityHeaders(),
      "content-type": mimeTypes[path.extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(data);
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let rejected = false;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_JSON_BODY_BYTES && !rejected) {
        rejected = true;
        reject(httpError(413, "body_too_large", "JSON body exceeds the preview API limit."));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (rejected) {
        return;
      }
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    ...securityHeaders(),
    ...extraHeaders,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function securityHeaders() {
  return {
    "content-security-policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https://images.unsplash.com data:",
      "connect-src 'self' https://rpc.testnet.arc.network https://gateway-api-testnet.circle.com",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'"
    ].join("; "),
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  };
}

function httpError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function publicErrorMessage(error) {
  if (!error || typeof error !== "object") {
    return "Internal server error";
  }
  const message = error.shortMessage || error.message;
  if (!message || /private|secret|key/i.test(message)) {
    return "Internal server error";
  }
  return message;
}

function normalizeAddress(value) {
  return isAddress(value) ? getAddress(value) : SIM_AGENT_ADDRESS;
}

function requireAddress(value) {
  if (!isAddress(value)) {
    throw httpError(400, "wallet_required", "Arc testnet tasks require a valid agent wallet address.");
  }
  return getAddress(value);
}

function requireWalletAddress(value) {
  if (!isAddress(value)) {
    throw httpError(400, "wallet_required", "Connect a valid wallet address before creating a spend card.");
  }
  return getAddress(value);
}

function quotedAmountUnits(provider, index) {
  const jitterUnits = BigInt(Math.round(seededNoise(index + 1, provider.priceUsd * 10000) * 380));
  return provider.priceUnits + jitterUnits;
}

function parseUsdUnits(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw httpError(400, "invalid_amount", "Amount must be a positive finite number.");
  }
  return usdToUnits(parsed);
}

function parsePositiveBigInt(value, name) {
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n) {
      throw new Error("not positive");
    }
    return parsed;
  } catch {
    throw httpError(400, "invalid_integer", `${name} must be a positive integer.`);
  }
}

function usdToUnits(value) {
  return BigInt(Math.round(Number(value) * Number(USDC_UNIT)));
}

function decimalUsdcToUnits(value) {
  const [wholeRaw, fractionRaw = ""] = String(value).trim().split(".");
  const whole = wholeRaw || "0";
  const fraction = fractionRaw.padEnd(6, "0").slice(0, 6);
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) {
    return 0n;
  }
  return BigInt(whole) * USDC_UNIT + BigInt(fraction || "0");
}

function unitsToUsd(value) {
  return Number(value) / Number(USDC_UNIT);
}

function hashJson(value) {
  return keccak256(stringToHex(JSON.stringify(value)));
}

function cleanupState(state) {
  const now = Date.now();
  for (const [challengeId, challenge] of state.challenges) {
    if (challenge.expiresAtMs < now) {
      state.challenges.delete(challengeId);
    }
  }

  while (state.tasks.size >= MAX_TASKS) {
    const oldestTaskId = state.tasks.keys().next().value;
    if (oldestTaskId === undefined) {
      break;
    }
    state.tasks.delete(oldestTaskId);
  }
}

function seededNoise(index, salt) {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4173);
  const server = createAppServer();
  server.listen(port, () => {
    console.log(`PennyPilot running at http://localhost:${port}`);
  });
}
