"use client";

import { FC, useState, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { usePlaceBet, ESTIMATED_ATA_RENT, ESTIMATED_TX_FEE } from "@/hooks/usePlaceBet";
import { NATIVE_MINT } from "@solana/spl-token";
import { useTokenInfo, tokenDisplaySymbol } from "@/hooks/useTokenInfo";
import { useTokenBalance } from "@/hooks/useTokenBalance";

interface BetPanelProps {
  marketAddress: string;
  betTokenMint: string;
  yesPool: number;
  noPool: number;
  onBetPlaced?: () => void;
}

export const BetPanel: FC<BetPanelProps> = ({
  marketAddress,
  betTokenMint,
  yesPool,
  noPool,
  onBetPlaced,
}) => {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const { placeBet, isLoading, error, reset } = usePlaceBet();
  const [selectedSide, setSelectedSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");

  const { data: tokenInfo, isLoading: isTokenInfoLoading } = useTokenInfo(betTokenMint);
  const decimals = tokenInfo?.decimals ?? 9;
  const symbol = tokenDisplaySymbol(tokenInfo, betTokenMint);
  const baseUnit = Math.pow(10, decimals);

  const { data: walletBalance } = useTokenBalance(betTokenMint, decimals);

  const isNativeSol = betTokenMint === NATIVE_MINT.toBase58();
  // Worst-case reserve: 3 ATAs (YES, NO, WSOL) + tx fee
  const solReserveUi = (3 * ESTIMATED_ATA_RENT + ESTIMATED_TX_FEE) / Math.pow(10, decimals);
  const maxBetUi = walletBalance
    ? isNativeSol
      ? Math.max(0, walletBalance.uiBalance - solReserveUi)
      : walletBalance.uiBalance
    : 0;

  const totalPool = yesPool + noPool;
  const currentOdds =
    selectedSide === "yes"
      ? totalPool > 0
        ? (yesPool / totalPool) * 100
        : 50
      : totalPool > 0
        ? (noPool / totalPool) * 100
        : 50;

  // Calculate potential winnings based on CPMM formula
  const calculatePotentialWinnings = useCallback(() => {
    const betAmount = parseFloat(amount) || 0;
    if (betAmount <= 0) return 0;

    const betBaseUnits = betAmount * baseUnit;
    const currentPool = selectedSide === "yes" ? yesPool : noPool;
    const oppositePool = selectedSide === "yes" ? noPool : yesPool;

    // Simplified CPMM calculation
    // Share of pool after bet: betAmount / (currentPool + betAmount)
    // Potential winnings if this side wins: share * (currentPool + oppositePool + betAmount)
    const newPool = currentPool + betBaseUnits;
    const share = betBaseUnits / newPool;
    const totalAfterBet = newPool + oppositePool;
    const potentialReturn = share * totalAfterBet;

    return (potentialReturn / baseUnit).toFixed(4);
  }, [amount, selectedSide, yesPool, noPool, baseUnit]);

  const insufficientBalance =
    walletBalance != null &&
    amount !== "" &&
    parseFloat(amount) > (isNativeSol ? maxBetUi : walletBalance.uiBalance);

  const handlePlaceBet = async () => {
    if (!connected || !publicKey) {
      return;
    }

    const betAmount = parseFloat(amount);
    if (isNaN(betAmount) || betAmount <= 0) {
      return;
    }

    if (walletBalance && betAmount > (isNativeSol ? maxBetUi : walletBalance.uiBalance)) {
      return;
    }

    reset();

    const result = await placeBet({
      marketAddress,
      betTokenMint,
      amount: Math.floor(betAmount * baseUnit),
      side: selectedSide === "yes",
    });

    if (result) {
      setAmount("");
      onBetPlaced?.();
    }
  };


  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-xl font-bold text-white mb-4">Place Your Bet</h3>

      {!connected ? (
        <div className="text-center py-8">
          <p className="text-gray-400 mb-4">
            Connect your wallet to place bets
          </p>
          <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700" />
        </div>
      ) : (
        <>
          {/* Side Selection */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => setSelectedSide("yes")}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                selectedSide === "yes"
                  ? "bg-green-500 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              YES
            </button>
            <button
              onClick={() => setSelectedSide("no")}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                selectedSide === "no"
                  ? "bg-red-500 text-white"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              NO
            </button>
          </div>

          {/* Balance Display */}
          {walletBalance && (
            <div className="flex justify-between items-center mb-2 text-sm">
              <span className="text-gray-400">
                Balance: {walletBalance.uiBalance.toFixed(decimals <= 6 ? 2 : 4)} {symbol}
                {isNativeSol && walletBalance.uiBalance > 0 && (
                  <span className="text-gray-500 text-xs ml-1">
                    ({maxBetUi.toFixed(4)} available)
                  </span>
                )}
              </span>
              <button
                onClick={() => setAmount(maxBetUi.toString())}
                className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
              >
                Max
              </button>
            </div>
          )}

          {/* Amount Input */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">
              Amount ({symbol})
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg py-3 px-4 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          {/* Bet Summary */}
          <div className="bg-gray-900 rounded-lg p-4 mb-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Current Odds</span>
              <span
                className={
                  selectedSide === "yes" ? "text-green-400" : "text-red-400"
                }
              >
                {currentOdds.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Potential Return</span>
              <span className="text-purple-400 font-medium">
                {calculatePotentialWinnings()} {symbol}
              </span>
            </div>
          </div>

          {insufficientBalance && (
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4 text-red-400 text-sm">
              Insufficient {symbol} balance
            </div>
          )}

          {error && (
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Place Bet Button */}
          <button
            onClick={handlePlaceBet}
            disabled={isLoading || !amount || isTokenInfoLoading || insufficientBalance}
            className={`w-full py-4 rounded-lg font-semibold text-white transition-all ${
              selectedSide === "yes"
                ? "bg-green-500 hover:bg-green-600 disabled:bg-green-500/50"
                : "bg-red-500 hover:bg-red-600 disabled:bg-red-500/50"
            } disabled:cursor-not-allowed`}
          >
            {isTokenInfoLoading ? (
              "Loading token..."
            ) : isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Placing Bet...
              </span>
            ) : (
              `Bet ${selectedSide.toUpperCase()}`
            )}
          </button>
        </>
      )}
    </div>
  );
};
