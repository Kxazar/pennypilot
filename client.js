const DEFAULT_FACT_TARGET = 6;
const DEFAULT_BUDGET = 0.25;
const ARC_CHAIN_ID = 5042002;
const ARC_CHAIN_HEX = "0x4cef52";
const ARC_EXPLORER = "https://testnet.arcscan.app";
const NATIVE_DECIMALS = 18;
const GATEWAY_DECIMALS = 6;
const NATIVE_USDC_ASSET = "0x0000000000000000000000000000000000000000";
const RAIL_VAULT_TRANSFER = 1n;
const GAS_PRICE_MULTIPLIER = 3n;
const GAS_PRICE_FLOOR = 250_000_000n;
const GAS_LIMIT_BUFFER_BPS = 3500n;
const DEPLOY_CARD_GAS_LIMIT = 6500000n;
const SET_PROVIDERS_GAS_LIMIT = 750000n;
const FUND_ESCROW_GAS_LIMIT = 450000n;
const RECORD_SPEND_GAS_LIMIT = 350000n;
const MAX_BATCH_PROOFS = 60;
const SPEND_CARD_STORAGE_VERSION = "batch-v1";

const SELECTORS = {
  owner: "0x8da5cb5b",
  nextTaskId: "0xfdc3d8d7",
  setProviders: "0x1b98f6ac",
  createStrictPolicyTask: "0xd08bc9e4",
  fundEscrowTask: "0xabccb029",
  recordSpend: "0xdfd02aed",
  approve: "0x095ea7b3",
  allowance: "0xdd62ed3e",
  balanceOf: "0x70a08231",
  gatewayDeposit: "0x47e7ef24"
};

const scenarios = {
  invoice: {
    label: "Nova Freight invoice",
    startingConfidence: 54,
    startingRisk: 48,
    order: ["invoice", "kyb", "sanctions", "identity", "risk", "fx"],
    purposes: [
      "invoice duplicate check",
      "vendor KYB refresh",
      "sanctions screen",
      "bank account match",
      "fraud anomaly score",
      "FX route check"
    ],
    approved: "Approve with audit note",
    review: "Hold for review"
  },
  merchant: {
    label: "Merchant onboarding",
    startingConfidence: 50,
    startingRisk: 54,
    order: ["kyb", "risk", "identity", "sanctions", "invoice", "fx"],
    purposes: [
      "beneficial owner match",
      "card testing pattern",
      "account owner match",
      "sanctions screen",
      "website evidence",
      "settlement fee check"
    ],
    approved: "Approve with velocity cap",
    review: "Request enhanced review"
  },
  treasury: {
    label: "Treasury payout route",
    startingConfidence: 56,
    startingRisk: 46,
    order: ["fx", "sanctions", "risk", "identity", "kyb", "invoice"],
    purposes: [
      "FX quote",
      "sanctions screen",
      "wallet risk",
      "account owner match",
      "counterparty KYB",
      "routing memo parse"
    ],
    approved: "Send through best route",
    review: "Delay route switch"
  }
};

const defaultProviders = [
  { id: "kyb", name: "KybTrail", price: 0.0042, quality: 91 },
  { id: "sanctions", name: "ClearList", price: 0.0035, quality: 94 },
  { id: "invoice", name: "ProofDesk", price: 0.0028, quality: 88 },
  { id: "risk", name: "FraudLens", price: 0.0048, quality: 89 },
  { id: "fx", name: "QuoteMesh", price: 0.0019, quality: 84 },
  { id: "identity", name: "AccountLock", price: 0.0044, quality: 92 }
];

let providers = [...defaultProviders];

const state = {
  running: false,
  receipts: [],
  denied: 0,
  confidence: scenarios.invoice.startingConfidence,
  risk: scenarios.invoice.startingRisk,
  budget: DEFAULT_BUDGET,
  cap: 0.006,
  taskCount: DEFAULT_FACT_TARGET,
  scenarioKey: "invoice",
  walletAddress: null,
  walletBalance: null,
  contractAddress: null,
  ownerAddress: null,
  cardBytecode: null,
  cardDeployTx: null,
  cardSetupTx: null,
  cardProvidersReady: false,
  gateway: null,
  gatewayBalance: null,
  walletTokenBalance: null,
  lastIssue: null,
  proof: null,
  serverTask: null
};

const elements = {
  taskSelect: document.querySelector("#taskSelect"),
  budgetInput: document.querySelector("#budgetInput"),
  capInput: document.querySelector("#capInput"),
  taskCountInput: document.querySelector("#taskCountInput"),
  factIcon: document.querySelector("#factIcon"),
  runButton: document.querySelector("#runButton"),
  runStatus: document.querySelector("#runStatus"),
  resetButton: document.querySelector("#resetButton"),
  exportButton: document.querySelector("#exportButton"),
  walletButton: document.querySelector("#walletButton"),
  networkStatusLabel: document.querySelector("#networkStatusLabel"),
  remainingValue: document.querySelector("#remainingValue"),
  spentValue: document.querySelector("#spentValue"),
  callValue: document.querySelector("#callValue"),
  avgAction: document.querySelector("#avgAction"),
  apiStatus: document.querySelector("#apiStatus"),
  taskIdValue: document.querySelector("#taskIdValue"),
  providerSigValue: document.querySelector("#providerSigValue"),
  proofStatus: document.querySelector("#proofStatus"),
  proofContractLink: document.querySelector("#proofContractLink"),
  proofTaskLink: document.querySelector("#proofTaskLink"),
  proofAnchorLink: document.querySelector("#proofAnchorLink"),
  proofReceiptHash: document.querySelector("#proofReceiptHash"),
  memoTitle: document.querySelector("#memoTitle"),
  memoBody: document.querySelector("#memoBody"),
  decisionBadge: document.querySelector("#decisionBadge"),
  receiptBody: document.querySelector("#receiptBody")
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4
});

function money(value) {
  return currency.format(Math.max(0, Number(value) || 0));
}

function getScenario() {
  return scenarios[state.scenarioKey];
}

function totalSpent() {
  return state.receipts.reduce((sum, receipt) => sum + receipt.cost, 0);
}

