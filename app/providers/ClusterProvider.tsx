"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  CLUSTER_STORAGE_KEY,
  DEFAULT_CLUSTER,
  DEFAULT_ENDPOINTS,
  resolveEnvCluster,
  type Cluster,
} from "@/lib/cluster";

export type { Cluster } from "@/lib/cluster";

const ENV_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || undefined;
const INFERRED_ENV_CLUSTER = resolveEnvCluster({
  rpcUrl: ENV_RPC_URL,
  cluster: process.env.NEXT_PUBLIC_SOLANA_CLUSTER,
});
const ENV_CLUSTER = INFERRED_ENV_CLUSTER;

if (
  process.env.NODE_ENV === "development" &&
  ENV_RPC_URL &&
  !INFERRED_ENV_CLUSTER &&
  !process.env.NEXT_PUBLIC_SOLANA_CLUSTER
) {
  console.warn(
    "NEXT_PUBLIC_SOLANA_RPC_URL is set, but the cluster couldn't be inferred. Using it as the devnet endpoint; set NEXT_PUBLIC_SOLANA_CLUSTER so the app can label/cache the correct cluster."
  );
}

const ENDPOINTS: Record<Cluster, string> = {
  ...DEFAULT_ENDPOINTS,
  ...(ENV_RPC_URL
    ? { [ENV_CLUSTER ?? DEFAULT_CLUSTER]: ENV_RPC_URL }
    : {}),
};

interface ClusterContextValue {
  cluster: Cluster;
  endpoint: string;
  setCluster: (cluster: Cluster) => void;
}

const ClusterContext = createContext<ClusterContextValue | undefined>(undefined);

export function ClusterProvider({
  children,
  initialCluster,
}: {
  children: ReactNode;
  initialCluster?: Cluster;
}) {
  const [cluster, setClusterState] = useState<Cluster>(
    () => initialCluster ?? DEFAULT_CLUSTER
  );
  const queryClient = useQueryClient();

  const setCluster = useCallback(
    (newCluster: Cluster) => {
      setClusterState(newCluster);
      try {
        localStorage.setItem(CLUSTER_STORAGE_KEY, newCluster);
      } catch {
        // ignore write failures (e.g. disabled storage)
      }
      try {
        document.cookie = `${CLUSTER_STORAGE_KEY}=${newCluster}; Path=/; Max-Age=31536000; SameSite=Lax`;
      } catch {
        // ignore cookie write failures
      }
      queryClient.clear();
    },
    [queryClient]
  );

  const endpoint = ENDPOINTS[cluster];

  const value = useMemo(
    () => ({ cluster, endpoint, setCluster }),
    [cluster, endpoint, setCluster]
  );

  return (
    <ClusterContext.Provider value={value}>{children}</ClusterContext.Provider>
  );
}

export function useCluster() {
  const ctx = useContext(ClusterContext);
  if (!ctx) {
    throw new Error("useCluster must be used within a ClusterProvider");
  }
  return ctx;
}
