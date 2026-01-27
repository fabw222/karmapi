"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { MarketCard } from "@/components/MarketCard";

// Mock data for markets - will be replaced with actual data from chain
const mockMarkets = [
  {
    id: "market_1",
    question: "Will Bitcoin reach $100,000 by end of 2024?",
    description:
      "This market resolves YES if Bitcoin (BTC) price reaches or exceeds $100,000 USD on any major exchange before December 31, 2024 11:59 PM UTC.",
    yesPool: 5_000_000_000, // 5 SOL in lamports
    noPool: 3_000_000_000, // 3 SOL in lamports
    endTime: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days from now
    resolved: false,
  },
  {
    id: "market_2",
    question: "Will Solana process over 100,000 TPS in 2024?",
    description:
      "This market resolves YES if Solana mainnet demonstrates sustained throughput of 100,000 transactions per second for at least 1 hour, as verified by official Solana metrics.",
    yesPool: 2_000_000_000, // 2 SOL
    noPool: 8_000_000_000, // 8 SOL
    endTime: Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60, // 60 days from now
    resolved: false,
  },
  {
    id: "market_3",
    question: "Will there be a US spot ETH ETF by Q1 2025?",
    description:
      "This market resolves YES if the SEC approves at least one spot Ethereum ETF for trading in the United States before March 31, 2025.",
    yesPool: 10_000_000_000, // 10 SOL
    noPool: 5_000_000_000, // 5 SOL
    endTime: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60, // 90 days from now
    resolved: false,
  },
  {
    id: "market_4",
    question: "Will OpenAI release GPT-5 in 2024?",
    description:
      "This market resolves YES if OpenAI publicly announces and releases GPT-5 (or equivalent successor model) before December 31, 2024.",
    yesPool: 1_500_000_000, // 1.5 SOL
    noPool: 4_500_000_000, // 4.5 SOL
    endTime: Math.floor(Date.now() / 1000) + 45 * 24 * 60 * 60, // 45 days from now
    resolved: false,
  },
  {
    id: "market_5",
    question: "Will ETH flip BTC in market cap by 2025?",
    description:
      "This market resolves YES if Ethereum's total market capitalization exceeds Bitcoin's at any point before January 1, 2026, as measured by CoinGecko.",
    yesPool: 500_000_000, // 0.5 SOL
    noPool: 9_500_000_000, // 9.5 SOL
    endTime: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year from now
    resolved: false,
  },
  {
    id: "market_6",
    question: "Resolved: Did Fed cut rates in Sept 2024?",
    description:
      "This market resolved YES as the Federal Reserve cut interest rates by 50 basis points in September 2024.",
    yesPool: 7_000_000_000, // 7 SOL
    noPool: 3_000_000_000, // 3 SOL
    endTime: Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60, // 30 days ago
    resolved: true,
    outcome: true,
  },
];

type SortOption = "volume" | "ending" | "newest";

export default function Home() {
  const [markets, setMarkets] = useState(mockMarkets);
  const [sortBy, setSortBy] = useState<SortOption>("volume");
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    // TODO: Fetch markets from chain
    let sortedMarkets = [...mockMarkets];

    // Filter resolved markets
    if (!showResolved) {
      sortedMarkets = sortedMarkets.filter((m) => !m.resolved);
    }

    // Sort markets
    switch (sortBy) {
      case "volume":
        sortedMarkets.sort(
          (a, b) => b.yesPool + b.noPool - (a.yesPool + a.noPool)
        );
        break;
      case "ending":
        sortedMarkets.sort((a, b) => a.endTime - b.endTime);
        break;
      case "newest":
        sortedMarkets.sort((a, b) => b.endTime - a.endTime);
        break;
    }

    setMarkets(sortedMarkets);
  }, [sortBy, showResolved]);

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
                className="text-white font-medium hover:text-purple-400 transition-colors"
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
                className="text-gray-400 hover:text-white transition-colors"
              >
                Portfolio
              </Link>
            </nav>
            <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 !rounded-lg" />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Predict the Future
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Trade on real-world outcomes. Earn rewards for accurate predictions
            on the Sonic SVM.
          </p>
          <div className="flex justify-center gap-4 mt-8">
            <Link
              href="/create"
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
            >
              Create Market
            </Link>
            <a
              href="#markets"
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors border border-gray-700"
            >
              Explore Markets
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Volume</p>
            <p className="text-3xl font-bold text-white mt-1">42.5 SOL</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Active Markets</p>
            <p className="text-3xl font-bold text-white mt-1">
              {mockMarkets.filter((m) => !m.resolved).length}
            </p>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Traders</p>
            <p className="text-3xl font-bold text-white mt-1">127</p>
          </div>
        </div>

        {/* Markets Section */}
        <div id="markets">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold text-white">Markets</h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-400">
                <input
                  type="checkbox"
                  checked={showResolved}
                  onChange={(e) => setShowResolved(e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600 text-purple-600 focus:ring-purple-500"
                />
                Show Resolved
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              >
                <option value="volume">Highest Volume</option>
                <option value="ending">Ending Soon</option>
                <option value="newest">Newest</option>
              </select>
            </div>
          </div>

          {markets.length === 0 ? (
            <div className="text-center py-12 bg-gray-800 rounded-xl border border-gray-700">
              <p className="text-gray-400">
                No markets found. Create one to get started!
              </p>
              <Link
                href="/create"
                className="inline-block mt-4 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
              >
                Create Market
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {markets.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
          )}
        </div>
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
