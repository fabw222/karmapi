"use client";

import { FC } from "react";
import Link from "next/link";
import { OddsDisplay } from "./OddsDisplay";
import { useTokenInfo, tokenDisplaySymbol } from "@/hooks/useTokenInfo";
import { MarketUI, formatPoolAmount, formatTimeRemaining } from "@/types/market";

interface MarketCardProps {
  market: MarketUI;
}

export const MarketCard: FC<MarketCardProps> = ({ market }) => {
  const { data: tokenInfo } = useTokenInfo(market.betTokenMint);
  const decimals = tokenInfo?.decimals ?? 9;
  const symbol = tokenDisplaySymbol(tokenInfo, market.betTokenMint);

  return (
    <Link href={`/market/${market.address}`}>
      <div className="bg-gray-800 rounded-xl p-6 hover:bg-gray-750 transition-all duration-200 border border-gray-700 hover:border-purple-500 cursor-pointer group">
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors line-clamp-2 flex-1">
            {market.title}
          </h3>
          {market.isResolved ? (
            <span
              className={`ml-3 px-3 py-1 rounded-full text-xs font-medium ${
                market.outcome
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {market.outcome ? "YES" : "NO"}
            </span>
          ) : market.isExpired ? (
            <span className="ml-3 px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
              Pending Resolution
            </span>
          ) : (
            <span className="ml-3 px-3 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
              Active
            </span>
          )}
        </div>

        <p className="text-gray-400 text-sm mb-4 line-clamp-2">
          {market.description}
        </p>

        <OddsDisplay
          yesPool={market.yesPool}
          noPool={market.noPool}
          compact={true}
        />

        <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-700">
          <div className="text-sm text-gray-400">
            <span className="text-purple-400 font-medium">
              {formatPoolAmount(market.totalVolume, decimals)} {symbol}
            </span>{" "}
            total
          </div>
          {!market.isResolved && !market.isExpired && (
            <div className="text-sm text-gray-400">
              <span>{formatTimeRemaining(market.timeRemaining)} left</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};
