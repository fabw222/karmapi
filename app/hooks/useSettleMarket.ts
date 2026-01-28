import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQueryClient } from "@tanstack/react-query";
import { useAnchorProgram } from "@/providers/AnchorProvider";

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

        // Call settle_market instruction
        const tx = await program.methods
          .settleMarket(params.outcome)
          .accountsStrict({
            creator: publicKey,
            market: marketPubkey,
          })
          .rpc();

        // Invalidate queries
        await queryClient.invalidateQueries({ queryKey: ["market", params.marketAddress] });
        await queryClient.invalidateQueries({ queryKey: ["markets"] });

        return { signature: tx };
      } catch (err) {
        console.error("Error settling market:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to settle market";
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [program, publicKey, queryClient]
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