function getProvider(providerId) {
  return providers.find((provider) => provider.id === providerId) ?? providers[0];
}

function chooseProvider(index) {
  return getProvider(getScenario().order[index % getScenario().order.length]);
}

function seededNoise(index, salt) {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function quotedAmount(provider, index) {
  const jitter = seededNoise(index + 1, Number(provider.price) * 10000) * 0.00038;
  return Number((Number(provider.price) + jitter).toFixed(6));
}

async function runReview() {
  if (state.running) {
    return;
  }

  resetState(false);
  state.running = true;
  elements.runButton.disabled = true;
  elements.runButton.textContent = "Confirm in wallet";
  render();

  try {
    await ensureWallet();
    await ensureArcNetwork();
    await ensureSpendCard();
    await ensureGatewayDeposit();

    const budgetUnits = parseUnits(state.budget, GATEWAY_DECIMALS);
    const maxPerCallUnits = parseUnits(state.cap, GATEWAY_DECIMALS);
    const taskId = await readNextTaskId();
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
    const purposeHash = await bytes32Hash(`${state.scenarioKey}:${state.walletAddress}:${Date.now()}`);

    setMemo("Create policy", `Confirm a ${money(state.budget)} policy for the Circle Gateway review. The budget is a cap, not an escrow transfer.`);
    const createTx = await sendTransaction({
      to: state.contractAddress,
      gas: toHex(FUND_ESCROW_GAS_LIMIT),
      data: encodeCreateStrictPolicyTask(state.gateway.relayAgentAddress, budgetUnits, maxPerCallUnits, expiresAt, purposeHash)
    });
    await waitForReceipt(createTx);
    state.serverTask = {
      id: Number(taskId),
      settlementMode: "circle-gateway-x402",
      onchain: {
        taskId: taskId.toString(),
        createTx,
        createExplorerUrl: txUrl(createTx),
        contractAddress: state.contractAddress,
        relayAgentAddress: state.gateway.relayAgentAddress
      },
      gateway: {
        network: state.gateway.network,
        asset: state.gateway.asset,
        gatewayWallet: state.gateway.gatewayWallet
      }
    };
    setMemo("Policy live", `Task #${taskId.toString()} is live. The selected facts will share one Circle Gateway batch payment and one Arc receipt anchor.`);
    render();

    const receipts = await buyGatewayFactBatch(taskId);
    for (const receipt of receipts) {
      applyReceipt(receipt);
      render();
    }

    finalizeMemo();
  } catch (error) {
    const issue = normalizeRunError(error);
    setRunIssue(issue.title, issue.body, issue.status);
  } finally {
    state.running = false;
    elements.runButton.disabled = false;
    elements.runButton.textContent = "Run review";
    await refreshWalletBalance();
    render();
  }
}

async function recordWalletSpend(taskId, index) {
  const scenario = getScenario();
  const provider = chooseProvider(index);
  if (!provider.address) {
    throw new Error(`${provider.name} has no on-chain provider address.`);
  }
  const purpose = scenario.purposes[index % scenario.purposes.length];
  const cost = quotedAmount(provider, index);
  if (cost > state.cap) {
    state.denied += 1;
    throw new Error(`${provider.name} quote exceeds max per fact.`);
  }
  const projected = totalSpent() + cost;
  if (projected > state.budget) {
    state.denied += 1;
    throw new Error(`${provider.name} would exceed the escrow budget.`);
  }

  const amountUnits = parseUnits(cost, NATIVE_DECIMALS);
  const requestHash = await bytes32Hash(JSON.stringify({
    taskId: taskId.toString(),
    provider: provider.id,
    index,
    purpose,
    amount: cost
  }));
  const receiptHash = await bytes32Hash(JSON.stringify({
    taskId: taskId.toString(),
    provider: provider.id,
    index,
    requestHash,
    settledAt: Date.now()
  }));

  elements.runButton.textContent = `Confirm ${index + 1} / ${state.taskCount}`;
  setMemo("Record spend", `Confirm ${provider.name} for ${money(cost)}. This transfers USDC from escrow to the provider on-chain.`);
  const tx = await sendTransaction({
    to: state.contractAddress,
    gas: toHex(RECORD_SPEND_GAS_LIMIT),
    data: encodeRecordSpend(taskId, provider.address, amountUnits, RAIL_VAULT_TRANSFER, requestHash, receiptHash)
  });
  await waitForReceipt(tx);

  const qualityLift = Number((6 + provider.quality / 16 + seededNoise(index, 4) * 3).toFixed(2));
  const riskDrop = Number(((provider.id === "risk" || provider.id === "sanctions" ? 4.8 : 2.4) + seededNoise(index, 6)).toFixed(2));

  return {
    id: tx,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    provider,
    purpose,
    cost,
    qualityLift,
    riskDrop,
    latency: 0,
    receipt: receiptHash,
    requestHash,
    providerAddress: provider.address,
    settlement: "arc-wallet-escrow",
    network: "arc-testnet",
    onchain: {
      transactionHash: tx,
      explorerUrl: txUrl(tx),
      contractAddress: state.contractAddress
    },
    fact: {
      verdict: provider.quality > 90 ? "clear" : "usable",
      evidence: `${purpose} recorded on-chain by ${provider.name}`
    }
  };
}

async function buyGatewayFact(taskId, index) {
  const scenario = getScenario();
  const provider = chooseProvider(index);
  const purpose = scenario.purposes[index % scenario.purposes.length];
  const cost = quotedAmount(provider, index);
  if (cost > state.cap) {
    state.denied += 1;
    throw new Error(`${provider.name} quote exceeds max per fact.`);
  }
  if (totalSpent() + cost > state.budget) {
    state.denied += 1;
    throw new Error(`${provider.name} would exceed the policy budget.`);
  }

  elements.runButton.textContent = `Sign ${index + 1} / ${state.taskCount}`;
  setMemo("Circle Gateway payment", `Sign a gasless x402 payment for ${provider.name}: ${money(cost)}.`);
  const challenge = await postProviderFact(provider.id, taskId, index, purpose);
  if (challenge.response.status !== 402) {
    throw new Error(challenge.body.message || challenge.body.error || "Provider did not return an x402 payment challenge.");
  }
  const requiredHeader = challenge.response.headers.get("PAYMENT-REQUIRED");
  if (!requiredHeader) {
    throw new Error("Provider did not return PAYMENT-REQUIRED.");
  }
  const paymentRequired = decodeBase64Json(requiredHeader);
  const paymentPayload = await createGatewayPaymentPayload(paymentRequired);
  const paymentSignature = encodeBase64Json(paymentPayload);

  elements.runButton.textContent = `Settle ${index + 1} / ${state.taskCount}`;
  setMemo("Settle x402", `Circle Gateway is settling ${provider.name}, then PennyPilot anchors the receipt on Arc.`);
  const paid = await postProviderFact(provider.id, taskId, index, purpose, {
    "PAYMENT-SIGNATURE": paymentSignature
  });
  if (!paid.response.ok) {
    throw new Error(paid.body.message || paid.body.error || "Circle Gateway payment failed.");
  }

  const receipt = paid.body.receipt;
  const fact = paid.body.fact;
  return {
    id: receipt.id,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    provider,
    purpose,
    cost: Number(receipt.amount ?? cost),
    qualityLift: Number(fact.qualityLift ?? 0),
    riskDrop: Number(fact.riskDrop ?? 0),
    latency: Number(fact.latency ?? 0),
    receipt: receipt.receiptHash,
    requestHash: receipt.requestHash,
    providerAddress: receipt.providerAddress,
    settlement: receipt.settlement,
    network: receipt.network,
    paymentTransaction: receipt.paymentTransaction,
    paymentSigner: receipt.paymentSigner,
    onchain: receipt.onchain,
    fact
  };
}

async function buyGatewayFactBatch(taskId) {
  const items = buildGatewayBatchItems();
  const totalCost = items.reduce((sum, item) => sum + item.cost, 0);

  elements.runButton.textContent = "Sign batch";
  setMemo("Circle Gateway batch", `Sign one gasless x402 payment for ${items.length} paid facts: ${money(totalCost)} total.`);
  const challenge = await postGatewayBatchFacts(taskId, items);
  if (challenge.response.status !== 402) {
    throw new Error(challenge.body.message || challenge.body.error || "Provider batch did not return an x402 payment challenge.");
  }
  const requiredHeader = challenge.response.headers.get("PAYMENT-REQUIRED");
  if (!requiredHeader) {
    throw new Error("Provider batch did not return PAYMENT-REQUIRED.");
  }
  const paymentRequired = decodeBase64Json(requiredHeader);
  const paymentPayload = await createGatewayPaymentPayload(paymentRequired);
  const paymentSignature = encodeBase64Json(paymentPayload);

  elements.runButton.textContent = "Settle batch";
  setMemo("Settle batch", `Circle Gateway is settling ${items.length} facts with one payment, then PennyPilot anchors the receipt batch on Arc.`);
  const paid = await postGatewayBatchFacts(taskId, items, {
    "PAYMENT-SIGNATURE": paymentSignature
  });
  if (!paid.response.ok) {
    throw new Error(paid.body.message || paid.body.error || "Circle Gateway batch payment failed.");
  }

  return (paid.body.receipts ?? []).map((receipt, index) => {
    const fact = paid.body.facts?.[index] ?? {};
    const provider = getProvider(receipt.providerId ?? items[index]?.providerId);
    return {
      id: receipt.id,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      provider,
      purpose: items[index]?.purpose ?? fact.purpose,
      cost: Number(receipt.amount ?? items[index]?.cost ?? 0),
      qualityLift: Number(fact.qualityLift ?? 0),
      riskDrop: Number(fact.riskDrop ?? 0),
      latency: Number(fact.latency ?? 0),
      receipt: receipt.receiptHash,
      requestHash: receipt.requestHash,
      providerAddress: receipt.providerAddress,
      settlement: receipt.settlement,
      network: receipt.network,
      paymentTransaction: receipt.paymentTransaction,
      paymentSigner: receipt.paymentSigner,
      paymentBatch: receipt.paymentBatch,
      onchain: receipt.onchain,
      fact
    };
  });
}

function buildGatewayBatchItems() {
  const scenario = getScenario();
  let runningTotal = totalSpent();
  return Array.from({ length: state.taskCount }, (_, index) => {
    const provider = chooseProvider(index);
    const purpose = scenario.purposes[index % scenario.purposes.length];
    const cost = quotedAmount(provider, index);
    if (cost > state.cap) {
      state.denied += 1;
      throw new Error(`${provider.name} quote exceeds max per fact.`);
    }
    runningTotal += cost;
    if (runningTotal > state.budget) {
      state.denied += 1;
      throw new Error(`${provider.name} would exceed the policy budget.`);
    }
    return {
      providerId: provider.id,
      index,
      purpose,
      cost
    };
  });
}

async function postGatewayBatchFacts(taskId, items, extraHeaders = {}) {
  const response = await fetch("/api/gateway/batch-facts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...extraHeaders
    },
    body: JSON.stringify({
      contractAddress: state.contractAddress,
      taskId: taskId.toString(),
      buyerAddress: state.walletAddress,
      scenarioKey: state.scenarioKey,
      items
    })
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function postProviderFact(providerId, taskId, index, purpose, extraHeaders = {}) {
  const response = await fetch(`/api/providers/${providerId}/facts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...extraHeaders
    },
    body: JSON.stringify({
      contractAddress: state.contractAddress,
      taskId: taskId.toString(),
      buyerAddress: state.walletAddress,
      scenarioKey: state.scenarioKey,
      index,
      purpose
    })
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function applyReceipt(receipt) {
  state.receipts.unshift(receipt);
  state.confidence = Math.min(96, state.confidence + receipt.qualityLift);
  state.risk = Math.max(9, state.risk - receipt.riskDrop);
}

async function ensureWallet() {
  if (!window.ethereum) {
    throw userError(
      "Wallet required",
      "Open this page in MetaMask, Rabby, or a browser where your wallet extension is installed. The in-app browser usually cannot sign transactions.",
      "Wallet missing"
    );
  }
  if (!state.walletAddress) {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    state.walletAddress = accounts[0];
    restoreWalletCard();
  }
  await refreshWalletBalance();
}

async function connectWallet() {
  try {
    await ensureWallet();
    await ensureArcNetwork();
    await refreshGatewayBalances();
    clearRunIssue();
    restoreWalletCard();
    if (state.contractAddress) {
      state.ownerAddress = await readOwner().catch(() => null);
    }
    if (state.contractAddress && state.ownerAddress?.toLowerCase() === state.walletAddress.toLowerCase()) {
      setMemo("Wallet card ready", `${shortAddress(state.walletAddress)} will spend through ${shortAddress(state.contractAddress)}.`);
    } else {
      forgetWalletCard();
      setMemo("Wallet connected", `${shortAddress(state.walletAddress)} can create its own spend card. Run review will deploy it from this wallet.`);
    }
  } catch (error) {
    const issue = normalizeRunError(error);
    setRunIssue(issue.title, issue.body, issue.status);
  }
  render();
}

async function ensureSpendCard() {
  restoreWalletCard();
  if (state.contractAddress) {
    state.ownerAddress = await readOwner().catch(() => null);
    if (state.ownerAddress?.toLowerCase() === state.walletAddress.toLowerCase()) {
      if (!state.cardProvidersReady) {
        await configureSpendCardProviders();
      }
      return;
    }
    forgetWalletCard();
  }

  try {
    await createSponsoredSpendCard();
  } catch (error) {
    if (error?.fallbackToWalletDeploy) {
      await deploySpendCard();
      await configureSpendCardProviders();
      return;
    }
    throw error;
  }
}

async function createSponsoredSpendCard() {
  elements.runButton.textContent = "Create card";
  setMemo("Create spend card", "Creating a unique on-chain spend card for this wallet. The app sponsors this one-time deploy, then transfers ownership to you.");
  render();

  const response = await fetch("/api/cards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ownerAddress: state.walletAddress })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.message || "Could not create a sponsored spend card.";
    const error = userError("Card creation failed", message, payload.error || "Card failed");
    error.fallbackToWalletDeploy = response.status === 503;
    throw error;
  }

  state.contractAddress = payload.contractAddress;
  state.ownerAddress = payload.owner;
  state.cardDeployTx = payload.deployTx;
  state.cardSetupTx = payload.setupTx;
  state.cardProvidersReady = Boolean(payload.providersReady);
  saveWalletCard();
  setMemo("Spend card ready", `${shortAddress(state.contractAddress)} is owned by ${shortAddress(state.walletAddress)}. Now PennyPilot will prepare the Gateway balance and policy task.`);
  render();
}

async function deploySpendCard() {
  if (!state.cardBytecode || state.cardBytecode === "0x") {
    throw userError(
      "Contract artifact missing",
      "The local server did not provide deploy bytecode for a user-owned spend card.",
      "Config missing"
    );
  }

  elements.runButton.textContent = "Deploy card";
  setMemo("Create spend card", "Confirm a one-time deployment. This creates a unique spend card owned by your connected wallet.");
  render();

  const data = encodeDeploySpendCard(NATIVE_USDC_ASSET);
  const deployTx = await sendTransaction({
    data,
    gas: toHex(DEPLOY_CARD_GAS_LIMIT)
  });
  const receipt = await waitForReceipt(deployTx);
  if (!receipt.contractAddress) {
    throw new Error("Deploy transaction was mined, but no contract address was returned.");
  }

  state.contractAddress = receipt.contractAddress;
  state.ownerAddress = state.walletAddress;
  state.cardDeployTx = deployTx;
  state.cardProvidersReady = false;
  saveWalletCard();
  setMemo("Spend card deployed", `Created ${shortAddress(state.contractAddress)}. Next, approve the fact providers for this card.`);
  render();
}

async function configureSpendCardProviders() {
  const providerAddresses = providers
    .map((provider) => provider.address)
    .filter(Boolean);
  if (providerAddresses.length === 0) {
    throw userError("Provider config missing", "The local server did not return provider addresses.", "Config missing");
  }

  elements.runButton.textContent = "Set providers";
  setMemo("Allow providers", "Confirm one setup transaction so this card can pay the selected fact providers.");
  render();

  const setupTx = await sendTransaction({
    to: state.contractAddress,
    gas: toHex(SET_PROVIDERS_GAS_LIMIT),
    data: encodeSetProviders(providerAddresses)
  });
  await waitForReceipt(setupTx);
  state.cardSetupTx = setupTx;
  state.cardProvidersReady = true;
  saveWalletCard();
  setMemo("Spend card ready", `${shortAddress(state.contractAddress)} is owned by ${shortAddress(state.walletAddress)} and ready for Gateway policy spending.`);
  render();
}

async function ensureGatewayDeposit() {
  if (!state.gateway?.asset || !state.gateway?.gatewayWallet || !state.gateway?.relayAgentAddress) {
    throw userError(
      "Gateway unavailable",
      "The app config does not include Circle Gateway settings or the Arc receipt relayer.",
      "Gateway missing"
    );
  }
  const budgetUnits = parseUnits(state.budget, GATEWAY_DECIMALS);
  await refreshGatewayBalances();
  const available = state.gatewayBalance ?? 0n;
  if (available >= budgetUnits) {
    return;
  }
  const shortfall = budgetUnits - available;
  if ((state.walletTokenBalance ?? 0n) < shortfall) {
    throw userError(
      "Gateway needs USDC",
      `Your wallet needs ${formatUnits(shortfall, GATEWAY_DECIMALS)} USDC on Arc Testnet to top up Circle Gateway before the review.`,
      "Need USDC"
    );
  }

  const allowance = await readErc20Allowance(state.gateway.asset, state.walletAddress, state.gateway.gatewayWallet);
  if (allowance < shortfall) {
    elements.runButton.textContent = "Approve USDC";
    setMemo("Approve Gateway", `Approve ${formatUnits(shortfall, GATEWAY_DECIMALS)} USDC for the Circle Gateway wallet.`);
    const approveTx = await sendTransaction({
      to: state.gateway.asset,
      gas: toHex(120000n),
      data: encodeApprove(state.gateway.gatewayWallet, shortfall)
    });
    await waitForReceipt(approveTx);
  }

  elements.runButton.textContent = "Deposit Gateway";
  setMemo("Fund Gateway", `Deposit ${formatUnits(shortfall, GATEWAY_DECIMALS)} USDC into Circle Gateway for gasless x402 payments.`);
  const depositTx = await sendTransaction({
    to: state.gateway.gatewayWallet,
    gas: toHex(160000n),
    data: encodeGatewayDeposit(state.gateway.asset, shortfall)
  });
  await waitForReceipt(depositTx);
  await waitForGatewayCredit(budgetUnits);
}

async function refreshGatewayBalances() {
  if (!state.gateway?.asset || !state.walletAddress) {
    return;
  }
  state.walletTokenBalance = await readErc20Balance(state.gateway.asset, state.walletAddress);
  try {
    const response = await fetch(`/api/gateway/balance?address=${encodeURIComponent(state.walletAddress)}`);
    if (!response.ok) {
      throw new Error("Gateway balance unavailable");
    }
    const payload = await response.json();
    state.gatewayBalance = BigInt(payload.availableUnits ?? "0");
  } catch {
    state.gatewayBalance = 0n;
  }
}

async function waitForGatewayCredit(requiredUnits) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await refreshGatewayBalances();
    if ((state.gatewayBalance ?? 0n) >= requiredUnits) {
      return;
    }
    if (attempt === 5) {
      setMemo("Gateway syncing", "The deposit is mined. Waiting for Circle Gateway balance to update before signing paid facts.");
      render();
    }
    await wait(2000);
  }
  throw userError(
    "Gateway balance pending",
    "The deposit transaction was mined, but Circle Gateway has not reported the balance yet. Wait a minute and run the review again.",
    "Gateway pending"
  );
}

async function ensureArcNetwork() {
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId.toLowerCase() === ARC_CHAIN_HEX) {
    return;
  }
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARC_CHAIN_HEX }]
    });
  } catch (error) {
    if (error.code !== 4902) {
      throw error;
    }
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: ARC_CHAIN_HEX,
        chainName: "Arc Testnet",
        nativeCurrency: { name: "USDC", symbol: "USDC", decimals: NATIVE_DECIMALS },
        rpcUrls: ["https://rpc.testnet.arc.network"],
        blockExplorerUrls: [ARC_EXPLORER]
      }]
    });
  }
}

async function refreshWalletBalance() {
  if (!window.ethereum || !state.walletAddress) {
    return;
  }
  const balanceHex = await window.ethereum.request({
    method: "eth_getBalance",
    params: [state.walletAddress, "latest"]
  });
  state.walletBalance = BigInt(balanceHex);
}

async function readOwner() {
  if (!state.contractAddress) {
    return null;
  }
  const result = await ethCall(state.contractAddress, SELECTORS.owner);
  return `0x${result.slice(-40)}`;
}

async function readNextTaskId() {
  const result = await ethCall(state.contractAddress, SELECTORS.nextTaskId);
  return BigInt(result);
}

async function ethCall(to, data) {
  return window.ethereum.request({
    method: "eth_call",
    params: [{ to, data }, "latest"]
  });
}

async function readErc20Balance(token, owner) {
  const result = await ethCall(token, SELECTORS.balanceOf + encodeAddress(owner));
  return BigInt(result);
}

async function readErc20Allowance(token, owner, spender) {
  const result = await ethCall(token, SELECTORS.allowance + encodeAddress(owner) + encodeAddress(spender));
  return BigInt(result);
}

async function sendTransaction(tx) {
  await assertNoPendingWalletTransactions();
  const gasPrice = await boostedGasPriceHex();
  const request = {
    from: state.walletAddress,
    ...tx
  };
  if (gasPrice && !request.gasPrice && !request.maxFeePerGas) {
    request.gasPrice = gasPrice;
  }
  request.gas = await estimatedGasLimitHex(request, tx.gas);
  return window.ethereum.request({
    method: "eth_sendTransaction",
    params: [request]
  });
}

async function estimatedGasLimitHex(request, fallbackGas) {
  const estimateRequest = { ...request };
  delete estimateRequest.gas;
  delete estimateRequest.gasPrice;
  delete estimateRequest.maxFeePerGas;
  delete estimateRequest.maxPriorityFeePerGas;

  try {
    const estimatedHex = await window.ethereum.request({
      method: "eth_estimateGas",
      params: [estimateRequest]
    });
    const estimated = BigInt(estimatedHex);
    const buffered = estimated + ((estimated * GAS_LIMIT_BUFFER_BPS) / 10000n) + 10_000n;
    return toHex(buffered);
  } catch {
    return fallbackGas;
  }
}

async function boostedGasPriceHex() {
  const rawGasPrice = await window.ethereum.request({ method: "eth_gasPrice" });
  const baseGasPrice = BigInt(rawGasPrice);
  const boosted = baseGasPrice * GAS_PRICE_MULTIPLIER;
  return toHex(boosted > GAS_PRICE_FLOOR ? boosted : GAS_PRICE_FLOOR);
}

async function assertNoPendingWalletTransactions() {
  const [latestHex, pendingHex] = await Promise.all([
    window.ethereum.request({
      method: "eth_getTransactionCount",
      params: [state.walletAddress, "latest"]
    }),
    window.ethereum.request({
      method: "eth_getTransactionCount",
      params: [state.walletAddress, "pending"]
    })
  ]);
  const latest = BigInt(latestHex);
  const pending = BigInt(pendingHex);
  if (pending > latest) {
    const count = pending - latest;
    throw userError(
      "Pending wallet transaction",
      `Your wallet already has ${count.toString()} pending transaction${count === 1n ? "" : "s"}. Open the wallet activity tab and Speed Up or Cancel the oldest pending transaction, then retry. New PennyPilot transactions now use boosted gas price.`,
      "Pending tx"
    );
  }
}

async function waitForReceipt(hash) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const receipt = await window.ethereum.request({
      method: "eth_getTransactionReceipt",
      params: [hash]
    });
    if (receipt) {
      if (receipt.status && receipt.status !== "0x1") {
        throw userError("Transaction reverted", `Transaction reverted: ${hash}. Explorer: ${txUrl(hash)}`, "Reverted");
      }
      return receipt;
    }
    if (attempt === 24) {
      setMemo("Still pending", `Waiting for ${shortHash(hash)}. If this stays pending in the wallet, use Speed Up or Cancel there before starting another run.`);
      render();
    }
    await wait(1500);
  }
  throw userError(
    "Transaction still pending",
    `Transaction ${hash} was submitted but not confirmed yet. Speed Up or Cancel it in the wallet before retrying.`,
    "Pending tx"
  );
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function encodeDeploySpendCard(asset) {
  return `${state.cardBytecode}${encodeAddress(asset)}`;
}

function encodeSetProviders(providerAddresses) {
  return SELECTORS.setProviders
    + encodeUint(32n)
    + encodeUint(BigInt(providerAddresses.length))
    + providerAddresses.map(encodeAddress).join("");
}

function encodeFundEscrowTask(agent, budget, maxPerCall, expiresAt, purposeHash) {
  return SELECTORS.fundEscrowTask
    + encodeAddress(agent)
    + encodeUint(budget)
    + encodeUint(maxPerCall)
    + encodeUint(expiresAt)
    + encodeBytes32(purposeHash);
}

function encodeCreateStrictPolicyTask(agent, budget, maxPerCall, expiresAt, purposeHash) {
  return SELECTORS.createStrictPolicyTask
    + encodeAddress(agent)
    + encodeUint(budget)
    + encodeUint(maxPerCall)
    + encodeUint(expiresAt)
    + encodeBytes32(purposeHash);
}

function encodeRecordSpend(taskId, provider, amount, rail, requestHash, receiptHash) {
  return SELECTORS.recordSpend
    + encodeUint(taskId)
    + encodeAddress(provider)
    + encodeUint(amount)
    + encodeUint(rail)
    + encodeBytes32(requestHash)
    + encodeBytes32(receiptHash);
}

function encodeApprove(spender, amount) {
  return SELECTORS.approve
    + encodeAddress(spender)
    + encodeUint(amount);
}

function encodeGatewayDeposit(token, amount) {
  return SELECTORS.gatewayDeposit
    + encodeAddress(token)
    + encodeUint(amount);
}

function encodeAddress(address) {
  return strip0x(address).toLowerCase().padStart(64, "0");
}

function encodeUint(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function encodeBytes32(value) {
  return strip0x(value).padStart(64, "0");
}

function strip0x(value) {
  return String(value).startsWith("0x") ? String(value).slice(2) : String(value);
}

function toHex(value) {
  return `0x${BigInt(value).toString(16)}`;
}

async function bytes32Hash(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `0x${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function createGatewayPaymentPayload(paymentRequired) {
  const requirement = selectGatewayRequirement(paymentRequired);
  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: state.walletAddress,
    to: requirement.payTo,
    value: String(requirement.amount),
    validAfter: String(now - 600),
    validBefore: String(now + Number(requirement.maxTimeoutSeconds ?? 600)),
    nonce: randomBytes32()
  };
  const signature = await window.ethereum.request({
    method: "eth_signTypedData_v4",
    params: [
      state.walletAddress,
      JSON.stringify({
        domain: {
          name: "GatewayWalletBatched",
          version: "1",
          chainId: ARC_CHAIN_ID,
          verifyingContract: requirement.extra.verifyingContract
        },
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" }
          ],
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" }
          ]
        },
        primaryType: "TransferWithAuthorization",
        message: authorization
      })
    ]
  });
  return {
    x402Version: paymentRequired.x402Version ?? 2,
    resource: paymentRequired.resource,
    accepted: requirement,
    payload: {
      authorization,
      signature
    },
    extensions: paymentRequired.extensions ?? undefined
  };
}

function selectGatewayRequirement(paymentRequired) {
  const requirement = (paymentRequired.accepts ?? []).find((item) => (
    item.scheme === "exact" &&
    item.network === state.gateway.network &&
    item.asset?.toLowerCase() === state.gateway.asset.toLowerCase() &&
    item.extra?.name === "GatewayWalletBatched" &&
    item.extra?.version === "1" &&
    isAddressLike(item.extra?.verifyingContract)
  ));
  if (!requirement) {
    throw new Error("Provider did not offer a Circle Gateway x402 payment option for Arc Testnet.");
  }
  return requirement;
}

function randomBytes32() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function encodeBase64Json(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64Json(value) {
  const binary = atob(String(value));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function parseUnits(value, decimals) {
  const [wholeRaw, fractionRaw = ""] = String(value).trim().split(".");
  const whole = wholeRaw || "0";
  const fraction = fractionRaw.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction || "0");
}

function formatUnits(value, decimals) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, "0").slice(0, 4);
  return `${whole.toString()}.${fraction}`;
}

