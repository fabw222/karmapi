import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  NATIVE_MINT,
  getAssociatedTokenAddress,
  getAccount,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from "@solana/spl-token";
import { useCluster } from "@/providers/ClusterProvider";

export interface TokenBalance {
  balance: number; // raw base units
  uiBalance: number; // human-readable (balance / 10^decimals)
}

/**
 * Fetch the connected wallet's balance for a specific token mint.
 * For NATIVE_MINT: uses connection.getBalance().
 * For other tokens: gets ATA then reads the account.
 */
export function useTokenBalance(
  mint: string | undefined | null,
  decimals: number = 9
) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { cluster } = useCluster();

  return useQuery<number | null, Error, TokenBalance | null>({
    queryKey: ["tokenBalance", cluster, mint, publicKey?.toBase58()],
    queryFn: async () => {
      if (!mint || !publicKey) return null;

      const mintPubkey = new PublicKey(mint);

      // Native SOL balance
      if (mint === NATIVE_MINT.toBase58()) {
        return await connection.getBalance(publicKey);
      }

      // SPL token balance via ATA
      try {
        const ata = await getAssociatedTokenAddress(mintPubkey, publicKey);
        const account = await getAccount(connection, ata);
        return Number(account.amount);
      } catch (e) {
        // ATA doesn't exist — user has 0 balance
        if (
          e instanceof TokenAccountNotFoundError ||
          e instanceof TokenInvalidAccountOwnerError
        ) {
          return 0;
        }
        // Re-throw transient errors (RPC failures, timeouts) so React Query
        // surfaces them as an error state instead of silently showing 0.
        throw e;
      }
    },
    select: (balance) => {
      if (balance === null) return null;
      return {
        balance,
        uiBalance: balance / Math.pow(10, decimals),
      };
    },
    enabled: !!mint && !!publicKey && !!connection,
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 30 * 1000, // 30 seconds
  });
}
