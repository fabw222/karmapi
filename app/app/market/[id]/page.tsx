"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { OddsDisplay } from "@/components/OddsDisplay";
import { BetPanel } from "@/components/BetPanel";
import { useMarket } from "@/hooks/useMarket";
import { useSettleMarket } from "@/hooks/useSettleMarket";
import { useRedeem } from "@/hooks/useRedeem";
import { useUserPosition } from "@/hooks/useUserPositions";
import { formatPoolAmount, formatTimeRemaining } from "@/types/market";

export default function MarketPage() {
  const params = useParams();
  const marketId = params.id as string;
  const { publicKey } = useWallet();
  const { data: market, isLoading, refetch } = useMarket(marketId);
  const { data: userPosition } = useUserPosition(marketId);
  const { settleMarket, isLoading: isSettling, error: settleError } = useSettleMarket();
  const { redeem, isLoading: isRedeeming, error: redeemError } = useRedeem();
  const [settleOutcome, setSettleOutcome] = useState<boolean>(true);

  const handleBetPlaced = () => {
    refetch();
  };

  const handleSettle = async (outcome: boolean) => {
    const result = await settleMarket({ marketAddress: marketId, outcome });
    if (result) {
      refetch();
    }
  };

  const handleRedeem = async () => {
    if (!userPosition) return;

    const winningBalance = market?.outcome
      ? userPosition.yesBalance
      : userPosition.noBalance;

    if (winningBalance > 0) {
      const result = await redeem({ marketAddress: marketId, amount: winningBalance });
      if (result) {
        refetch();
      }
    }
  };

  const isCreator = publicKey && market && publicKey.toBase58() === market.creator;
  const hasWinningPosition = userPosition && market?.isResolved && market.outcome !== null && (
    (market.outcome && userPosition.yesBalance > 0) ||
    (!market.outcome && userPosition.noBalance > 0)
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-800 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-800 rounded w-1/2 mb-8"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="h-48 bg-gray-800 rounded-xl"></div>
                <div className="h-32 bg-gray-800 rounded-xl"></div>
              </div>
              <div className="h-96 bg-gray-800 rounded-xl"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Header />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-16">
            <h1 className="text-2xl font-bold text-white mb-4">
              Market Not Found
            </h1>
            <p className="text-gray-400 mb-6">
              The market you&apos;re looking for doesn&apos;t exist or has been
              removed.
            </p>
            <Link
              href="/"
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
            >
              Back to Markets
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            href="/"
            className="text-purple-400 hover:text-purple-300 transition-colors"
          >
            &larr; Back to Markets
          </Link>
        </div>

        {/* Market Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="text-3xl font-bold text-white">{market.title}</h1>
            {market.isResolved ? (
              <span
                className={`px-4 py-2 rounded-full text-sm font-medium ${
                  market.outcome
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                Resolved: {market.outcome ? "YES" : "NO"}
              </span>
            ) : market.isExpired ? (
              <span className="px-4 py-2 rounded-full text-sm font-medium bg-yellow-500/20 text-yellow-400">
                Pending Resolution
              </span>
            ) : (
              <span className="px-4 py-2 rounded-full text-sm font-medium bg-purple-500/20 text-purple-400">
                Active
              </span>
            )}
          </div>
          <p className="text-gray-400">{market.description}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Market Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Odds Display */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-xl font-bold text-white mb-4">
                Current Odds
              </h3>
              <OddsDisplay yesPool={market.yesPool} noPool={market.noPool} />
            </div>

            {/* Market Details */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-xl font-bold text-white mb-4">
                Market Details
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between py-3 border-b border-gray-700">
                  <span className="text-gray-400">Total Volume</span>
                  <span className="text-white font-medium">
                    {formatPoolAmount(market.totalVolume)} SOL
                  </span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-700">
                  <span className="text-gray-400">Time Remaining</span>
                  <span className="text-white font-medium">
                    {market.isResolved
                      ? "Resolved"
                      : market.isExpired
                        ? "Ended"
                        : formatTimeRemaining(market.timeRemaining)}
                  </span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-700">
                  <span className="text-gray-400">End Date</span>
                  <span className="text-white font-medium">
                    {new Date(market.expiryTimestamp * 1000).toLocaleDateString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-gray-400">Creator</span>
                  <span className="text-white font-mono text-sm">
                    {market.creator.slice(0, 4)}...{market.creator.slice(-4)}
                  </span>
                </div>
              </div>
            </div>

            {/* Activity Feed (Placeholder) */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-xl font-bold text-white mb-4">
                Recent Activity
              </h3>
              <div className="space-y-3">
                <ActivityItem
                  type="bet"
                  side="yes"
                  amount={0.5}
                  user="9WzD...hUqS"
                  time="2 hours ago"
                />
                <ActivityItem
                  type="bet"
                  side="no"
                  amount={1.2}
                  user="7xKX...gAsU"
                  time="5 hours ago"
                />
                <ActivityItem
                  type="bet"
                  side="yes"
                  amount={2.0}
                  user="3mKL...pQrT"
                  time="1 day ago"
                />
              </div>
            </div>
          </div>

          {/* Right Column - Bet Panel */}
          <div className="lg:col-span-1 space-y-6">
            {market.isResolved ? (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">
                  Market Resolved
                </h3>
                <div
                  className={`text-center py-8 rounded-lg ${
                    market.outcome ? "bg-green-500/20" : "bg-red-500/20"
                  }`}
                >
                  <p
                    className={`text-4xl font-bold ${market.outcome ? "text-green-400" : "text-red-400"}`}
                  >
                    {market.outcome ? "YES" : "NO"}
                  </p>
                  <p className="text-gray-400 mt-2">
                    This market has been resolved
                  </p>
                </div>
                {hasWinningPosition && (
                  <>
                    {redeemError && (
                      <div className="mt-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
                        {redeemError}
                      </div>
                    )}
                    <button
                      onClick={handleRedeem}
                      disabled={isRedeeming}
                      className="w-full mt-6 py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/50 rounded-lg font-semibold text-white transition-all disabled:cursor-not-allowed"
                    >
                      {isRedeeming ? "Claiming..." : "Claim Winnings"}
                    </button>
                  </>
                )}
              </div>
            ) : market.isExpired ? (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">
                  Market Ended
                </h3>
                <div className="text-center py-8 rounded-lg bg-yellow-500/20">
                  <p className="text-yellow-400">
                    Waiting for creator to resolve this market
                  </p>
                </div>
                {isCreator && (
                  <div className="mt-6 space-y-4">
                    <p className="text-gray-400 text-sm">
                      As the market creator, you can settle this market:
                    </p>
                    {settleError && (
                      <div className="p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
                        {settleError}
                      </div>
                    )}
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleSettle(true)}
                        disabled={isSettling}
                        className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 rounded-lg font-semibold text-white transition-all disabled:cursor-not-allowed"
                      >
                        {isSettling ? "..." : "Settle YES"}
                      </button>
                      <button
                        onClick={() => handleSettle(false)}
                        disabled={isSettling}
                        className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 rounded-lg font-semibold text-white transition-all disabled:cursor-not-allowed"
                      >
                        {isSettling ? "..." : "Settle NO"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <BetPanel
                marketAddress={market.address}
                betTokenMint={market.betTokenMint}
                yesPool={market.yesPool}
                noPool={market.noPool}
                onBetPlaced={handleBetPlaced}
              />
            )}

            {/* User Position */}
            {userPosition && (userPosition.yesBalance > 0 || userPosition.noBalance > 0) && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-bold text-white mb-4">
                  Your Position
                </h3>
                <div className="space-y-3">
                  {userPosition.yesBalance > 0 && (
                    <div className="flex justify-between">
                      <span className="text-green-400">YES Tokens</span>
                      <span className="text-white font-medium">
                        {formatPoolAmount(userPosition.yesBalance)}
                      </span>
                    </div>
                  )}
                  {userPosition.noBalance > 0 && (
                    <div className="flex justify-between">
                      <span className="text-red-400">NO Tokens</span>
                      <span className="text-white font-medium">
                        {formatPoolAmount(userPosition.noBalance)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// Header Component
function Header() {
  return (
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
              className="text-gray-400 hover:text-white transition-colors"
            >
              Portfolio
            </Link>
          </nav>
          <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 !rounded-lg" />
        </div>
      </div>
    </header>
  );
}

// Activity Item Component
function ActivityItem({
  type,
  side,
  amount,
  user,
  time,
}: {
  type: string;
  side: "yes" | "no";
  amount: number;
  user: string;
  time: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <div
          className={`w-2 h-2 rounded-full ${side === "yes" ? "bg-green-500" : "bg-red-500"}`}
        />
        <span className="text-white font-mono text-sm">{user}</span>
        <span className="text-gray-400 text-sm">
          bet {amount} SOL on{" "}
          <span className={side === "yes" ? "text-green-400" : "text-red-400"}>
            {side.toUpperCase()}
          </span>
        </span>
      </div>
      <span className="text-gray-500 text-sm">{time}</span>
    </div>
  );
}