function resetState(syncInputs = true) {
  state.receipts = [];
  state.denied = 0;
  clearRunIssue();
  state.serverTask = null;
  state.scenarioKey = elements.taskSelect.value;
  state.budget = parsePositiveNumber(elements.budgetInput.value, DEFAULT_BUDGET);
  state.cap = parsePositiveNumber(elements.capInput.value, 0.006);
  state.taskCount = Math.min(
    MAX_BATCH_PROOFS,
    Math.max(1, Math.floor(parsePositiveNumber(elements.taskCountInput.value, DEFAULT_FACT_TARGET)))
  );
  if (Number(elements.taskCountInput.value) !== state.taskCount) {
    elements.taskCountInput.value = state.taskCount;
  }
  state.confidence = getScenario().startingConfidence;
  state.risk = getScenario().startingRisk;
  if (syncInputs) {
    setMemo("Ready for Gateway review", "Connect your wallet, set a USDC budget, and buy paid facts through Circle Gateway.");
  }
  render();
}

function setMemo(title, body) {
  elements.memoTitle.textContent = title;
  elements.memoBody.textContent = body;
}

function setRunIssue(title, body, status = title) {
  state.lastIssue = { title, body, status };
  setMemo(title, body);
}

function clearRunIssue() {
  state.lastIssue = null;
  if (elements.runStatus) {
    elements.runStatus.hidden = true;
    elements.runStatus.textContent = "";
  }
}

