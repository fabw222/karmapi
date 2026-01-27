"use client";

import { FC } from "react";

interface OddsDisplayProps {
  yesPool: number;
  noPool: number;
  compact?: boolean;
}

export const OddsDisplay: FC<OddsDisplayProps> = ({
  yesPool,
  noPool,
  compact = false,
}) => {
  const totalPool = yesPool + noPool;
  const yesOdds = totalPool > 0 ? (yesPool / totalPool) * 100 : 50;
  const noOdds = totalPool > 0 ? (noPool / totalPool) * 100 : 50;

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

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-green-500 font-semibold text-lg">YES</span>
        <span className="text-green-500 font-bold text-xl">
          {yesOdds.toFixed(1)}%
        </span>
      </div>
      <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-300"
          style={{ width: `${yesOdds}%` }}
        />
      </div>
      <div className="flex justify-between items-center">
        <span className="text-red-500 font-semibold text-lg">NO</span>
        <span className="text-red-500 font-bold text-xl">
          {noOdds.toFixed(1)}%
        </span>
      </div>
      <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-300"
          style={{ width: `${noOdds}%` }}
        />
      </div>
      <div className="flex justify-between text-sm text-gray-400 mt-2">
        <span>Pool: {(yesPool / 1e9).toFixed(2)} SOL</span>
        <span>Pool: {(noPool / 1e9).toFixed(2)} SOL</span>
      </div>
    </div>
  );
};
