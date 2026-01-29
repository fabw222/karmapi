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
import { deriveVaultPDA } from "@/lib/pda";
import { MarketAccountData } from "@/types/market";

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

        // Send transaction
        const tx = await program.provider.sendAndConfirm!(transaction);

        // Calculate expected payout (simplified - actual payout determined by contract)
        const yesPool = market.yesPool.toNumber();
        const noPool = market.noPool.toNumber();
        const totalPool = yesPool + noPool;
        const winningPool = market.outcome ? yesPool : noPool;
        const payout = winningPool > 0 ? (params.amount * totalPool) / winningPool : 0;

        // Invalidate queries
        await queryClient.invalidateQueries({ queryKey: ["market", params.marketAddress] });
        await queryClient.invalidateQueries({ queryKey: ["userPosition", params.marketAddress] });
        await queryClient.invalidateQueries({ queryKey: ["userPositions"] });
        await queryClient.invalidateQueries({ queryKey: ["markets"] });

        return {
          signature: tx,
          payout,
        };
      } catch (err) {
        console.error("Error redeeming:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to redeem";
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [connection, program, publicKey, queryClient]
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

/**
 * Hook to redeem all winning positions across markets
 */
export function useRedeemAll() {
  const { redeem, isLoading, error, reset } = useRedeem();
  const [isRedeeming, setIsRedeeming] = useState(false);

  const redeemAll = useCallback(
    async (positions: { marketAddress: string; amount: number }[]): Promise<void> => {
      setIsRedeeming(true);

      for (const position of positions) {
        await redeem(position);
      }

      setIsRedeeming(false);
    },
    [redeem]
  );

  return {
    redeemAll,
    isLoading: isLoading || isRedeeming,
    error,
    reset,
  };
}
