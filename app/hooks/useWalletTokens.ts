import { useQuery } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useCluster } from "@/providers/ClusterProvider";

export interface WalletToken {
  mint: string;
  balance: number;
  decimals: number;
  uiBalance: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
}

interface JupiterToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

async function fetchJupiterTokens(): Promise<Map<string, JupiterToken>> {
  const map = new Map<string, JupiterToken>();
  try {
    const res = await fetch("https://tokens.jup.ag/tokens?tags=verified");
    if (!res.ok) return map;
    const tokens: JupiterToken[] = await res.json();
    for (const t of tokens) {
      map.set(t.address, t);
    }
  } catch {
    // metadata is optional — fail silently
  }
  return map;
}

export function useWalletTokens() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { cluster } = useCluster();

  return useQuery<WalletToken[]>({
    queryKey: ["walletTokens", cluster, publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey) return [];

      const [tokenAccountsResp, jupiterMap] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_PROGRAM_ID },
          "confirmed"
        ),
        fetchJupiterTokens(),
      ]);

      const tokens: WalletToken[] = [];

      for (const { account } of tokenAccountsResp.value) {
        const parsed = (account.data as { parsed?: unknown })?.parsed as
          | {
              info?: {
                mint?: string;
                tokenAmount?: {
                  amount?: string;
                  decimals?: number;
                  uiAmount?: number;
                };
              };
            }
          | undefined;

        const mint = parsed?.info?.mint;
        const amountStr = parsed?.info?.tokenAmount?.amount;
        const decimals = parsed?.info?.tokenAmount?.decimals ?? 0;
        const uiAmount = parsed?.info?.tokenAmount?.uiAmount ?? 0;

        if (!mint || !amountStr) continue;

        const balance = Number(amountStr);
        if (!Number.isFinite(balance) || balance <= 0) continue;

        const jup = jupiterMap.get(mint);

        tokens.push({
          mint,
          balance,
          decimals,
          uiBalance: uiAmount,
          symbol: jup?.symbol,
          name: jup?.name,
          logoURI: jup?.logoURI,
        });
      }

      // Sort: known tokens (with symbol) first alphabetically, then unknown by balance desc
      tokens.sort((a, b) => {
        if (a.symbol && !b.symbol) return -1;
        if (!a.symbol && b.symbol) return 1;
        if (a.symbol && b.symbol) return a.symbol.localeCompare(b.symbol);
        return b.uiBalance - a.uiBalance;
      });

      return tokens;
    },
    enabled: !!connection && !!publicKey,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}
