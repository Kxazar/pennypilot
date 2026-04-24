import fs from "node:fs";
import path from "node:path";

const baseUrl = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:4173";
const actionTarget = Number(process.env.DEMO_ACTION_TARGET ?? 6);
const scenarioKey = process.env.DEMO_SCENARIO ?? "invoice";
const budgetUsd = Number(process.env.DEMO_BUDGET_USD ?? 0.25);
const maxPerCallUsd = Number(process.env.DEMO_MAX_PER_CALL_USD ?? 0.006);
const providerOrder = {
  invoice: ["invoice", "kyb", "sanctions", "identity", "risk", "fx"],
  merchant: ["kyb", "risk", "identity", "sanctions", "invoice", "fx"],
  treasury: ["fx", "sanctions", "risk", "identity", "kyb", "invoice"]
};
const purposes = {
  invoice: [
    "invoice duplicate check",
    "vendor KYB refresh",
    "sanctions screen",
    "bank account match",
    "delivery proof",
    "FX route check",
    "fraud anomaly score",
    "payment memo parse"
  ],
  merchant: [
    "beneficial owner match",
    "card testing pattern",
    "MCC risk lookup",
    "website evidence",
    "sanctions screen",
    "settlement velocity",
    "chargeback prior",
    "bank account match"
  ],
  treasury: [
    "FX quote",
    "liquidity depth",
    "counterparty KYB",
    "wallet risk",
    "sanctions screen",
    "settlement ETA",
    "fee comparison",
    "routing memo parse"
  ]
};

const config = await getJson("/api/config");
const task = await postJson("/api/tasks", {
  scenarioKey,
  budgetUsd,
  maxPerCallUsd,
  fundingMode: "simulated"
}, 201);
const receipts = [];
let latestTask = task;

for (let index = 0; index < actionTarget; index += 1) {
  const providerId = providerOrder[scenarioKey][index % providerOrder[scenarioKey].length];
  const purpose = purposes[scenarioKey][index % purposes[scenarioKey].length];
  const challengeBody = await postJson(`/api/providers/${providerId}/facts`, {
    taskId: task.id,
    scenarioKey,
    index,
    purpose
  }, 402);
  const settled = await postJson(`/api/providers/${providerId}/facts`, {
    taskId: task.id,
    scenarioKey,
    index,
    purpose
  }, 200, {
    "x-agent-payment": Buffer.from(JSON.stringify({
      protocol: "x402-preview",
      challengeId: challengeBody.x402.id,
      taskId: task.id,
      providerId,
      amountUnits: challengeBody.x402.amountUnits,
      requestHash: challengeBody.x402.requestHash,
      signer: "demo-report-runner",
      authorization: "browser-preview-payment-authorization"
    }), "utf8").toString("base64url")
  });
  latestTask = settled.task;
  receipts.push({
    providerId,
    provider: settled.receipt.provider,
    providerAddress: settled.receipt.providerAddress,
    purpose,
    amount: settled.receipt.amount,
    amountUnits: settled.receipt.amountUnits,
    requestHash: settled.receipt.requestHash,
    receiptHash: settled.receipt.receiptHash,
    receiptStructHash: settled.receipt.receiptStructHash,
    contractDigest: settled.receipt.contractDigest,
    providerSignature: settled.receipt.providerSignature,
    paymentVerification: settled.receipt.paymentVerification,
    settledAt: settled.receipt.settledAt,
    fact: settled.fact
  });
}

const spent = receipts.reduce((sum, receipt) => sum + Number(receipt.amount), 0);
const report = {
  app: "PennyPilot",
  generatedAt: new Date().toISOString(),
  baseUrl,
  scenarioKey,
  actionTarget,
  config: {
    chainId: config.arc.chainId,
    contract: config.contract,
    proof: config.proof
  },
  task: latestTask,
  summary: {
    calls: receipts.length,
    spent,
    averagePaidAction: spent / receipts.length,
    denied: latestTask.denied,
    remaining: latestTask.remaining,
    providers: summarizeProviders(receipts)
  },
  receipts
};

if (receipts.length !== actionTarget) {
  throw new Error(`Expected ${actionTarget} receipts, got ${receipts.length}.`);
}
if (latestTask.denied !== 0) {
  throw new Error(`Expected zero denied requests, got ${latestTask.denied}.`);
}
if (spent > budgetUsd) {
  throw new Error(`Budget exceeded in demo report: ${spent} > ${budgetUsd}.`);
}

const reportsDir = path.join(process.cwd(), "reports");
fs.mkdirSync(reportsDir, { recursive: true });
const reportPath = path.join(reportsDir, "pennypilot-demo-report.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Demo report saved: ${reportPath}`);
console.log(`Calls: ${receipts.length}`);
console.log(`Spent: ${spent.toFixed(6)} USDC`);
console.log(`Denied: ${latestTask.denied}`);

async function getJson(urlPath) {
  const response = await fetch(`${baseUrl}${urlPath}`);
  if (!response.ok) {
    throw new Error(`GET ${urlPath} failed with ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function postJson(urlPath, body, expectedStatus, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${urlPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  });
  if (response.status !== expectedStatus) {
    throw new Error(`POST ${urlPath} expected ${expectedStatus}, got ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function summarizeProviders(receiptsToSummarize) {
  const summary = {};
  for (const receipt of receiptsToSummarize) {
    const item = summary[receipt.providerId] ?? {
      calls: 0,
      amount: 0,
      amountUnits: 0
    };
    item.calls += 1;
    item.amount += Number(receipt.amount);
    item.amountUnits += Number(receipt.amountUnits);
    summary[receipt.providerId] = item;
  }
  return summary;
}
