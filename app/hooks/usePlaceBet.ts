import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getAccount,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { useQueryClient } from "@tanstack/react-query";
import { useAnchorProgram } from "@/providers/AnchorProvider";
import { deriveYesMintPDA, deriveNoMintPDA, deriveVaultPDA } from "@/lib/pda";

const IS_DEV = process.env.NODE_ENV === "development";

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
        const isWSOL = betTokenMint.equals(NATIVE_MINT);

        // Debug: Log all parameters (development only)
        if (IS_DEV) {
          console.log("=== Place Bet Debug ===");
          console.log("ENV PROGRAM_ID:", process.env.NEXT_PUBLIC_PROGRAM_ID);
          console.log("ENV RPC_URL:", process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
          console.log("Bettor wallet:", publicKey.toBase58());
          console.log("Market address:", params.marketAddress);
          console.log("Bet token mint:", params.betTokenMint);
          console.log("Amount (lamports):", params.amount);
          console.log("Side (YES=true):", params.side);
          console.log("Is WSOL:", isWSOL);
        }

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

        if (IS_DEV) {
          console.log("YesMint PDA:", yesMint.toBase58());
          console.log("NoMint PDA:", noMint.toBase58());
          console.log("Vault PDA:", vault.toBase58());
          console.log("Bettor token account:", bettorTokenAccount.toBase58());
          console.log("Bettor YES account:", bettorYesAccount.toBase58());
          console.log("Bettor NO account:", bettorNoAccount.toBase58());
          console.log("Program ID:", program.programId.toBase58());
          console.log("=== End Debug ===");
        }

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

        // Handle WSOL (Wrapped SOL)
        if (isWSOL) {
          // Check if WSOL ATA exists, create if not
          try {
            await getAccount(connection, bettorTokenAccount);
          } catch {
            transaction.add(
              createAssociatedTokenAccountInstruction(
                publicKey,
                bettorTokenAccount,
                publicKey,
                betTokenMint
              )
            );
          }

          // Transfer SOL to WSOL ATA
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: publicKey,
              toPubkey: bettorTokenAccount,
              lamports: params.amount,
            })
          );

          // Sync native balance to reflect the transferred SOL as WSOL
          transaction.add(createSyncNativeInstruction(bettorTokenAccount));
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
        if (IS_DEV) console.error("Error placing bet:", err);
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
