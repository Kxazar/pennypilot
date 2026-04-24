import assert from "node:assert/strict";
import { getAddress, isAddress, recoverMessageAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createAppServer } from "../server.mjs";

const server = createAppServer();

await new Promise((resolve) => server.listen(0, resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  const config = await getJson("/api/config");
  assert.equal(config.arc.chainId, 5042002);
  assert.equal(config.actionTarget, 6);
  assert.equal(isAddress(config.contract.address), true);
  assert.ok(config.providers.length >= 6);
  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.ok(page.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"));
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");

  const sourceLeak = await fetch(`${baseUrl}/server.mjs`);
  assert.equal(sourceLeak.status, 404);

  const tooLarge = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(40_000) })
  });
  assert.equal(tooLarge.status, 413);
  assert.equal((await tooLarge.json()).error, "body_too_large");

  const task = await postJson("/api/tasks", {
    scenarioKey: "invoice",
    budgetUsd: 0.25,
    maxPerCallUsd: 0.006,
    fundingMode: "simulated"
  }, 201);
  assert.equal(task.id, 1);
  assert.equal(task.receiptCount, 0);

  const challengeResponse = await fetch(`${baseUrl}/api/providers/sanctions/facts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      taskId: task.id,
      scenarioKey: "invoice",
      index: 0,
      purpose: "sanctions screen"
    })
  });
  assert.equal(challengeResponse.status, 402);
  const challengeBody = await challengeResponse.json();
  assert.equal(challengeBody.x402.protocol, "x402-preview");
  assert.ok(challengeBody.x402.requestHash.startsWith("0x"));

  const payment = Buffer.from(JSON.stringify({
    protocol: "x402-preview",
    challengeId: challengeBody.x402.id,
    taskId: task.id,
    providerId: "sanctions",
    amountUnits: challengeBody.x402.amountUnits,
    requestHash: challengeBody.x402.requestHash,
    signer: "test-agent",
    authorization: "browser-preview-payment-authorization"
  }), "utf8").toString("base64url");

  const paid = await fetch(`${baseUrl}/api/providers/sanctions/facts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-payment": payment
    },
    body: JSON.stringify({
      taskId: task.id,
      scenarioKey: "invoice",
      index: 0,
      purpose: "sanctions screen"
    })
  });
  assert.equal(paid.status, 200);
  const settled = await paid.json();
  assert.equal(settled.receipt.settlement, "x402-preview-provider-signed");
  assert.ok(settled.receipt.providerSignature.startsWith("0x"));
  assert.ok(settled.receipt.contractDigest.startsWith("0x"));
  assert.equal(getAddress(settled.receipt.contractPreview.address), getAddress(config.contract.address));
  const providerSigner = await recoverMessageAddress({
    message: { raw: settled.receipt.receiptStructHash },
    signature: settled.receipt.providerSignature
  });
  assert.equal(getAddress(providerSigner), getAddress(settled.receipt.providerAddress));
  assert.equal(settled.task.receiptCount, 1);

  const replay = await fetch(`${baseUrl}/api/providers/sanctions/facts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-payment": payment
    },
    body: JSON.stringify({
      taskId: task.id,
      scenarioKey: "invoice",
      index: 0,
      purpose: "sanctions screen"
    })
  });
  assert.equal(replay.status, 402);
  assert.equal((await replay.json()).error, "payment_challenge_missing");

  const invalidPreviewTask = await postJson("/api/tasks", {
    scenarioKey: "invoice",
    budgetUsd: 0.25,
    maxPerCallUsd: 0.006,
    fundingMode: "simulated"
  }, 201);
  const invalidPreviewChallenge = await challengeFact(invalidPreviewTask.id, "sanctions", 0, "invalid preview auth");
  const invalidPreview = await payFactExpect(
    invalidPreviewTask.id,
    "sanctions",
    0,
    "invalid preview auth",
    {
      protocol: "x402-preview",
      challengeId: invalidPreviewChallenge.x402.id,
      taskId: invalidPreviewTask.id,
      providerId: "sanctions",
      amountUnits: invalidPreviewChallenge.x402.amountUnits,
      requestHash: invalidPreviewChallenge.x402.requestHash,
      signer: "test-agent",
      authorization: "wrong-token"
    },
    402
  );
  assert.equal(invalidPreview.error, "preview_authorization_missing");
  const validAfterInvalidPreview = await payFact(
    invalidPreviewTask.id,
    "sanctions",
    0,
    "invalid preview auth",
    {
      protocol: "x402-preview",
      challengeId: invalidPreviewChallenge.x402.id,
      taskId: invalidPreviewTask.id,
      providerId: "sanctions",
      amountUnits: invalidPreviewChallenge.x402.amountUnits,
      requestHash: invalidPreviewChallenge.x402.requestHash,
      signer: "test-agent",
      authorization: "browser-preview-payment-authorization"
    }
  );
  assert.equal(validAfterInvalidPreview.task.receiptCount, 1);

  const tinyTask = await postJson("/api/tasks", {
    scenarioKey: "invoice",
    budgetUsd: 0.001,
    maxPerCallUsd: 0.006,
    fundingMode: "simulated"
  }, 400);
  assert.equal(tinyTask.error, "invalid_budget");

  const walletMissing = await postJson("/api/tasks", {
    scenarioKey: "invoice",
    budgetUsd: 0.25,
    maxPerCallUsd: 0.006,
    fundingMode: "testnet"
  }, 400);
  assert.equal(walletMissing.error, "wallet_required");

  const cardsMissingWalletResponse = await fetch(`${baseUrl}/api/cards`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  const cardsMissingWallet = await cardsMissingWalletResponse.json();
  assert.notEqual(cardsMissingWalletResponse.status, 500);
  if (config.cards.sponsoredCreation) {
    assert.equal(cardsMissingWalletResponse.status, 400);
    assert.equal(cardsMissingWallet.error, "wallet_required");
  } else {
    assert.equal(cardsMissingWalletResponse.status, 503);
    assert.equal(cardsMissingWallet.error, "onchain_unavailable");
  }

  const testnetAccount = privateKeyToAccount("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  const testnetTask = await postJson("/api/tasks", {
    scenarioKey: "invoice",
    budgetUsd: 0.25,
    maxPerCallUsd: 0.006,
    fundingMode: "testnet",
    agentAddress: testnetAccount.address
  }, 201);
  const testnetChallengeBody = await challengeFact(testnetTask.id, "kyb", 0, "testnet KYB check");
  const testnetSignature = await testnetAccount.signMessage({
    message: testnetChallengeBody.x402.paymentMessage
  });
  const testnetSettled = await payFact(
    testnetTask.id,
    "kyb",
    0,
    "testnet KYB check",
    {
      protocol: "x402-preview",
      challengeId: testnetChallengeBody.x402.id,
      taskId: testnetTask.id,
      providerId: "kyb",
      amountUnits: testnetChallengeBody.x402.amountUnits,
      requestHash: testnetChallengeBody.x402.requestHash,
      signer: testnetAccount.address,
      signature: testnetSignature
    }
  );
  assert.equal(testnetSettled.receipt.paymentVerification, "wallet-signature");

  const badSignatureTask = await postJson("/api/tasks", {
    scenarioKey: "invoice",
    budgetUsd: 0.25,
    maxPerCallUsd: 0.006,
    fundingMode: "testnet",
    agentAddress: testnetAccount.address
  }, 201);
  const badChallengeBody = await challengeFact(badSignatureTask.id, "kyb", 0, "bad signature check");
  const badPaid = await fetch(`${baseUrl}/api/providers/kyb/facts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-payment": Buffer.from(JSON.stringify({
        protocol: "x402-preview",
        challengeId: badChallengeBody.x402.id,
        taskId: badSignatureTask.id,
        providerId: "kyb",
        amountUnits: badChallengeBody.x402.amountUnits,
        requestHash: badChallengeBody.x402.requestHash,
        signer: testnetAccount.address,
        authorization: "browser-preview-payment-authorization"
      }), "utf8").toString("base64url")
    },
    body: JSON.stringify({
      taskId: badSignatureTask.id,
      scenarioKey: "invoice",
      index: 0,
      purpose: "bad signature check"
    })
  });
  assert.equal(badPaid.status, 402);
  assert.equal((await badPaid.json()).error, "wallet_signature_required");
  const goodAfterBadSignature = await testnetAccount.signMessage({
    message: badChallengeBody.x402.paymentMessage
  });
  const recoveredAfterBad = await payFact(
    badSignatureTask.id,
    "kyb",
    0,
    "bad signature check",
    {
      protocol: "x402-preview",
      challengeId: badChallengeBody.x402.id,
      taskId: badSignatureTask.id,
      providerId: "kyb",
      amountUnits: badChallengeBody.x402.amountUnits,
      requestHash: badChallengeBody.x402.requestHash,
      signer: testnetAccount.address,
      signature: goodAfterBadSignature
    }
  );
  assert.equal(recoveredAfterBad.task.receiptCount, 1);

  const compactTask = await postJson("/api/tasks", {
    scenarioKey: "invoice",
    budgetUsd: 0.25,
    maxPerCallUsd: 0.006,
    fundingMode: "simulated"
  }, 201);
  const order = ["invoice", "kyb", "sanctions", "identity", "risk", "fx"];
  let lastTask = compactTask;
  for (let index = 0; index < 6; index += 1) {
    const providerId = order[index % order.length];
    const settledFact = await buyFact(compactTask.id, providerId, index, "invoice audit fact");
    assert.equal(settledFact.receipt.settlement, "x402-preview-provider-signed");
    lastTask = settledFact.task;
  }
  assert.equal(lastTask.receiptCount, 6);
  assert.equal(lastTask.denied, 0);
  assert.ok(lastTask.spent < 0.25);

  console.log("app tests ok");
} finally {
  await new Promise((resolve) => server.close(resolve));
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.ok, true);
  return response.json();
}

