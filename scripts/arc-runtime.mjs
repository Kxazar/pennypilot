import fs from "node:fs";
import path from "node:path";
import { getAddress, isAddress } from "viem";

export const ARC_TESTNET = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.network"]
    }
  },
  blockExplorers: {
    default: {
      name: "ArcScan",
      url: "https://testnet.arcscan.app"
    }
  }
};

export const CONTRACT_PREVIEW_FALLBACK_ADDRESS = "0xaec0000000000000000000000000000000000420";

export function readArcDeployment({ required = false } = {}) {
  const deploymentPath = path.join(process.cwd(), "deployments", "arc-testnet.json");
  if (!fs.existsSync(deploymentPath)) {
    if (required) {
      throw new Error("Missing deployments/arc-testnet.json. Run npm run contracts:deploy:arc first.");
    }
    return null;
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  if (!isAddress(deployment.contractAddress)) {
    throw new Error("deployments/arc-testnet.json does not contain a valid contractAddress.");
  }
  return {
    ...deployment,
    contractAddress: getAddress(deployment.contractAddress)
  };
}

export function getActiveContractAddress({ allowFallback = true } = {}) {
  const configured = process.env.AGENT_EXPENSE_CARD_ADDRESS;
  if (configured) {
    if (!isAddress(configured)) {
      throw new Error("AGENT_EXPENSE_CARD_ADDRESS is not a valid address.");
    }
    return getAddress(configured);
  }

  const deployment = readArcDeployment();
  if (deployment) {
    return deployment.contractAddress;
  }

  if (!allowFallback) {
    throw new Error("No active contract address found. Deploy first or set AGENT_EXPENSE_CARD_ADDRESS.");
  }
  return CONTRACT_PREVIEW_FALLBACK_ADDRESS;
}

export function getArcRpcUrl() {
  const deployment = readArcDeployment();
  return process.env.ARC_RPC_URL ?? deployment?.rpcUrl ?? ARC_TESTNET.rpcUrls.default.http[0];
}

export function normalizePrivateKey(value, label = "private key") {
  if (!value) {
    throw new Error(`Missing ${label}.`);
  }
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex value.`);
  }
  return normalized;
}
