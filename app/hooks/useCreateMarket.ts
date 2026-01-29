import { useState, useCallback, useRef } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { ACCOUNT_SIZE, MINT_SIZE, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { BN } from "@coral-xyz/anchor";
import { useQueryClient } from "@tanstack/react-query";
import { useAnchorProgram } from "@/providers/AnchorProvider";
import { deriveAllMarketPDAs } from "@/lib/pda";

const IS_DEV = process.env.NODE_ENV === "development";
const MAX_PDA_COLLISION_RETRIES = 5;

// Must match 8 + Market::INIT_SPACE from programs/market-factory/src/state/mod.rs
const MARKET_ACCOUNT_SIZE = 844;

interface CreateMarketParams {
  title: string;
  description: string;
  durationDays: number;
}

interface CreateMarketResult {
  marketAddress: string;
  signature?: string;
}

export function useCreateMarket() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { program } = useAnchorProgram();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const createMarket = useCallback(
    async (params: CreateMarketParams): Promise<CreateMarketResult | null> => {
      if (!program || !publicKey) {
        setError("Wallet not connected");
        return null;
      }

      if (inFlightRef.current) return null;
      inFlightRef.current = true;
      setIsLoading(true);
      setError(null);

      let marketPda: PublicKey | null = null;

      try {
        // Debug: Log environment variables (development only)
        if (IS_DEV) {
          console.log("=== Create Market Debug ===");
          console.log("ENV PROGRAM_ID:", process.env.NEXT_PUBLIC_PROGRAM_ID);
          console.log(
            "ENV BET_TOKEN_MINT:",
            process.env.NEXT_PUBLIC_BET_TOKEN_MINT
          );
          console.log("ENV RPC_URL:", process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
          console.log("Creator wallet:", publicKey.toBase58());
        }

        // Get bet token mint from environment
        const betTokenMintStr = process.env.NEXT_PUBLIC_BET_TOKEN_MINT;
        if (!betTokenMintStr) {
          throw new Error(
            "Bet token mint not configured. Run the setup script first."
          );
        }
        const betTokenMint = new PublicKey(betTokenMintStr);

        const programInfo = await connection.getAccountInfo(
          program.programId,
          "confirmed"
        );
        if (!programInfo) {
          throw new Error(
            `Program not found on this cluster: ${program.programId.toBase58()}`
          );
        }
        if (!programInfo.executable) {
          throw new Error(
            `Program is not executable on this cluster: ${program.programId.toBase58()}`
          );
        }

        const [marketRent, mintRent, tokenAccountRent, creatorBalance] =
          await Promise.all([
            connection.getMinimumBalanceForRentExemption(
              MARKET_ACCOUNT_SIZE,
              "confirmed"
            ),
            connection.getMinimumBalanceForRentExemption(
              MINT_SIZE,
              "confirmed"
            ),
            connection.getMinimumBalanceForRentExemption(
              ACCOUNT_SIZE,
              "confirmed"
            ),
            connection.getBalance(publicKey, "confirmed"),
          ]);
        const estimatedLamportsNeeded =
          marketRent + 2 * mintRent + tokenAccountRent + 10_000;
        if (creatorBalance < estimatedLamportsNeeded) {
          throw new Error(
            `Insufficient SOL for rent/fees. Have ${(
              creatorBalance / LAMPORTS_PER_SOL
            ).toFixed(4)} SOL, need about ${(
              estimatedLamportsNeeded / LAMPORTS_PER_SOL
            ).toFixed(4)} SOL`
          );
        }

        const betTokenMintInfo = await connection.getAccountInfo(
          betTokenMint,
          "confirmed"
        );
        if (!betTokenMintInfo) {
          throw new Error(
            `Bet token mint not found on this cluster: ${betTokenMint.toBase58()}`
          );
        }
        if (!betTokenMintInfo.owner.equals(TOKEN_PROGRAM_ID)) {
          throw new Error(
            `Bet token mint is not owned by the SPL Token program: ${betTokenMint.toBase58()}`
          );
        }

        // Calculate expiry timestamp
        let expiryTimestamp = new BN(
          Math.floor(Date.now() / 1000) + params.durationDays * 24 * 60 * 60
        );

        // Derive all PDAs (retry if PDA already exists)
        let pdas = deriveAllMarketPDAs(
          publicKey,
          betTokenMint,
          expiryTimestamp
        );
        for (let i = 0; i < MAX_PDA_COLLISION_RETRIES; i++) {
          const existing = await connection.getAccountInfo(
            pdas.market,
            "confirmed"
          );
          if (!existing) break;
          expiryTimestamp = expiryTimestamp.addn(1);
          pdas = deriveAllMarketPDAs(publicKey, betTokenMint, expiryTimestamp);
        }
        if (await connection.getAccountInfo(pdas.market, "confirmed")) {
          throw new Error("Market PDA already exists. Please try again.");
        }
        marketPda = pdas.market;

        if (IS_DEV) {
          console.log("ExpiryTimestamp:", expiryTimestamp.toString());
          console.log("Market PDA:", pdas.market.toBase58());
          console.log("Vault PDA:", pdas.vault.toBase58());
          console.log("YesMint PDA:", pdas.yesMint.toBase58());
          console.log("NoMint PDA:", pdas.noMint.toBase58());
          console.log("Program ID:", program.programId.toBase58());
          console.log("=== End Debug ===");
        }

        const method = program.methods
          .createMarket(params.title, params.description, expiryTimestamp)
          .accountsStrict({
            creator: publicKey,
            market: pdas.market,
            betTokenMint: betTokenMint,
            yesMint: pdas.yesMint,
            noMint: pdas.noMint,
            vault: pdas.vault,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          });

        // Simulate first to surface the real failure reason (without prompting wallet).
        try {
          const sim = await method.simulate({ commitment: "confirmed" });
          if (IS_DEV) {
            console.log("Create market simulate logs:", sim.raw);
            if (Array.isArray(sim.raw) && sim.raw.length > 0) {
              console.log(
                "Create market simulate last log:",
                sim.raw[sim.raw.length - 1]
              );
            }
          }
        } catch (simErr) {
          const simLogs = (
            simErr as { simulationResponse?: { logs?: string[] } }
          )?.simulationResponse?.logs;
          if (IS_DEV) {
            console.error("Create market simulation error:", simErr);
          }
          if (Array.isArray(simLogs)) {
            if (IS_DEV)
              console.error("Create market simulation logs:", simLogs);
            const lastLog = simLogs[simLogs.length - 1];
            setError(lastLog ?? "Transaction simulation failed");
          } else {
            const message =
              simErr instanceof Error
                ? simErr.message
                : "Transaction simulation failed";
            setError(message);
          }
          return null;
        }

        // Build and send the transaction
        const signature = await method.rpc();

        // Invalidate markets query to refresh list
        await queryClient.invalidateQueries({ queryKey: ["markets"] });

        return {
          marketAddress: pdas.market.toBase58(),
          signature,
        };
      } catch (err) {
        if (
          IS_DEV &&
          err instanceof SendTransactionError &&
          typeof err.getLogs === "function"
        ) {
          try {
            const logs = await err.getLogs(connection);
            console.error("Create market logs:", logs);
          } catch (logErr) {
            console.warn("Failed to fetch transaction logs:", logErr);
          }
        }

        const errMessage = err instanceof Error ? err.message : "";
        const isAlreadyProcessed =
          errMessage.includes("already been processed") ||
          errMessage.includes("already processed");
        if (isAlreadyProcessed && marketPda) {
          const signature =
            typeof (err as { signature?: unknown })?.signature === "string"
              ? ((err as { signature?: string }).signature as string)
              : undefined;

          for (let attempt = 0; attempt < 10; attempt++) {
            const accountInfo = await connection.getAccountInfo(
              marketPda,
              "processed"
            );
            if (accountInfo) {
              await queryClient.invalidateQueries({ queryKey: ["markets"] });
              return { marketAddress: marketPda.toBase58(), signature };
            }
            await new Promise((resolve) => setTimeout(resolve, 400));
          }

          if (signature) {
            const statusResp = await connection.getSignatureStatuses([
              signature,
            ]);
            const status = statusResp.value[0];
            if (status && status.err == null) {
              await queryClient.invalidateQueries({ queryKey: ["markets"] });
              return { marketAddress: marketPda.toBase58(), signature };
            }
          }
        }

        if (IS_DEV) console.error("Error creating market:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to create market";
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
        inFlightRef.current = false;
      }
    },
    [program, publicKey, connection, queryClient]
  );

  const reset = useCallback(() => {
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    createMarket,
    isLoading,
    error,
    reset,
  };
}
