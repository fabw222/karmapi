import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { useAnchorProgram } from "@/providers/AnchorProvider";
import { useCluster } from "@/providers/ClusterProvider";
import { MarketAccountData } from "@/types/market";
import { parseTransactionError, parseSimulationError, logError } from "@/lib/errors";
import { invalidateMarketQueries } from "@/lib/query-helpers";

interface SettleMarketParams {
  marketAddress: string;
  outcome: boolean; // true = YES wins, false = NO wins
}

interface SettleMarketResult {
  signature: string;
}

export function useSettleMarket() {
  const { publicKey } = useWallet();
  const { program } = useAnchorProgram();
  const { cluster } = useCluster();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const settleMarket = useCallback(
    async (params: SettleMarketParams): Promise<SettleMarketResult | null> => {
      if (!program || !publicKey) {
        setError("Wallet not connected");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const marketPubkey = new PublicKey(params.marketAddress);

        // Pre-flight validation
        const marketData = await program.account.market.fetch(marketPubkey);
        const market = marketData as unknown as MarketAccountData;

        if ("settled" in market.status) {
          throw new Error("Market has already been settled");
        }
        if (!market.creator.equals(publicKey)) {
          throw new Error("Only the market creator can settle this market");
        }

        // Build and simulate before sending
        const method = program.methods
          .settleMarket(params.outcome)
          .accountsStrict({
            creator: publicKey,
            market: marketPubkey,
          });

        try {
          await method.simulate({ commitment: "confirmed" });
        } catch (simErr: unknown) {
          const sim = simErr as { simulationResponse?: { logs?: string[] }; logs?: string[] };
          const logs = sim.simulationResponse?.logs ?? sim.logs ?? null;
          throw new Error(parseSimulationError(simErr, logs));
        }

        const tx = await method.rpc();

        await invalidateMarketQueries(queryClient, cluster, params.marketAddress);

        return { signature: tx };
      } catch (err) {
        logError("useSettleMarket", err, { marketAddress: params.marketAddress });
        setError(parseTransactionError(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [program, publicKey, queryClient, cluster]
  );

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    settleMarket,
    isLoading,
    error,
    reset,
  };
}
