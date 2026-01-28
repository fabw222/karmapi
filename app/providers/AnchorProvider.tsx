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

const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "AQR7DVzsy1dKM3TdRqLMbzAb5waubBJYdXd9BGuCtVpR"
);

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

    const program = new Program(
      idl as Idl,
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