async function postJson(path, body, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(response.status, expectedStatus);
  return response.json();
}

async function buyFact(taskId, providerId, index, purpose) {
  const challengeBody = await challengeFact(taskId, providerId, index, purpose);
  return payFact(taskId, providerId, index, purpose, {
    protocol: "x402-preview",
    challengeId: challengeBody.x402.id,
    taskId,
    providerId,
    amountUnits: challengeBody.x402.amountUnits,
    requestHash: challengeBody.x402.requestHash,
    signer: "test-agent",
    authorization: "browser-preview-payment-authorization"
  });
}

async function challengeFact(taskId, providerId, index, purpose) {
  const body = {
    taskId,
    scenarioKey: "invoice",
    index,
    purpose
  };
  const challengeResponse = await fetch(`${baseUrl}/api/providers/${providerId}/facts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(challengeResponse.status, 402);
  return challengeResponse.json();
}

async function payFact(taskId, providerId, index, purpose, paymentPayload) {
  return payFactExpect(taskId, providerId, index, purpose, paymentPayload, 200);
}

async function payFactExpect(taskId, providerId, index, purpose, paymentPayload, expectedStatus) {
  const payment = Buffer.from(JSON.stringify(paymentPayload), "utf8").toString("base64url");
  const body = {
    taskId,
    scenarioKey: "invoice",
    index,
    purpose
  };
  const paid = await fetch(`${baseUrl}/api/providers/${providerId}/facts`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-payment": payment
    },
    body: JSON.stringify(body)
  });
  assert.equal(paid.status, expectedStatus);
  return paid.json();
}