function userError(title, body, status = title) {
  const error = new Error(body);
  error.userTitle = title;
  error.userStatus = status;
  return error;
}

function normalizeRunError(error) {
  const message = String(error?.message || "Wallet transaction failed.");
  if (error?.userTitle) {
    return {
      title: error.userTitle,
      body: message,
      status: error.userStatus || error.userTitle
    };
  }
  if (error?.code === 4001 || /reject|denied|cancel/i.test(message)) {
    return {
      title: "Confirmation cancelled",
      body: "The wallet confirmation was rejected, so nothing was sent on-chain.",
      status: "Rejected"
    };
  }
  if (/insufficient funds|exceeds balance/i.test(message)) {
    return {
      title: "Not enough USDC",
      body: "The connected wallet does not have enough Arc Testnet USDC for the budget plus gas.",
      status: "Low balance"
    };
  }
  if (/revert|execution reverted/i.test(message)) {
    return {
      title: "Contract rejected the transaction",
      body: message,
      status: "Reverted"
    };
  }
  return {
    title: "On-chain review stopped",
    body: message,
    status: "Stopped"
  };
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function finalizeMemo() {
  const scenario = getScenario();
  const spent = totalSpent();
  const calls = state.receipts.length;
  const approved = state.denied === 0 && calls >= Math.min(4, state.taskCount) && state.risk < 40;
  const decision = approved ? scenario.approved : scenario.review;
  setMemo(
    decision,
    `${calls} paid facts settled for ${money(spent)} through Circle Gateway and anchored on Arc.`
  );
}

function renderReceipts() {
  if (state.receipts.length === 0) {
    elements.receiptBody.innerHTML = '<div class="empty-state">No on-chain spends yet.</div>';
    return;
  }

  elements.receiptBody.innerHTML = state.receipts.map((receipt) => `
    <a class="receipt-item" href="${receipt.onchain.explorerUrl}" target="_blank" rel="noreferrer">
      <div class="receipt-main">
        <strong>${receipt.provider.name}</strong>
        <span>${receipt.purpose} / on-chain</span>
      </div>
      <div class="receipt-cost">
        <strong>${money(receipt.cost)}</strong>
        <span class="hash" title="${receipt.onchain.transactionHash}">${shortHash(receipt.onchain.transactionHash)}</span>
      </div>
    </a>
  `).join("");
}

function renderProof() {
  const proof = state.proof ?? {};
  const latestReceipt = state.receipts[0];
  const task = state.serverTask?.onchain ?? (state.contractAddress ? null : proof.task);
  const anchor = latestReceipt?.onchain
    ? {
        explorerUrl: latestReceipt.onchain.explorerUrl,
        transactionHash: latestReceipt.onchain.transactionHash,
        receiptHash: latestReceipt.receipt
      }
    : state.contractAddress ? null : proof.anchor;
  const proofReady = Boolean(state.contractAddress && task && anchor);

  elements.proofStatus.textContent = state.contractAddress ? (proofReady ? "Live" : "Card ready") : "Needs card";

  setProofLink(
    elements.proofContractLink,
    state.contractAddress ? addressUrl(state.contractAddress) : proof.deployment?.explorerUrl,
    state.contractAddress ? shortAddress(state.contractAddress) : "not deployed"
  );
  setProofLink(
    elements.proofTaskLink,
    task?.createExplorerUrl ?? task?.explorerUrl,
    task?.taskId ? `Task #${task.taskId}` : "not created"
  );
  setProofLink(
    elements.proofAnchorLink,
    anchor?.explorerUrl,
    anchor?.transactionHash ? shortHash(anchor.transactionHash) : "not anchored"
  );

  elements.proofReceiptHash.textContent = anchor?.receiptHash ? shortHash(anchor.receiptHash) : "waiting";
  elements.proofReceiptHash.title = anchor?.receiptHash ?? "";
}

function setProofLink(element, href, strongText) {
  element.classList.toggle("is-disabled", !href);
  if (href) {
    element.href = href;
  } else {
    element.removeAttribute("href");
  }
  element.querySelector("strong").textContent = strongText;
}

function renderMetrics() {
  const spent = totalSpent();
  const calls = state.receipts.length;
  const remaining = Math.max(0, state.budget - spent);
  const avg = calls ? spent / calls : 0;
  const approved = calls >= state.taskCount && state.denied === 0 && state.risk < 40;

  elements.remainingValue.textContent = `${money(remaining)} left`;
  elements.spentValue.textContent = `${money(spent)} spent`;
  elements.callValue.textContent = `${calls} / ${state.taskCount} facts`;
  elements.factIcon.textContent = state.taskCount;
  elements.avgAction.textContent = `${money(avg)} avg`;
  elements.apiStatus.textContent = state.lastIssue?.status ?? (
    state.walletAddress
      ? state.contractAddress ? "Gateway x402" : "Card needed"
      : "Wallet required"
  );
  elements.taskIdValue.textContent = state.serverTask
    ? `Task #${state.serverTask.id}`
    : state.contractAddress ? shortAddress(state.contractAddress) : "No card";
  elements.providerSigValue.textContent = state.receipts[0]?.onchain ? "Receipt anchored" : "No receipt";
  elements.networkStatusLabel.textContent = state.walletAddress
    ? walletStatusText()
    : "Connect wallet";
  if (elements.runStatus) {
    elements.runStatus.hidden = !state.lastIssue;
    elements.runStatus.textContent = state.lastIssue?.body ?? "";
  }

  if (state.running) {
    elements.decisionBadge.textContent = "Confirming";
    elements.decisionBadge.className = "";
  } else if (state.lastIssue) {
    elements.decisionBadge.textContent = "Needs attention";
    elements.decisionBadge.className = "status-warn";
  } else if (calls >= state.taskCount) {
    elements.decisionBadge.textContent = approved ? "Approved" : "Review";
    elements.decisionBadge.className = approved ? "status-ok" : "status-warn";
  } else {
    elements.decisionBadge.textContent = state.denied ? `${state.denied} blocked` : "Idle";
    elements.decisionBadge.className = state.denied ? "status-warn" : "";
  }
}

function render() {
  renderProof();
  renderMetrics();
  renderReceipts();
}

function walletStatusText() {
  const gasBalance = state.walletBalance === null
    ? "..."
    : `${formatUnits(state.walletBalance, NATIVE_DECIMALS)} gas`;
  const gatewayBalance = state.gatewayBalance === null
    ? null
    : `${formatUnits(state.gatewayBalance, GATEWAY_DECIMALS)} Gateway`;
  return [shortAddress(state.walletAddress), gasBalance, gatewayBalance].filter(Boolean).join(" / ");
}

function shortAddress(address) {
  if (!address || address.length < 12) {
    return address || "not connected";
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash) {
  if (!hash || hash.length < 18) {
    return hash || "pending";
  }
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function txUrl(hash) {
  return `${ARC_EXPLORER}/tx/${hash}`;
}

function addressUrl(address) {
  return `${ARC_EXPLORER}/address/${address}`;
}

function cardStorageKey() {
  return state.walletAddress
    ? `pennypilot:spend-card:${SPEND_CARD_STORAGE_VERSION}:${ARC_CHAIN_ID}:${state.walletAddress.toLowerCase()}`
    : null;
}

function restoreWalletCard() {
  const key = cardStorageKey();
  if (!key) {
    state.contractAddress = null;
    state.ownerAddress = null;
    state.cardDeployTx = null;
    state.cardSetupTx = null;
    state.cardProvidersReady = false;
    return;
  }
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    state.contractAddress = null;
    state.ownerAddress = null;
    state.cardDeployTx = null;
    state.cardSetupTx = null;
    state.cardProvidersReady = false;
    return;
  }
  try {
    const saved = raw.startsWith("{") ? JSON.parse(raw) : { address: raw };
    if (!isAddressLike(saved.address)) {
      throw new Error("invalid saved card");
    }
    state.contractAddress = saved.address;
    state.cardDeployTx = saved.deployTx ?? null;
    state.cardSetupTx = saved.setupTx ?? null;
    state.cardProvidersReady = Boolean(saved.providersReady);
  } catch {
    window.localStorage.removeItem(key);
    state.contractAddress = null;
    state.ownerAddress = null;
    state.cardDeployTx = null;
    state.cardSetupTx = null;
    state.cardProvidersReady = false;
  }
}

function saveWalletCard() {
  const key = cardStorageKey();
  if (!key || !state.contractAddress) {
    return;
  }
  window.localStorage.setItem(key, JSON.stringify({
    address: state.contractAddress,
    deployTx: state.cardDeployTx,
    setupTx: state.cardSetupTx,
    providersReady: state.cardProvidersReady
  }));
}

function forgetWalletCard() {
  const key = cardStorageKey();
  if (key) {
    window.localStorage.removeItem(key);
  }
  state.contractAddress = null;
  state.ownerAddress = null;
  state.cardDeployTx = null;
  state.cardSetupTx = null;
  state.cardProvidersReady = false;
}

function isAddressLike(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value));
}

