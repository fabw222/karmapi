import { QueryClient } from "@tanstack/react-query";

/**
 * Invalidate all market-related queries after a mutation.
 * Covers: markets list, single market, user positions, and token balance.
 */
export async function invalidateMarketQueries(
  queryClient: QueryClient,
  cluster: string,
  marketAddress?: string
): Promise<void> {
  const promises: Promise<void>[] = [
    queryClient.invalidateQueries({ queryKey: ["markets", cluster] }),
    queryClient.invalidateQueries({ queryKey: ["userPositions", cluster] }),
  ];

  if (marketAddress) {
    promises.push(
      queryClient.invalidateQueries({
        queryKey: ["market", cluster, marketAddress],
      }),
      queryClient.invalidateQueries({
        queryKey: ["userPosition", cluster, marketAddress],
      })
    );
  }

  // Also invalidate token balances since they change after bets/redeems
  promises.push(
    queryClient.invalidateQueries({ queryKey: ["tokenBalance", cluster] })
  );

  await Promise.all(promises);
}
