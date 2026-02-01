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
import { useCluster } from "@/providers/ClusterProvider";
import { deriveYesMintPDA, deriveNoMintPDA, deriveVaultPDA } from "@/lib/pda";
import { parseTransactionError, parseSimulationError, logError } from "@/lib/errors";
import { invalidateMarketQueries } from "@/lib/query-helpers";

const IS_DEV = process.env.NODE_ENV === "development";

// Static estimates for UI display (BetPanel). Actual validation uses dynamic rent below.
export const ESTIMATED_ATA_RENT = 2_039_280; // lamports (~0.00204 SOL per ATA)
export const ESTIMATED_TX_FEE = 10_000; // lamports, conservative for 1 sig

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
  const { cluster } = useCluster();
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
        let newAtaCount = 0;

        // Check if YES ATA exists, create if not
        try {
          await getAccount(connection, bettorYesAccount);
        } catch {
          newAtaCount++;
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
          newAtaCount++;
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
            newAtaCount++;
            transaction.add(
              createAssociatedTokenAccountInstruction(
                publicKey,
                bettorTokenAccount,
                publicKey,
                betTokenMint
              )
            );
          }

          // Validate SOL balance (use dynamic rent from RPC)
          const ataRent = await connection.getMinimumBalanceForRentExemption(165);
          const overhead = (newAtaCount * ataRent) + ESTIMATED_TX_FEE;
          const solBalance = await connection.getBalance(publicKey);
          if (solBalance < params.amount + overhead) {
            throw new Error(
              `Insufficient SOL balance. You have ${(solBalance / 1e9).toFixed(4)} SOL but need ~${((params.amount + overhead) / 1e9).toFixed(4)} SOL (bet + fees).`
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
        } else {
          // Non-WSOL: Check if bettor's token ATA exists, create if not
          try {
            const tokenAccount = await getAccount(
              connection,
              bettorTokenAccount
            );
            // Validate token balance
            if (Number(tokenAccount.amount) < params.amount) {
              throw new Error(
                `Insufficient token balance. You have ${Number(tokenAccount.amount)} base units but need ${params.amount}.`
              );
            }
          } catch (e) {
            // If it's our own thrown error, re-throw
            if (e instanceof Error && e.message.startsWith("Insufficient")) {
              throw e;
            }
            // ATA doesn't exist — create it (user may have 0 balance, but the
            // transaction will fail on-chain with a clearer program error)
            transaction.add(
              createAssociatedTokenAccountInstruction(
                publicKey,
                bettorTokenAccount,
                publicKey,
                betTokenMint
              )
            );
          }
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

        // Simulate transaction for better error reporting (always run)
        {
          transaction.feePayer = publicKey;
          const sim = await connection.simulateTransaction(transaction);
          if (sim.value.err) {
            if (IS_DEV) {
              console.error("Simulation failed:", sim.value.err);
              console.error("Simulation logs:", sim.value.logs);
            }
            throw new Error(
              parseSimulationError(
                new Error(JSON.stringify(sim.value.err)),
                sim.value.logs
              )
            );
          }
        }

        // Send transaction
        const signature = await sendTransaction(transaction, connection);

        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(
          signature,
          "confirmed"
        );
        if (confirmation.value.err) {
          throw new Error(
            parseTransactionError(
              new Error(JSON.stringify(confirmation.value.err))
            )
          );
        }

        // Invalidate queries (including token balance)
        await invalidateMarketQueries(queryClient, cluster, params.marketAddress);

        return { signature };
      } catch (err) {
        logError("usePlaceBet", err, { marketAddress: params.marketAddress });
        setError(parseTransactionError(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [program, publicKey, provider, connection, sendTransaction, queryClient, cluster]
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