async function loadConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error("config unavailable");
    }
    const config = await response.json();
    providers = (config.providers ?? providers).map((provider) => ({
      ...provider,
      price: Number(provider.price ?? provider.priceUsd ?? 0)
    }));
    state.proof = config.proof ?? null;
    state.cardBytecode = config.contract?.bytecode ?? null;
    state.gateway = config.x402 ?? null;
    restoreWalletCard();
  } catch {
    setMemo("Config unavailable", "Start the local server before using wallet escrow.");
  }
}

function exportJson() {
  const payload = {
    app: "PennyPilot",
    scenario: getScenario().label,
    wallet: state.walletAddress,
    contract: state.contractAddress,
    gateway: state.gateway,
    policy: {
      budget: state.budget,
      maxPerFact: state.cap,
      facts: state.taskCount
    },
    task: state.serverTask,
    result: {
      spent: totalSpent(),
      denied: state.denied,
      confidence: state.confidence,
      risk: state.risk
    },
    receipts: state.receipts.map((receipt) => ({
      time: receipt.time,
      provider: receipt.provider.name,
      providerAddress: receipt.providerAddress,
      purpose: receipt.purpose,
      cost: receipt.cost,
      receipt: receipt.receipt,
      requestHash: receipt.requestHash,
      settlement: receipt.settlement,
      network: receipt.network,
      paymentTransaction: receipt.paymentTransaction,
      paymentSigner: receipt.paymentSigner,
      onchain: receipt.onchain,
      fact: receipt.fact
    }))
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pennypilot-wallet-report.json";
  link.click();
  URL.revokeObjectURL(url);
}

elements.walletButton.addEventListener("click", connectWallet);
elements.runButton.addEventListener("click", runReview);
elements.resetButton.addEventListener("click", () => resetState(true));
elements.exportButton.addEventListener("click", exportJson);
elements.taskSelect.addEventListener("change", () => resetState(true));
elements.budgetInput.addEventListener("change", () => resetState(true));
elements.capInput.addEventListener("change", () => resetState(true));
elements.taskCountInput.addEventListener("change", () => resetState(true));

if (window.ethereum) {
  window.ethereum.on?.("accountsChanged", (accounts) => {
    state.walletAddress = accounts[0] ?? null;
    restoreWalletCard();
    Promise.all([refreshWalletBalance(), refreshGatewayBalances()]).finally(render);
  });
  window.ethereum.on?.("chainChanged", () => {
    restoreWalletCard();
    Promise.all([refreshWalletBalance(), refreshGatewayBalances()]).finally(render);
  });
}

await loadConfig();
resetState(true);
if (!window.ethereum) {
  setRunIssue(
    "Wallet required",
    "Open this page in MetaMask, Rabby, or a browser where your wallet extension is installed. The in-app browser usually cannot sign transactions.",
    "Wallet missing"
  );
  render();
}
