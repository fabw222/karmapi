import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useAnchorProgram } from "@/providers/AnchorProvider";
import { MarketUI, MarketAccountData, marketToUI } from "@/types/market";

/**
 * Fetch a single market by its public key
 */
export function useMarket(marketAddress: string | null) {
  const { connection } = useConnection();
  const { program } = useAnchorProgram();

  return useQuery<MarketUI | null>({
    queryKey: ["market", marketAddress],
    queryFn: async () => {
      if (!program || !marketAddress) {
        return null;
      }

      try {
        const pubkey = new PublicKey(marketAddress);
        const account = await program.account.market.fetch(pubkey);

        return marketToUI(pubkey, account as unknown as MarketAccountData);
      } catch (error) {
        console.error("Error fetching market:", error);
        return null;
      }
    },
    enabled: !!connection && !!marketAddress,
    staleTime: 5 * 1000, // Shorter stale time for single market
    refetchInterval: 10 * 1000,
  });
}

/**
 * Fetch multiple markets by their public keys
 */
export function useMultipleMarkets(marketAddresses: string[]) {
  const { connection } = useConnection();
  const { program } = useAnchorProgram();

  return useQuery<MarketUI[]>({
    queryKey: ["markets", marketAddresses],
    queryFn: async () => {
      if (!program || marketAddresses.length === 0) {
        return [];
      }

      try {
        const pubkeys = marketAddresses.map((addr) => new PublicKey(addr));
        const accounts = await program.account.market.fetchMultiple(pubkeys);

        return accounts
          .map((account, index) => {
            if (!account) return null;
            return marketToUI(
              pubkeys[index],
              account as unknown as MarketAccountData
            );
          })
          .filter((m): m is MarketUI => m !== null);
      } catch (error) {
        console.error("Error fetching markets:", error);
        return [];
      }
    },
    enabled: !!connection && marketAddresses.length > 0,
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000,
  });
}
