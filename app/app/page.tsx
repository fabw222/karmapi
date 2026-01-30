"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { MarketCard } from "@/components/MarketCard";
import { useMarkets } from "@/hooks/useMarkets";
import { MarketUI, formatPoolAmount } from "@/types/market";

type SortOption = "volume" | "ending" | "newest";

export default function Home() {
  const { data: marketsData, isLoading, error } = useMarkets();
  const [sortBy, setSortBy] = useState<SortOption>("volume");
  const [showResolved, setShowResolved] = useState(false);

  const markets = useMemo(() => {
    if (!marketsData) return [];

    let filtered = [...marketsData];

    // Filter resolved markets
    if (!showResolved) {
      filtered = filtered.filter((m) => !m.isResolved);
    }

    // Sort markets
    switch (sortBy) {
      case "volume":
        filtered.sort((a, b) => b.totalVolume - a.totalVolume);
        break;
      case "ending":
        filtered.sort((a, b) => a.expiryTimestamp - b.expiryTimestamp);
        break;
      case "newest":
        filtered.sort((a, b) => b.expiryTimestamp - a.expiryTimestamp);
        break;
    }

    return filtered;
  }, [marketsData, sortBy, showResolved]);

  // Calculate stats
  const totalVolume = marketsData?.reduce((sum, m) => sum + m.totalVolume, 0) || 0;
  const activeMarketsCount = marketsData?.filter((m) => !m.isResolved).length || 0;

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
            The first Token-based prediction market, built on the SOL and Sonic SVM
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
            <p className="text-3xl font-bold text-white mt-1">
              {isLoading ? "..." : formatPoolAmount(totalVolume)} SOL
            </p>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Active Markets</p>
            <p className="text-3xl font-bold text-white mt-1">
              {isLoading ? "..." : activeMarketsCount}
            </p>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Markets</p>
            <p className="text-3xl font-bold text-white mt-1">
              {isLoading ? "..." : marketsData?.length || 0}
            </p>
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

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-gray-800 rounded-xl p-6 border border-gray-700 animate-pulse"
                >
                  <div className="h-6 bg-gray-700 rounded w-3/4 mb-4"></div>
                  <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
                  <div className="h-4 bg-gray-700 rounded w-1/3"></div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12 bg-gray-800 rounded-xl border border-gray-700">
              <p className="text-red-400">
                Error loading markets. Please try again.
              </p>
            </div>
          ) : markets.length === 0 ? (
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
                <MarketCard key={market.address} market={market} />
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
