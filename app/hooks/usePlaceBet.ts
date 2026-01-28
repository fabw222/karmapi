import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { useQueryClient } from "@tanstack/react-query";
import { useAnchorProgram } from "@/providers/AnchorProvider";
import { deriveYesMintPDA, deriveNoMintPDA, deriveVaultPDA } from "@/lib/pda";

interface PlaceBetParams {
  marketAddress: string;
  betTokenMint: string;
  amount: number; // in base units (lamports)
  side: boolean; // true = YES, false = NO
}

interface PlaceBetResult {
  signature: string;
}

export function usePlaceBet() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { program, provider } = useAnchorProgram();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeBet = useCallback(
    async (params: PlaceBetParams): Promise<PlaceBetResult | null> => {
      if (!program || !publicKey || !provider || !sendTransaction) {
        setError("Wallet not connected");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const marketPubkey = new PublicKey(params.marketAddress);
        const betTokenMint = new PublicKey(params.betTokenMint);

        // Derive PDAs
        const [yesMint] = deriveYesMintPDA(marketPubkey);
        const [noMint] = deriveNoMintPDA(marketPubkey);
        const [vault] = deriveVaultPDA(marketPubkey);

        // Get user's associated token accounts
        const bettorTokenAccount = await getAssociatedTokenAddress(
          betTokenMint,
          publicKey
        );
        const bettorYesAccount = await getAssociatedTokenAddress(
          yesMint,
          publicKey
        );
        const bettorNoAccount = await getAssociatedTokenAddress(
          noMint,
          publicKey
        );

        // Build transaction with ATA creation if needed
        const transaction = new Transaction();

        // Check if YES ATA exists, create if not
        try {
          await getAccount(connection, bettorYesAccount);
        } catch {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey,
              bettorYesAccount,
              publicKey,
              yesMint
            )
          );
        }

        // Check if NO ATA exists, create if not
        try {
          await getAccount(connection, bettorNoAccount);
        } catch {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey,
              bettorNoAccount,
              publicKey,
              noMint
            )
          );
        }

        // Add the place bet instruction
        const placeBetIx = await program.methods
          .placeBet(new BN(params.amount), params.side)
          .accountsStrict({
            bettor: publicKey,
            market: marketPubkey,
            betTokenMint: betTokenMint,
            yesMint: yesMint,
            noMint: noMint,
            vault: vault,
            bettorTokenAccount: bettorTokenAccount,
            bettorYesAccount: bettorYesAccount,
            bettorNoAccount: bettorNoAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction();

        transaction.add(placeBetIx);

        // Send transaction
        const signature = await sendTransaction(transaction, connection);

        // Wait for confirmation
        await connection.confirmTransaction(signature, "confirmed");

        // Invalidate queries
        await queryClient.invalidateQueries({ queryKey: ["market", params.marketAddress] });
        await queryClient.invalidateQueries({ queryKey: ["markets"] });
        await queryClient.invalidateQueries({ queryKey: ["userPosition", params.marketAddress] });
        await queryClient.invalidateQueries({ queryKey: ["userPositions"] });

        return { signature };
      } catch (err) {
        console.error("Error placing bet:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to place bet";
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [program, publicKey, provider, connection, sendTransaction, queryClient]
  );

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    placeBet,
    isLoading,
    error,
    reset,
  };
}
