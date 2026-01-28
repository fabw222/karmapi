import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { PROGRAM_ID } from "@/providers/AnchorProvider";

/**
 * Derives the Market PDA from creator, bet token mint, and expiry timestamp
 */
export function deriveMarketPDA(
  creator: PublicKey,
  betTokenMint: PublicKey,
  expiryTimestamp: BN | number
): [PublicKey, number] {
  const expiryBN = typeof expiryTimestamp === "number"
    ? new BN(expiryTimestamp)
    : expiryTimestamp;

  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      creator.toBuffer(),
      betTokenMint.toBuffer(),
      expiryBN.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
}

/**
 * Derives the YES Mint PDA from market address
 */
export function deriveYesMintPDA(market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("yes_mint"), market.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derives the NO Mint PDA from market address
 */
export function deriveNoMintPDA(market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("no_mint"), market.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derives the Vault PDA from market address
 */
export function deriveVaultPDA(market: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), market.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Derives all market-related PDAs at once
 */
export function deriveAllMarketPDAs(
  creator: PublicKey,
  betTokenMint: PublicKey,
  expiryTimestamp: BN | number
): {
  market: PublicKey;
  marketBump: number;
  yesMint: PublicKey;
  yesMintBump: number;
  noMint: PublicKey;
  noMintBump: number;
  vault: PublicKey;
  vaultBump: number;
} {
  const [market, marketBump] = deriveMarketPDA(creator, betTokenMint, expiryTimestamp);
  const [yesMint, yesMintBump] = deriveYesMintPDA(market);
  const [noMint, noMintBump] = deriveNoMintPDA(market);
  const [vault, vaultBump] = deriveVaultPDA(market);

  return {
    market,
    marketBump,
    yesMint,
    yesMintBump,
    noMint,
    noMintBump,
    vault,
    vaultBump,
  };
}
