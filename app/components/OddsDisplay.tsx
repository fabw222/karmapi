"use client";

import { FC } from "react";

interface OddsDisplayProps {
  yesPool: number;
  noPool: number;
  compact?: boolean;
  tokenSymbol?: string;
  tokenDecimals?: number;
  isResolved?: boolean;
  outcome?: boolean | null;
}

export const OddsDisplay: FC<OddsDisplayProps> = ({
  yesPool,
  noPool,
  compact = false,
  tokenSymbol,
  tokenDecimals,
  isResolved = false,
  outcome,
}) => {
  const totalPool = yesPool + noPool;
  const yesOdds = totalPool > 0 ? (yesPool / totalPool) * 100 : 50;
  const noOdds = totalPool > 0 ? (noPool / totalPool) * 100 : 50;

  const symbol = tokenSymbol ?? "SOL";
  const divisor = Math.pow(10, tokenDecimals ?? 9);

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-green-500 font-medium">
          YES {yesOdds.toFixed(0)}%
        </span>
        <span className="text-gray-400">/</span>
        <span className="text-red-500 font-medium">
          NO {noOdds.toFixed(0)}%
        </span>
      </div>
    );
  }

  const yesIsWinner = isResolved && outcome === true;
  const noIsWinner = isResolved && outcome === false;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className={`font-semibold text-lg flex items-center gap-2 ${isResolved && !yesIsWinner ? "text-green-500/40" : "text-green-500"} ${yesIsWinner ? "font-bold" : ""}`}>
          YES
          {yesIsWinner && (
            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-medium">
              Winner
            </span>
          )}
        </span>
        <span className={`font-bold text-xl ${isResolved && !yesIsWinner ? "text-green-500/40" : "text-green-500"}`}>
          {yesOdds.toFixed(1)}%
        </span>
      </div>
      <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${isResolved && !yesIsWinner ? "bg-gradient-to-r from-green-500/40 to-green-400/40" : "bg-gradient-to-r from-green-500 to-green-400"}`}
          style={{ width: `${yesOdds}%` }}
        />
      </div>
      <div className="flex justify-between items-center">
        <span className={`font-semibold text-lg flex items-center gap-2 ${isResolved && !noIsWinner ? "text-red-500/40" : "text-red-500"} ${noIsWinner ? "font-bold" : ""}`}>
          NO
          {noIsWinner && (
            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-medium">
              Winner
            </span>
          )}
        </span>
        <span className={`font-bold text-xl ${isResolved && !noIsWinner ? "text-red-500/40" : "text-red-500"}`}>
          {noOdds.toFixed(1)}%
        </span>
      </div>
      <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${isResolved && !noIsWinner ? "bg-gradient-to-r from-red-500/40 to-red-400/40" : "bg-gradient-to-r from-red-500 to-red-400"}`}
          style={{ width: `${noOdds}%` }}
        />
      </div>
      <div className="flex justify-between text-sm text-gray-400 mt-2">
        <span>{isResolved ? "YES Volume" : "YES Pool"}: {(yesPool / divisor).toFixed(2)} {symbol}</span>
        <span>{isResolved ? "NO  Volume" : "NO Pool"}: {(noPool / divisor).toFixed(2)} {symbol}</span>
      </div>
    </div>
  );
};
