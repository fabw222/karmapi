import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useAnchorProgram, PROGRAM_ID } from "@/providers/AnchorProvider";
import { MarketUI, MarketAccountData, marketToUI } from "@/types/market";

/**
 * Fetch all markets from the chain
 */
export function useMarkets() {
  const { connection } = useConnection();
  const { program } = useAnchorProgram();

  return useQuery<MarketUI[]>({
    queryKey: ["markets"],
    queryFn: async () => {
      if (!program) {
        // Return empty array if program not initialized
        return [];
      }

      try {
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
      } catch (error) {
        console.error("Error fetching markets:", error);
        return [];
      }
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
