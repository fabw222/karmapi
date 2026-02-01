import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  getAccount,
} from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { useQueryClient } from "@tanstack/react-query";
import { useAnchorProgram } from "@/providers/AnchorProvider";
import { useCluster } from "@/providers/ClusterProvider";
import { deriveVaultPDA } from "@/lib/pda";
import { MarketAccountData } from "@/types/market";
import { parseTransactionError, parseSimulationError, logError } from "@/lib/errors";
import { invalidateMarketQueries } from "@/lib/query-helpers";

interface RedeemParams {
  marketAddress: string;
  amount: number; // amount of winning tokens to redeem
}

interface RedeemResult {
  signature: string;
  payout: number;
}

export function useRedeem() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { program } = useAnchorProgram();
  const { cluster } = useCluster();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redeem = useCallback(
    async (params: RedeemParams): Promise<RedeemResult | null> => {
      if (!program || !publicKey) {
        setError("Wallet not connected");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const marketPubkey = new PublicKey(params.marketAddress);

        // Fetch market data to determine winning side
        const marketData = await program.account.market.fetch(marketPubkey);
        const market = marketData as unknown as MarketAccountData;

        // Check if market is settled
        if (!("settled" in market.status)) {
          throw new Error("Market is not settled yet");
        }

        if (market.outcome === null) {
          throw new Error("Market outcome not set");
        }

        // Determine winning mint based on outcome
        const winningMint = market.outcome ? market.yesMint : market.noMint;
        const [vault] = deriveVaultPDA(marketPubkey);

        // Get user's token accounts
        const redeemerWinningAccount = await getAssociatedTokenAddress(
          winningMint,
          publicKey
        );
        const redeemerBetAccount = await getAssociatedTokenAddress(
          market.betTokenMint,
          publicKey
        );

        const isWSOL = market.betTokenMint.equals(NATIVE_MINT);

        // Build transaction with ATA creation if needed
        const transaction = new Transaction();

        // Check if bet token account exists, create if not
        try {
          await getAccount(connection, redeemerBetAccount);
        } catch {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey,
              redeemerBetAccount,
              publicKey,
              market.betTokenMint
            )
          );
        }

        // Add redeem instruction
        const redeemIx = await program.methods
          .redeem(new BN(params.amount))
          .accountsStrict({
            redeemer: publicKey,
            market: marketPubkey,
            vault: vault,
            winningMint: winningMint,
            redeemerWinningAccount: redeemerWinningAccount,
            redeemerBetAccount: redeemerBetAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction();

        transaction.add(redeemIx);

        // Close WSOL account to get native SOL back
        if (isWSOL) {
          transaction.add(
            createCloseAccountInstruction(
              redeemerBetAccount,
              publicKey,
              publicKey
            )
          );
        }

        // Simulate the complete transaction before sending
        {
          transaction.feePayer = publicKey;
          const sim = await connection.simulateTransaction(transaction);
          if (sim.value.err) {
            throw new Error(
              parseSimulationError(
                new Error(JSON.stringify(sim.value.err)),
                sim.value.logs
              )
            );
          }
        }

        // Send transaction
        const tx = await program.provider.sendAndConfirm!(transaction);

        // Calculate expected payout (simplified - actual payout determined by contract)
        const yesPool = market.yesPool.toNumber();
        const noPool = market.noPool.toNumber();
        const totalPool = yesPool + noPool;
        const winningPool = market.outcome ? yesPool : noPool;
        const payout = winningPool > 0 ? (params.amount * totalPool) / winningPool : 0;

        await invalidateMarketQueries(queryClient, cluster, params.marketAddress);

        return {
          signature: tx,
          payout,
        };
      } catch (err) {
        logError("useRedeem", err, { marketAddress: params.marketAddress });
        setError(parseTransactionError(err));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [connection, program, publicKey, queryClient, cluster]
  );

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    redeem,
    isLoading,
    error,
    reset,
  };
}

export interface RedeemAllResults {
  succeeded: string[];
  failed: { marketAddress: string; error: string }[];
}

/**
 * Hook to redeem all winning positions across markets.
 * Tracks per-position success/failure.
 */
export function useRedeemAll() {
  const { redeem, isLoading, error, reset: resetRedeem } = useRedeem();
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [results, setResults] = useState<RedeemAllResults | null>(null);

  const redeemAll = useCallback(
    async (positions: { marketAddress: string; amount: number }[]): Promise<RedeemAllResults> => {
      setIsRedeeming(true);
      setResults(null);

      const succeeded: string[] = [];
      const failed: { marketAddress: string; error: string }[] = [];

      for (const position of positions) {
        try {
          const result = await redeem(position);
          if (result) {
            succeeded.push(position.marketAddress);
          } else {
            failed.push({
              marketAddress: position.marketAddress,
              error: "Redemption returned no result",
            });
          }
        } catch (err) {
          failed.push({
            marketAddress: position.marketAddress,
            error: parseTransactionError(err),
          });
        }
      }

      const outcome = { succeeded, failed };
      setResults(outcome);
      setIsRedeeming(false);
      return outcome;
    },
    [redeem]
  );

  const reset = useCallback(() => {
    resetRedeem();
    setResults(null);
  }, [resetRedeem]);

  return {
    redeemAll,
    isLoading: isLoading || isRedeeming,
    error,
    results,
    reset,
  };
}
