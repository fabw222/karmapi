"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

// Mock position data - will be replaced with actual data from chain
interface Position {
  marketId: string;
  question: string;
  side: "yes" | "no";
  shares: number;
  avgPrice: number;
  currentPrice: number;
  totalInvested: number;
  potentialPayout: number;
  resolved: boolean;
  outcome?: boolean;
}

const mockPositions: Position[] = [
  {
    marketId: "market_1",
    question: "Will Bitcoin reach $100,000 by end of 2024?",
    side: "yes",
    shares: 2.5,
    avgPrice: 0.62,
    currentPrice: 0.625,
    totalInvested: 1.55,
    potentialPayout: 2.5,
    resolved: false,
  },
  {
    marketId: "market_2",
    question: "Will Solana process over 100,000 TPS in 2024?",
    side: "no",
    shares: 5.0,
    avgPrice: 0.8,
    currentPrice: 0.8,
    totalInvested: 4.0,
    potentialPayout: 5.0,
    resolved: false,
  },
  {
    marketId: "market_6",
    question: "Did Fed cut rates in Sept 2024?",
    side: "yes",
    shares: 3.0,
    avgPrice: 0.65,
    currentPrice: 1.0,
    totalInvested: 1.95,
    potentialPayout: 3.0,
    resolved: true,
    outcome: true,
  },
];

export default function PortfolioPage() {
  const { publicKey, connected } = useWallet();
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "resolved">("all");

  useEffect(() => {
    if (!connected) {
      setPositions([]);
      setIsLoading(false);
      return;
    }

    // TODO: Fetch positions from chain
    setIsLoading(true);
    setTimeout(() => {
      setPositions(mockPositions);
      setIsLoading(false);
    }, 500);
  }, [connected, publicKey]);

  const filteredPositions = positions.filter((p) => {
    if (filter === "active") return !p.resolved;
    if (filter === "resolved") return p.resolved;
    return true;
  });

  const totalValue = positions.reduce(
    (sum, p) => sum + p.shares * p.currentPrice,
    0
  );
  const totalInvested = positions.reduce((sum, p) => sum + p.totalInvested, 0);
  const totalPnL = totalValue - totalInvested;
  const claimableWinnings = positions
    .filter((p) => p.resolved && p.outcome === (p.side === "yes"))
    .reduce((sum, p) => sum + p.potentialPayout, 0);

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                KarmaPi
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-8">
              <Link
                href="/"
                className="text-gray-400 hover:text-white transition-colors"
              >
                Markets
              </Link>
              <Link
                href="/create"
                className="text-gray-400 hover:text-white transition-colors"
              >
                Create
              </Link>
              <Link
                href="/portfolio"
                className="text-white font-medium hover:text-purple-400 transition-colors"
              >
                Portfolio
              </Link>
            </nav>
            <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 !rounded-lg" />
          </div>
        </div>
      </header>

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
                  {totalValue.toFixed(2)} SOL
                </p>
              </div>
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <p className="text-gray-400 text-sm">Total Invested</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {totalInvested.toFixed(2)} SOL
                </p>
              </div>
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <p className="text-gray-400 text-sm">Unrealized P&L</p>
                <p
                  className={`text-3xl font-bold mt-1 ${totalPnL >= 0 ? "text-green-400" : "text-red-400"}`}
                >
                  {totalPnL >= 0 ? "+" : ""}
                  {totalPnL.toFixed(2)} SOL
                </p>
              </div>
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <p className="text-gray-400 text-sm">Claimable Winnings</p>
                <p className="text-3xl font-bold text-purple-400 mt-1">
                  {claimableWinnings.toFixed(2)} SOL
                </p>
                {claimableWinnings > 0 && (
                  <button className="mt-2 w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
                    Claim All
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
                        const pnl =
                          position.shares * position.currentPrice -
                          position.totalInvested;
                        const pnlPercent =
                          (pnl / position.totalInvested) * 100;
                        const isWinner =
                          position.resolved &&
                          position.outcome === (position.side === "yes");

                        return (
                          <tr
                            key={`${position.marketId}-${position.side}`}
                            className="border-b border-gray-700 last:border-0"
                          >
                            <td className="px-6 py-4">
                              <Link
                                href={`/market/${position.marketId}`}
                                className="text-white hover:text-purple-400 transition-colors line-clamp-1"
                              >
                                {position.question}
                              </Link>
                              {position.resolved && (
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full ml-2 ${
                                    isWinner
                                      ? "bg-green-500/20 text-green-400"
                                      : "bg-red-500/20 text-red-400"
                                  }`}
                                >
                                  {isWinner ? "Won" : "Lost"}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`px-3 py-1 rounded-full text-sm font-medium ${
                                  position.side === "yes"
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-red-500/20 text-red-400"
                                }`}
                              >
                                {position.side.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right text-white">
                              {position.shares.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 text-right text-white">
                              {(position.avgPrice * 100).toFixed(1)}%
                            </td>
                            <td className="px-6 py-4 text-right text-white">
                              {(position.currentPrice * 100).toFixed(1)}%
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span
                                className={
                                  pnl >= 0 ? "text-green-400" : "text-red-400"
                                }
                              >
                                {pnl >= 0 ? "+" : ""}
                                {pnl.toFixed(2)} SOL
                              </span>
                              <span
                                className={`text-sm ml-1 ${pnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}
                              >
                                ({pnlPercent >= 0 ? "+" : ""}
                                {pnlPercent.toFixed(1)}%)
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {position.resolved && isWinner ? (
                                <button className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
                                  Claim
                                </button>
                              ) : !position.resolved ? (
                                <Link
                                  href={`/market/${position.marketId}`}
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
