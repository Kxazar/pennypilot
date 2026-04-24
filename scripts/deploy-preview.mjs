import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createPublicClient, createWalletClient, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_TESTNET, normalizePrivateKey } from "./arc-runtime.mjs";
import { loadLocalEnv } from "./load-local-env.mjs";

loadLocalEnv();

const arcTestnet = {
  ...ARC_TESTNET,
  rpcUrls: {
    default: {
      http: [process.env.ARC_RPC_URL ?? ARC_TESTNET.rpcUrls.default.http[0]]
    }
  }
};

const configuredPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;

if (!configuredPrivateKey) {
  console.error("Set DEPLOYER_PRIVATE_KEY to deploy AgentExpenseCard.");
  process.exit(1);
}

const privateKey = normalizePrivateKey(configuredPrivateKey, "DEPLOYER_PRIVATE_KEY");
const artifactPath = path.join(process.cwd(), "artifacts", "contracts", "contracts", "AgentExpenseCard.json");
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http()
});
const client = createWalletClient({
  account,
  chain: arcTestnet,
  transport: http()
});

const asset = process.env.PAYMENT_ASSET ?? "0x0000000000000000000000000000000000000000";
const balance = await publicClient.getBalance({ address: account.address });

console.log(`Deployer: ${account.address}`);
console.log(`Native balance: ${formatEther(balance)} USDC`);

const hash = await client.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  args: [asset],
  value: parseEther("0")
});

console.log(`Deploy submitted: ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (!receipt.contractAddress) {
  console.error("Deploy transaction was mined but no contract address was returned.");
  process.exit(1);
}

const deployment = {
  network: "arc-testnet",
  chainId: arcTestnet.id,
  rpcUrl: arcTestnet.rpcUrls.default.http[0],
  deployer: account.address,
  asset,
  transactionHash: hash,
  contractAddress: receipt.contractAddress,
  blockNumber: receipt.blockNumber.toString(),
  deployedAt: new Date().toISOString(),
  explorerUrl: `https://testnet.arcscan.app/address/${receipt.contractAddress}`
};

const deploymentsDir = path.join(process.cwd(), "deployments");
fs.mkdirSync(deploymentsDir, { recursive: true });
fs.writeFileSync(
  path.join(deploymentsDir, "arc-testnet.json"),
  JSON.stringify(deployment, null, 2)
);

console.log(`Contract address: ${receipt.contractAddress}`);
console.log(`Explorer: ${deployment.explorerUrl}`);
