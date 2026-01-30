import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { useAnchorProgram } from "@/providers/AnchorProvider";
import { useCluster } from "@/providers/ClusterProvider";
import {
  MarketUI,
  MarketAccountData,
  marketToUI,
  UserPosition,
} from "@/types/market";

interface PositionWithMarket extends UserPosition {
  market: MarketUI;
}

/**
 * Fetch user's positions across all markets
 */
export function useUserPositions() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { program } = useAnchorProgram();
  const { cluster } = useCluster();

  return useQuery<PositionWithMarket[]>({
    queryKey: ["userPositions", cluster, publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey) {
        return [];
      }

      try {
        const marketsPromise = program.account.market.all();
        const tokenAccountsPromise = connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_PROGRAM_ID },
          "confirmed"
        );

        const [accounts, tokenAccounts] = await Promise.all([
          marketsPromise,
          tokenAccountsPromise,
        ]);

        const positions: PositionWithMarket[] = [];

        const balancesByMint = new Map<
          string,
          { amount: number; hasAccount: boolean }
        >();
        for (const tokenAccount of tokenAccounts.value) {
          const parsed = (
            tokenAccount.account.data as { parsed?: unknown } | null
          )?.parsed as
            | {
                info?: {
                  mint?: string;
                  tokenAmount?: {
                    amount?: string;
                  };
                };
              }
            | undefined;
          const mint = parsed?.info?.mint;
          const amountStr = parsed?.info?.tokenAmount?.amount;
          if (!mint || !amountStr) continue;

          const amount = Number(amountStr);
          if (!Number.isFinite(amount) || amount < 0) continue;

          const prev = balancesByMint.get(mint);
          balancesByMint.set(mint, {
            amount: (prev?.amount ?? 0) + amount,
            hasAccount: true,
          });
        }

        // For each market, check user's YES/NO token balances
        for (const account of accounts) {
          const marketData = account.account as unknown as MarketAccountData;
          const market = marketToUI(account.publicKey, marketData);

          try {
            const yesBalance = balancesByMint.get(market.yesMint)?.amount ?? 0;
            const noBalance = balancesByMint.get(market.noMint)?.amount ?? 0;

            const hasAnyTokenAccount =
              balancesByMint.get(market.yesMint)?.hasAccount ||
              balancesByMint.get(market.noMint)?.hasAccount ||
              false;
            const hasActivePosition = yesBalance > 0 || noBalance > 0;
            const shouldInclude =
              hasActivePosition || (market.isResolved && hasAnyTokenAccount);

            if (!shouldInclude) continue;

            // Calculate estimated value (avoid division by zero)
            const yesValue =
              market.yesPool > 0
                ? (yesBalance * market.noPool) / market.yesPool
                : 0;
            const noValue =
              market.noPool > 0
                ? (noBalance * market.yesPool) / market.noPool
                : 0;

            positions.push({
              marketAddress: market.address,
              yesBalance,
              noBalance,
              yesValue,
              noValue,
              market,
            });
          } catch (error) {
            console.error(
              `Error fetching position for market ${market.address}:`,
              error
            );
          }
        }

        return positions;
      } catch (error) {
        console.error("Error fetching user positions:", error);
        return [];
      }
    },
    enabled: !!connection && !!publicKey,
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
  });
}

/**
 * Fetch user's position in a specific market
 */
export function useUserPosition(marketAddress: string | null) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { program } = useAnchorProgram();
  const { cluster } = useCluster();

  return useQuery<UserPosition | null>({
    queryKey: ["userPosition", cluster, marketAddress, publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey || !marketAddress) {
        return null;
      }

      try {
        const marketPubkey = new PublicKey(marketAddress);
        const marketData = await program.account.market.fetch(marketPubkey);
        const account = marketData as unknown as MarketAccountData;

        const yesMint = account.yesMint;
        const noMint = account.noMint;

        const yesAta = await getAssociatedTokenAddress(yesMint, publicKey);
        const noAta = await getAssociatedTokenAddress(noMint, publicKey);

        let yesBalance = 0;
        let noBalance = 0;

        try {
          const yesAccount = await getAccount(connection, yesAta);
          yesBalance = Number(yesAccount.amount);
        } catch {
          // Account doesn't exist
        }

        try {
          const noAccount = await getAccount(connection, noAta);
          noBalance = Number(noAccount.amount);
        } catch {
          // Account doesn't exist
        }

        const yesPool = account.yesPool.toNumber();
        const noPool = account.noPool.toNumber();

        return {
          marketAddress,
          yesBalance,
          noBalance,
          yesValue: yesPool > 0 ? (yesBalance * noPool) / yesPool : 0,
          noValue: noPool > 0 ? (noBalance * yesPool) / noPool : 0,
        };
      } catch (error) {
        console.error("Error fetching user position:", error);
        return null;
      }
    },
    enabled: !!connection && !!publicKey && !!marketAddress,
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000,
  });
}
