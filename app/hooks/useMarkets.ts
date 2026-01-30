import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { useAnchorProgram } from "@/providers/AnchorProvider";
import { useCluster } from "@/providers/ClusterProvider";
import { MarketUI, MarketAccountData, marketToUI } from "@/types/market";

/**
 * Fetch all markets from the chain
 */
export function useMarkets() {
  const { connection } = useConnection();
  const { program } = useAnchorProgram();
  const { cluster } = useCluster();

  return useQuery<MarketUI[]>({
    queryKey: ["markets", cluster],
    queryFn: async () => {
      // Fetch all Market accounts
      const accounts = await program.account.market.all();

      // Convert to UI format
      const markets = accounts.map((account) =>
        marketToUI(
          account.publicKey,
          account.account as unknown as MarketAccountData
        )
      );

      // Sort by total volume (descending) by default
      markets.sort((a, b) => b.totalVolume - a.totalVolume);

      return markets;
    },
    enabled: !!connection,
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
  });
}

/**
 * Fetch only active (non-resolved) markets
 */
export function useActiveMarkets() {
  const marketsQuery = useMarkets();

  return {
    ...marketsQuery,
    data: marketsQuery.data?.filter((m) => !m.isResolved) || [],
  };
}

/**
 * Fetch only resolved markets
 */
export function useResolvedMarkets() {
  const marketsQuery = useMarkets();

  return {
    ...marketsQuery,
    data: marketsQuery.data?.filter((m) => m.isResolved) || [],
  };
}
