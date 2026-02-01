/**
 * Error parsing utilities for Anchor programs and Solana transactions.
 */

// Anchor error codes from programs/market-factory/src/error.rs
// Anchor custom errors start at 6000
export const ANCHOR_ERROR_MAP: Record<number, string> = {
  6000: "Expiry timestamp must be in the future",
  6001: "Title exceeds maximum length of 128 characters",
  6002: "Description exceeds maximum length of 512 characters",
  6003: "Market is not open",
  6004: "Market has expired",
  6005: "Invalid bet token",
  6006: "Invalid mint",
  6007: "Invalid vault",
  6008: "Bet amount must be positive",
  6009: "Arithmetic overflow",
  6010: "Only the market creator can settle this market",
  6011: "Market has already been settled",
  6012: "Market has not expired yet",
  6013: "Market not settled yet",
  6014: "Wrong mint for redemption",
  6015: "Amount must be positive",
  6016: "No winning bets to redeem against",
  6017: "Vault is empty",
  6018: "Payout amount is too small",
};

const MAX_MESSAGE_LENGTH = 256;

function truncate(msg: string): string {
  return msg.length > MAX_MESSAGE_LENGTH
    ? msg.slice(0, MAX_MESSAGE_LENGTH) + "..."
    : msg;
}

/**
 * Extract a human-readable message from a transaction error.
 * Handles Anchor error codes, wallet rejection, timeouts, blockhash expiry,
 * rate limiting, and generic failures.
 */
export function parseTransactionError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "An unknown error occurred";
  }

  const msg = err.message;

  // Wallet rejection (Phantom, Solflare, etc.)
  if (
    msg.includes("User rejected") ||
    msg.includes("Transaction rejected") ||
    msg.includes("user rejected")
  ) {
    return "Transaction was rejected by the wallet";
  }

  // Blockhash expired
  if (
    msg.includes("Blockhash not found") ||
    msg.includes("block height exceeded")
  ) {
    return "Transaction expired. Please try again.";
  }

  // Rate limiting
  if (msg.includes("429") || msg.includes("Too Many Requests")) {
    return "RPC rate limit reached. Please wait a moment and try again.";
  }

  // Timeout
  if (msg.includes("timeout") || msg.includes("Timeout") || msg.includes("ETIMEDOUT")) {
    return "Request timed out. The RPC endpoint may be overloaded.";
  }

  // Network errors
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("ECONNREFUSED")) {
    return "Network error. Please check your connection and try again.";
  }

  // Anchor custom error code in message (e.g., "custom program error: 0x1770")
  const hexMatch = msg.match(/custom program error:\s*0x([0-9a-fA-F]+)/);
  if (hexMatch) {
    const code = parseInt(hexMatch[1], 16);
    const mapped = ANCHOR_ERROR_MAP[code];
    if (mapped) return mapped;
    return `Program error (code ${code})`;
  }

  // Anchor error code in JSON (e.g., {"Custom":6003})
  const customMatch = msg.match(/"Custom"\s*:\s*(\d+)/);
  if (customMatch) {
    const code = parseInt(customMatch[1], 10);
    const mapped = ANCHOR_ERROR_MAP[code];
    if (mapped) return mapped;
    return `Program error (code ${code})`;
  }

  // Anchor error in logs (e.g., "Error Code: MarketExpired")
  const anchorNameMatch = msg.match(/Error Code:\s*(\w+)/);
  if (anchorNameMatch) {
    // Try to find by name in our known errors
    const name = anchorNameMatch[1];
    const knownNames: Record<string, string> = {
      ExpiryInPast: ANCHOR_ERROR_MAP[6000],
      TitleTooLong: ANCHOR_ERROR_MAP[6001],
      DescriptionTooLong: ANCHOR_ERROR_MAP[6002],
      MarketNotOpen: ANCHOR_ERROR_MAP[6003],
      MarketExpired: ANCHOR_ERROR_MAP[6004],
      InvalidBetToken: ANCHOR_ERROR_MAP[6005],
      InvalidMint: ANCHOR_ERROR_MAP[6006],
      InvalidVault: ANCHOR_ERROR_MAP[6007],
      InvalidBetAmount: ANCHOR_ERROR_MAP[6008],
      ArithmeticOverflow: ANCHOR_ERROR_MAP[6009],
      Unauthorized: ANCHOR_ERROR_MAP[6010],
      AlreadySettled: ANCHOR_ERROR_MAP[6011],
      MarketNotExpired: ANCHOR_ERROR_MAP[6012],
      NotSettled: ANCHOR_ERROR_MAP[6013],
      WrongMint: ANCHOR_ERROR_MAP[6014],
      InvalidAmount: ANCHOR_ERROR_MAP[6015],
      NoWinningBets: ANCHOR_ERROR_MAP[6016],
      VaultEmpty: ANCHOR_ERROR_MAP[6017],
      PayoutTooSmall: ANCHOR_ERROR_MAP[6018],
    };
    if (knownNames[name]) return knownNames[name];
  }

  // Insufficient SOL / token balance (our own throws)
  if (msg.startsWith("Insufficient")) {
    return truncate(msg);
  }

  // Account not found
  if (msg.includes("Account does not exist") || msg.includes("could not find account")) {
    return "Account not found on chain";
  }

  // Generic — truncate and return
  return truncate(msg);
}

/**
 * Parse simulation errors with additional log context.
 */
export function parseSimulationError(err: unknown, logs?: string[] | null): string {
  // Try to extract anchor error from logs first
  if (logs && logs.length > 0) {
    for (const log of logs) {
      const hexMatch = log.match(/custom program error:\s*0x([0-9a-fA-F]+)/i);
      if (hexMatch) {
        const code = parseInt(hexMatch[1], 16);
        const mapped = ANCHOR_ERROR_MAP[code];
        if (mapped) return `Simulation failed: ${mapped}`;
      }
      const nameMatch = log.match(/Error Code:\s*(\w+)/);
      if (nameMatch) {
        // The next log line usually has the message, but we can also look it up
        const parsed = parseTransactionError(new Error(log));
        if (parsed !== truncate(log)) return `Simulation failed: ${parsed}`;
      }
    }
  }

  const base = parseTransactionError(err);
  return `Simulation failed: ${base}`;
}

/**
 * Structured logger for hook errors. Replaces ad-hoc console.error calls.
 */
export function logError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  const payload: Record<string, unknown> = {
    context: `[${context}]`,
    timestamp,
    message,
    ...extra,
  };

  if (error instanceof Error && error.stack) {
    payload.stack = error.stack;
  }

  console.error(`[${context}] ${timestamp}:`, message, extra ?? "", error);
}
