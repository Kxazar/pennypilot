import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createPublicClient, createWalletClient, getAddress, http } from "viem";
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
const { getProviderRegistry } = await import("../server.mjs");

const owner = await publicClient.readContract({
  address: deployment.contractAddress,
  abi: artifact.abi,
  functionName: "owner"
});

if (getAddress(owner) !== account.address) {
  console.error(`Deployer ${account.address} is not contract owner ${owner}.`);
  process.exit(1);
}

console.log(`Contract: ${deployment.contractAddress}`);
console.log(`Owner: ${account.address}`);

for (const provider of getProviderRegistry()) {
  const metadataURI = `pennypilot://providers/${provider.id}`;
  const current = await publicClient.readContract({
    address: deployment.contractAddress,
    abi: artifact.abi,
    functionName: "providers",
    args: [provider.address]
  });
  const alreadyReady = current[0] === true && current[1] === false && current[3] === metadataURI;
  if (alreadyReady) {
    console.log(`Provider already allowlisted: ${provider.name} ${provider.address}`);
    continue;
  }

  const hash = await walletClient.writeContract({
    address: deployment.contractAddress,
    abi: artifact.abi,
    functionName: "setProvider",
    args: [provider.address, true, false, metadataURI]
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Provider allowlisted: ${provider.name} ${provider.address} tx=${hash}`);
}

console.log("Provider setup complete.");
