import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { useCluster } from "@/providers/ClusterProvider";

export interface ConnectionHealth {
  healthy: boolean;
  slot: number | null;
  latencyMs: number | null;
}

/**
 * Pings the RPC endpoint periodically and reports health status.
 */
export function useConnectionHealth() {
  const { connection } = useConnection();
  const { cluster } = useCluster();

  return useQuery<ConnectionHealth>({
    queryKey: ["connectionHealth", cluster],
    queryFn: async () => {
      const start = performance.now();
      try {
        const slot = await connection.getSlot();
        const latencyMs = Math.round(performance.now() - start);
        return { healthy: true, slot, latencyMs };
      } catch {
        const latencyMs = Math.round(performance.now() - start);
        return { healthy: false, slot: null, latencyMs };
      }
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    retry: 1,
  });
}
