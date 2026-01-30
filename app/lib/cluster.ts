export type Cluster = "localnet" | "devnet" | "testnet" | "mainnet-beta";

export const CLUSTER_STORAGE_KEY = "karmapi-cluster";

export const DEFAULT_CLUSTER: Cluster = "devnet";

export const DEFAULT_ENDPOINTS: Record<Cluster, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

export function isCluster(value: unknown): value is Cluster {
  return (
    value === "localnet" ||
    value === "devnet" ||
    value === "testnet" ||
    value === "mainnet-beta"
  );
}

export function parseCluster(value: unknown): Cluster | null {
  if (isCluster(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (isCluster(normalized)) return normalized;

  switch (normalized) {
    case "mainnet":
      return "mainnet-beta";
    case "local":
      return "localnet";
    default:
      return null;
  }
}

export function inferClusterFromRpcUrl(rpcUrl: string): Cluster | null {
  try {
    const url = new URL(rpcUrl);
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") {
      return "localnet";
    }
  } catch {
    // ignore invalid URL and fall back to string heuristics
  }

  const lower = rpcUrl.toLowerCase();
  if (lower.includes("devnet")) return "devnet";
  if (lower.includes("testnet")) return "testnet";
  if (lower.includes("mainnet")) return "mainnet-beta";
  return null;
}

export function resolveEnvCluster(params: {
  rpcUrl?: string | undefined;
  cluster?: string | undefined;
}): Cluster | null {
  const explicit = parseCluster(params.cluster);
  if (explicit) return explicit;
  if (!params.rpcUrl) return null;
  return inferClusterFromRpcUrl(params.rpcUrl);
}
