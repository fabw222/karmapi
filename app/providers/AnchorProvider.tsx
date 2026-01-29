"use client";

import {
  createContext,
  useContext,
  useMemo,
  FC,
  ReactNode,
} from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "@/idl/market_factory.json";
import { MarketFactory } from "@/types/market_factory";

const IDL = idl as Idl;
const DEFAULT_PROGRAM_ID = new PublicKey(IDL.address);
const ENV_PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID;
const PROGRAM_ID = (() => {
  if (!ENV_PROGRAM_ID) return DEFAULT_PROGRAM_ID;
  try {
    return new PublicKey(ENV_PROGRAM_ID);
  } catch (err) {
    console.warn("Invalid NEXT_PUBLIC_PROGRAM_ID, falling back to IDL.address", err);
    return DEFAULT_PROGRAM_ID;
  }
})();

// Debug: Log program ID on load (development only)
if (process.env.NODE_ENV === "development") {
  console.log("=== Anchor Provider Init ===");
  console.log("IDL.address:", IDL.address);
  console.log("PROGRAM_ID from env:", ENV_PROGRAM_ID);
  console.log("PROGRAM_ID used:", PROGRAM_ID.toBase58());
  console.log("RPC URL:", process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
  console.log("===========================");
}

interface AnchorContextType {
  program: Program<MarketFactory> | null;
  provider: AnchorProvider | null;
  programId: PublicKey;
}

const AnchorContext = createContext<AnchorContextType>({
  program: null,
  provider: null,
  programId: PROGRAM_ID,
});

export const AnchorContextProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { connection } = useConnection();
  const wallet = useWallet();

  const { provider, program } = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      return { provider: null, program: null };
    }

    const anchorWallet = {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction,
      signAllTransactions: wallet.signAllTransactions,
    };

    const provider = new AnchorProvider(connection, anchorWallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });

    const resolvedIdl = { ...IDL, address: PROGRAM_ID.toBase58() } as Idl;
    const program = new Program(
      resolvedIdl,
      provider
    ) as unknown as Program<MarketFactory>;

    return { provider, program };
  }, [connection, wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]);

  return (
    <AnchorContext.Provider value={{ program, provider, programId: PROGRAM_ID }}>
      {children}
    </AnchorContext.Provider>
  );
};

export const useAnchorProgram = () => {
  const context = useContext(AnchorContext);
  if (!context) {
    throw new Error("useAnchorProgram must be used within AnchorContextProvider");
  }
  return context;
};

export const useAnchorProvider = () => {
  const { provider } = useAnchorProgram();
  return provider;
};

export { PROGRAM_ID };
