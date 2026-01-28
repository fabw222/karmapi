import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

/**
 * Market status enum matching the on-chain state
 */
export enum MarketStatus {
  Open = "open",
  Settled = "settled",
}

/**
 * Raw market account data from the chain
 */
export interface MarketAccountData {
  creator: PublicKey;
  title: string;
  description: string;
  betTokenMint: PublicKey;
  vault: PublicKey;
  yesMint: PublicKey;
  noMint: PublicKey;
  yesPool: BN;
  noPool: BN;
  expiryTimestamp: BN;
  status: { open?: object } | { settled?: object };
  outcome: boolean | null;
  bump: number;
}

/**
 * Market data formatted for UI consumption
 */
export interface MarketUI {
  address: string;
  creator: string;
  title: string;
  description: string;
  betTokenMint: string;
  vault: string;
  yesMint: string;
  noMint: string;
  yesPool: number; // in lamports/base units
  noPool: number;
  expiryTimestamp: number; // unix timestamp in seconds
  status: MarketStatus;
  outcome: boolean | null;
  // Computed fields
  totalVolume: number;
  yesOdds: number; // percentage 0-100
  noOdds: number;
  isExpired: boolean;
  isResolved: boolean;
  timeRemaining: number; // in seconds
}

/**
 * User position in a market
 */
export interface UserPosition {
  marketAddress: string;
  yesBalance: number; // token balance
  noBalance: number;
  yesValue: number; // estimated value in bet tokens
  noValue: number;
}

/**
 * Convert raw market account data to UI-friendly format
 */
export function marketToUI(
  address: PublicKey,
  data: MarketAccountData
): MarketUI {
  const yesPool = data.yesPool.toNumber();
  const noPool = data.noPool.toNumber();
  const totalVolume = yesPool + noPool;
  const expiryTimestamp = data.expiryTimestamp.toNumber();
  const now = Math.floor(Date.now() / 1000);
  const isExpired = now >= expiryTimestamp;
  const isResolved = "settled" in data.status;

  // Calculate odds (avoid division by zero)
  const yesOdds = totalVolume > 0 ? (yesPool / totalVolume) * 100 : 50;
  const noOdds = totalVolume > 0 ? (noPool / totalVolume) * 100 : 50;

  return {
    address: address.toBase58(),
    creator: data.creator.toBase58(),
    title: data.title,
    description: data.description,
    betTokenMint: data.betTokenMint.toBase58(),
    vault: data.vault.toBase58(),
    yesMint: data.yesMint.toBase58(),
    noMint: data.noMint.toBase58(),
    yesPool,
    noPool,
    expiryTimestamp,
    status: isResolved ? MarketStatus.Settled : MarketStatus.Open,
    outcome: data.outcome,
    totalVolume,
    yesOdds,
    noOdds,
    isExpired,
    isResolved,
    timeRemaining: Math.max(0, expiryTimestamp - now),
  };
}

/**
 * Format time remaining as human-readable string
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "Ended";

  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Format pool amount (lamports to SOL/tokens)
 */
export function formatPoolAmount(lamports: number, decimals: number = 9): string {
  const amount = lamports / Math.pow(10, decimals);
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(2)}M`;
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(2)}K`;
  } else {
    return amount.toFixed(2);
  }
}
