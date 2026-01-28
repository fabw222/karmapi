import { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { useQueryClient } from "@tanstack/react-query";
import { useAnchorProgram } from "@/providers/AnchorProvider";
import { deriveAllMarketPDAs } from "@/lib/pda";

interface CreateMarketParams {
  title: string;
  description: string;
  durationDays: number;
}

interface CreateMarketResult {
  marketAddress: string;
  signature: string;
}

export function useCreateMarket() {
  const { publicKey } = useWallet();
  const { program } = useAnchorProgram();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMarket = useCallback(
    async (params: CreateMarketParams): Promise<CreateMarketResult | null> => {
      if (!program || !publicKey) {
        setError("Wallet not connected");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Get bet token mint from environment
        const betTokenMintStr = process.env.NEXT_PUBLIC_BET_TOKEN_MINT;
        if (!betTokenMintStr) {
          throw new Error("Bet token mint not configured. Run the setup script first.");
        }
        const betTokenMint = new PublicKey(betTokenMintStr);

        // Calculate expiry timestamp
        const expiryTimestamp = new BN(
          Math.floor(Date.now() / 1000) + params.durationDays * 24 * 60 * 60
        );

        // Derive all PDAs
        const pdas = deriveAllMarketPDAs(publicKey, betTokenMint, expiryTimestamp);

        // Build and send the transaction
        const tx = await program.methods
          .createMarket(params.title, params.description, expiryTimestamp)
          .accountsStrict({
            creator: publicKey,
            market: pdas.market,
            betTokenMint: betTokenMint,
            yesMint: pdas.yesMint,
            noMint: pdas.noMint,
            vault: pdas.vault,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc();

        // Invalidate markets query to refresh list
        await queryClient.invalidateQueries({ queryKey: ["markets"] });

        return {
          marketAddress: pdas.market.toBase58(),
          signature: tx,
        };
      } catch (err) {
        console.error("Error creating market:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to create market";
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
    createMarket,
    isLoading,
    error,
    reset,
  };
}
