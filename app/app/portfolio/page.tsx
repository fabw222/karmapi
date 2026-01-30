"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Header } from "@/components/Header";
import { useUserPositions } from "@/hooks/useUserPositions";
import { useRedeem } from "@/hooks/useRedeem";
import { formatPoolAmount } from "@/types/market";

export default function PortfolioPage() {
  const { publicKey, connected } = useWallet();
  const { data: positionsData, isLoading, refetch } = useUserPositions();
  const { redeem, isLoading: isRedeeming } = useRedeem();
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");

  const positions = useMemo(() => {
    if (!positionsData) return [];
    return positionsData;
  }, [positionsData]);

  const filteredPositions = useMemo(() => {
    return positions.filter((p) => {
      if (filter === "active") return !p.market.isResolved;
      if (filter === "resolved") return p.market.isResolved;
      return true;
    });
  }, [positions, filter]);

  // Calculate portfolio stats
  const { totalValue, totalInvested, claimableWinnings } = useMemo(() => {
    let value = 0;
    let invested = 0;
    let claimable = 0;

    for (const pos of positions) {
      const yesValue = pos.yesBalance * (pos.market.noOdds / 100);
      const noValue = pos.noBalance * (pos.market.yesOdds / 100);
      value += yesValue + noValue;
      invested += pos.yesBalance + pos.noBalance;

      if (pos.market.isResolved && pos.market.outcome !== null) {
        if (pos.market.outcome && pos.yesBalance > 0) {
          claimable += pos.yesBalance;
        } else if (!pos.market.outcome && pos.noBalance > 0) {
          claimable += pos.noBalance;
        }
      }
    }

    return {
      totalValue: value,
      totalInvested: invested,
      claimableWinnings: claimable,
    };
  }, [positions]);

  const totalPnL = totalValue - totalInvested;

  const handleClaimAll = async () => {
    for (const pos of positions) {
      if (pos.market.isResolved && pos.market.outcome !== null) {
        const winningBalance = pos.market.outcome
          ? pos.yesBalance
          : pos.noBalance;
        if (winningBalance > 0) {
          await redeem({
            marketAddress: pos.marketAddress,
            amount: winningBalance,
          });
        }
      }
    }
    refetch();
  };

  return (
    <div className="min-h-screen bg-gray-900">
      <Header activeLink="portfolio" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Your Portfolio</h1>
          <p className="text-gray-400">
            Track your positions and winnings across all markets
          </p>
        </div>

        {!connected ? (
          <div className="text-center py-16 bg-gray-800 rounded-xl border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4">
              Connect Your Wallet
            </h2>
            <p className="text-gray-400 mb-6">
              Connect your wallet to view your positions and winnings
            </p>
            <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700" />
          </div>
        ) : isLoading ? (
          <div className="animate-pulse space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="h-24 bg-gray-800 rounded-xl border border-gray-700"
                ></div>
              ))}
            </div>
            <div className="h-96 bg-gray-800 rounded-xl border border-gray-700"></div>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <p className="text-gray-400 text-sm">Portfolio Value</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {formatPoolAmount(totalValue)} SOL
                </p>
              </div>
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <p className="text-gray-400 text-sm">Total Invested</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {formatPoolAmount(totalInvested)} SOL
                </p>
              </div>
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <p className="text-gray-400 text-sm">Unrealized P&L</p>
                <p
                  className={`text-3xl font-bold mt-1 ${
                    totalPnL >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {totalPnL >= 0 ? "+" : ""}
                  {formatPoolAmount(totalPnL)} SOL
                </p>
              </div>
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <p className="text-gray-400 text-sm">Claimable Winnings</p>
                <p className="text-3xl font-bold text-purple-400 mt-1">
                  {formatPoolAmount(claimableWinnings)} SOL
                </p>
                {claimableWinnings > 0 && (
                  <button
                    onClick={handleClaimAll}
                    disabled={isRedeeming}
                    className="mt-2 w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    {isRedeeming ? "Claiming..." : "Claim All"}
                  </button>
                )}
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-6">
              {(["all", "active", "resolved"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filter === f
                      ? "bg-purple-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {/* Positions Table */}
            {filteredPositions.length === 0 ? (
              <div className="text-center py-16 bg-gray-800 rounded-xl border border-gray-700">
                <p className="text-gray-400 mb-4">
                  {filter === "all"
                    ? "You have no positions yet"
                    : `No ${filter} positions`}
                </p>
                <Link
                  href="/"
                  className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Explore Markets
                </Link>
              </div>
            ) : (
              <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left text-sm font-medium text-gray-400 px-6 py-4">
                          Market
                        </th>
                        <th className="text-left text-sm font-medium text-gray-400 px-6 py-4">
                          Position
                        </th>
                        <th className="text-right text-sm font-medium text-gray-400 px-6 py-4">
                          Shares
                        </th>
                        <th className="text-right text-sm font-medium text-gray-400 px-6 py-4">
                          Avg Price
                        </th>
                        <th className="text-right text-sm font-medium text-gray-400 px-6 py-4">
                          Current
                        </th>
                        <th className="text-right text-sm font-medium text-gray-400 px-6 py-4">
                          P&L
                        </th>
                        <th className="text-right text-sm font-medium text-gray-400 px-6 py-4">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPositions.map((position) => {
                        const hasYes = position.yesBalance > 0;
                        const hasNo = position.noBalance > 0;
                        const hasPosition = hasYes || hasNo;
                        const totalShares =
                          position.yesBalance + position.noBalance;
                        const estimatedValue =
                          position.yesValue + position.noValue;
                        const pnl = estimatedValue - totalShares;
                        const pnlPercent =
                          totalShares > 0 ? (pnl / totalShares) * 100 : 0;

                        const isWinner =
                          hasPosition &&
                          position.market.isResolved &&
                          position.market.outcome !== null &&
                          ((position.market.outcome && hasYes) ||
                            (!position.market.outcome && hasNo));

                        return (
                          <tr
                            key={position.marketAddress}
                            className="border-b border-gray-700 last:border-0"
                          >
                            <td className="px-6 py-4">
                              <Link
                                href={`/market/${position.marketAddress}`}
                                className="text-white hover:text-purple-400 transition-colors line-clamp-1"
                              >
                                {position.market.title}
                              </Link>
                              {position.market.isResolved && hasPosition ? (
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full ml-2 ${
                                    isWinner
                                      ? "bg-green-500/20 text-green-400"
                                      : "bg-red-500/20 text-red-400"
                                  }`}
                                >
                                  {isWinner ? "Won" : "Lost"}
                                </span>
                              ) : position.market.isResolved ? (
                                <span className="text-xs px-2 py-0.5 rounded-full ml-2 bg-gray-500/20 text-gray-300">
                                  Resolved
                                </span>
                              ) : null}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-2">
                                {hasYes && (
                                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-500/20 text-green-400">
                                    YES
                                  </span>
                                )}
                                {hasNo && (
                                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-500/20 text-red-400">
                                    NO
                                  </span>
                                )}
                                {!hasYes && !hasNo && (
                                  <span className="text-gray-500 text-sm">
                                    -
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right text-white">
                              {formatPoolAmount(totalShares)}
                            </td>
                            <td className="px-6 py-4 text-right text-white">
                              -
                            </td>
                            <td className="px-6 py-4 text-right text-white">
                              {hasYes && (
                                <div>{position.market.yesOdds.toFixed(1)}%</div>
                              )}
                              {hasNo && (
                                <div>{position.market.noOdds.toFixed(1)}%</div>
                              )}
                              {!hasYes && !hasNo && <div>-</div>}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span
                                className={
                                  pnl >= 0 ? "text-green-400" : "text-red-400"
                                }
                              >
                                {pnl >= 0 ? "+" : ""}
                                {formatPoolAmount(pnl)} SOL
                              </span>
                              <span
                                className={`text-sm ml-1 ${
                                  pnlPercent >= 0
                                    ? "text-green-400"
                                    : "text-red-400"
                                }`}
                              >
                                ({pnlPercent >= 0 ? "+" : ""}
                                {pnlPercent.toFixed(1)}%)
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {position.market.isResolved && isWinner ? (
                                <button
                                  onClick={() => {
                                    const winningBalance = position.market
                                      .outcome
                                      ? position.yesBalance
                                      : position.noBalance;
                                    redeem({
                                      marketAddress: position.marketAddress,
                                      amount: winningBalance,
                                    });
                                  }}
                                  disabled={isRedeeming}
                                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 text-white text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                                >
                                  {isRedeeming ? "..." : "Claim"}
                                </button>
                              ) : !position.market.isResolved ? (
                                <Link
                                  href={`/market/${position.marketAddress}`}
                                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors inline-block"
                                >
                                  Trade
                                </Link>
                              ) : (
                                <span className="text-gray-500 text-sm">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-400 text-sm">
              Built on Sonic SVM | Powered by Karma
            </p>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a href="#" className="hover:text-white transition-colors">
                Docs
              </a>
              <a href="#" className="hover:text-white transition-colors">
                GitHub
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Twitter
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
