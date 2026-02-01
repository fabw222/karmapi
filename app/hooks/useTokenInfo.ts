import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { NATIVE_MINT } from "@solana/spl-token";
import { useCluster } from "@/providers/ClusterProvider";

export interface TokenInfo {
  decimals: number;
  symbol: string;
  name: string;
  logoURI?: string;
}

const WSOL_INFO: TokenInfo = {
  decimals: 9,
  symbol: "SOL",
  name: "Wrapped SOL",
};

/**
 * Returns the display symbol for a token, falling back to a truncated address.
 */
export function tokenDisplaySymbol(
  info: TokenInfo | null | undefined,
  mint?: string
): string {
  if (info?.symbol) return info.symbol;
  if (mint) return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
  return "???";
}

/**
 * Fetch metadata for a single SPL token mint.
 * Fast path for wSOL (NATIVE_MINT): returns hardcoded info with no RPC call.
 */
export function useTokenInfo(mint: string | undefined | null) {
  const { connection } = useConnection();
  const { cluster } = useCluster();

  return useQuery<TokenInfo | null>({
    queryKey: ["tokenInfo", cluster, mint],
    queryFn: async () => {
      if (!mint) return null;

      // Fast path for wrapped SOL
      if (mint === NATIVE_MINT.toBase58()) {
        return WSOL_INFO;
      }

      const pubkey = new PublicKey(mint);

      // Fire both fetches in parallel — they are independent
      const [decimalsResult, jupiterResult] = await Promise.allSettled([
        connection.getParsedAccountInfo(pubkey),
        fetch(`https://tokens.jup.ag/token/${mint}`),
      ]);

      let decimals = 9; // default fallback
      if (decimalsResult.status === "fulfilled") {
        const parsed = (decimalsResult.value.value?.data as { parsed?: { info?: { decimals?: number } } })?.parsed;
        if (parsed?.info?.decimals !== undefined) {
          decimals = parsed.info.decimals;
        }
      } else {
        console.warn("Failed to fetch mint account info:", decimalsResult.reason);
      }

      let symbol = "";
      let name = "";
      let logoURI: string | undefined;
      if (jupiterResult.status === "fulfilled" && jupiterResult.value.ok) {
        const data = await jupiterResult.value.json();
        symbol = data.symbol || "";
        name = data.name || "";
        logoURI = data.logoURI || undefined;
      } else if (jupiterResult.status === "rejected") {
        console.warn("Failed to fetch token metadata from Jupiter:", jupiterResult.reason);
      }

      return { decimals, symbol, name, logoURI };
    },
    enabled: !!mint && !!connection,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
