import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { useAnchorProgram } from "@/providers/AnchorProvider";
import { MarketUI, MarketAccountData, marketToUI, UserPosition } from "@/types/market";

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

  return useQuery<PositionWithMarket[]>({
    queryKey: ["userPositions", publicKey?.toBase58()],
    queryFn: async () => {
      if (!program || !publicKey) {
        return [];
      }

      try {
        // Fetch all markets
        const accounts = await program.account.market.all();
        const positions: PositionWithMarket[] = [];

        // For each market, check user's YES/NO token balances
        for (const account of accounts) {
          const marketData = account.account as unknown as MarketAccountData;
          const market = marketToUI(account.publicKey, marketData);

          try {
            const yesMint = new PublicKey(market.yesMint);
            const noMint = new PublicKey(market.noMint);

            // Get user's associated token accounts
            const yesAta = await getAssociatedTokenAddress(yesMint, publicKey);
            const noAta = await getAssociatedTokenAddress(noMint, publicKey);

            let yesBalance = 0;
            let noBalance = 0;

            // Try to fetch YES token balance
            try {
              const yesAccount = await getAccount(connection, yesAta);
              yesBalance = Number(yesAccount.amount);
            } catch {
              // Account doesn't exist, balance is 0
            }

            // Try to fetch NO token balance
            try {
              const noAccount = await getAccount(connection, noAta);
              noBalance = Number(noAccount.amount);
            } catch {
              // Account doesn't exist, balance is 0
            }

            // Only include if user has a position
            if (yesBalance > 0 || noBalance > 0) {
              // Calculate estimated value based on current odds
              const totalPool = market.yesPool + market.noPool;
              const yesValue = totalPool > 0 ? (yesBalance * market.noPool) / market.yesPool : 0;
              const noValue = totalPool > 0 ? (noBalance * market.yesPool) / market.noPool : 0;

              positions.push({
                marketAddress: market.address,
                yesBalance,
                noBalance,
                yesValue,
                noValue,
                market,
              });
            }
          } catch (error) {
            console.error(`Error fetching position for market ${market.address}:`, error);
          }
        }

        return positions;
      } catch (error) {
        console.error("Error fetching user positions:", error);
        return [];
      }
    },
    enabled: !!connection && !!publicKey && !!program,
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

  return useQuery<UserPosition | null>({
    queryKey: ["userPosition", marketAddress, publicKey?.toBase58()],
    queryFn: async () => {
      if (!program || !publicKey || !marketAddress) {
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
        const totalPool = yesPool + noPool;

        return {
          marketAddress,
          yesBalance,
          noBalance,
          yesValue: totalPool > 0 ? (yesBalance * noPool) / yesPool : 0,
          noValue: totalPool > 0 ? (noBalance * yesPool) / noPool : 0,
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
