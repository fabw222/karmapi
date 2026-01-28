/**
 * Local Development Setup Script
 *
 * This script creates a test SPL token mint for local development
 * and mints tokens to a test wallet for testing the prediction market.
 *
 * Usage:
 *   npx ts-node scripts/setup-local.ts
 *
 * Prerequisites:
 *   - solana-test-validator running on localhost:8899
 *   - A local keypair at ~/.config/solana/id.json
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const RPC_URL = "http://localhost:8899";
const MINT_AMOUNT = 1_000_000 * LAMPORTS_PER_SOL; // 1 million tokens

async function main() {
  console.log("KarmaPi Local Development Setup");
  console.log("================================\n");

  // Connect to local validator
  const connection = new Connection(RPC_URL, "confirmed");

  try {
    const version = await connection.getVersion();
    console.log(`Connected to Solana: ${version["solana-core"]}`);
  } catch (error) {
    console.error("Error: Could not connect to local validator.");
    console.error("Make sure solana-test-validator is running:");
    console.error("  solana-test-validator --reset\n");
    process.exit(1);
  }

  // Load or create keypair
  const keypairPath = path.join(
    process.env.HOME || "",
    ".config",
    "solana",
    "id.json"
  );

  let payer: Keypair;
  try {
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    console.log(`Using keypair: ${payer.publicKey.toBase58()}`);
  } catch (error) {
    console.error(`Error: Could not load keypair from ${keypairPath}`);
    console.error("Create one with: solana-keygen new\n");
    process.exit(1);
  }

  // Check balance and airdrop if needed
  let balance = await connection.getBalance(payer.publicKey);
  console.log(`Current balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  if (balance < 2 * LAMPORTS_PER_SOL) {
    console.log("Requesting airdrop...");
    const sig = await connection.requestAirdrop(
      payer.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);
    balance = await connection.getBalance(payer.publicKey);
    console.log(`New balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  }

  // Create the bet token mint
  console.log("\nCreating bet token mint...");
  const betTokenMint = await createMint(
    connection,
    payer,
    payer.publicKey, // mint authority
    null, // freeze authority
    9, // decimals (same as SOL)
    undefined,
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log(`Bet token mint: ${betTokenMint.toBase58()}`);

  // Create associated token account for payer
  console.log("\nCreating token account...");
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    betTokenMint,
    payer.publicKey
  );
  console.log(`Token account: ${tokenAccount.address.toBase58()}`);

  // Mint tokens to payer
  console.log("\nMinting tokens...");
  await mintTo(
    connection,
    payer,
    betTokenMint,
    tokenAccount.address,
    payer,
    MINT_AMOUNT
  );
  console.log(`Minted ${MINT_AMOUNT / LAMPORTS_PER_SOL} tokens`);

  // Update .env.local
  const envPath = path.join(__dirname, "..", ".env.local");
  let envContent = "";

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
  }

  // Update or add NEXT_PUBLIC_BET_TOKEN_MINT
  if (envContent.includes("NEXT_PUBLIC_BET_TOKEN_MINT=")) {
    envContent = envContent.replace(
      /NEXT_PUBLIC_BET_TOKEN_MINT=.*/,
      `NEXT_PUBLIC_BET_TOKEN_MINT=${betTokenMint.toBase58()}`
    );
  } else {
    envContent += `\nNEXT_PUBLIC_BET_TOKEN_MINT=${betTokenMint.toBase58()}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log(`\nUpdated ${envPath}`);

  // Summary
  console.log("\n================================");
  console.log("Setup Complete!");
  console.log("================================\n");
  console.log("Environment variables set:");
  console.log(`  NEXT_PUBLIC_BET_TOKEN_MINT=${betTokenMint.toBase58()}`);
  console.log(`\nYour wallet: ${payer.publicKey.toBase58()}`);
  console.log(`Token balance: ${MINT_AMOUNT / LAMPORTS_PER_SOL} tokens`);
  console.log(`SOL balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  console.log("\nNext steps:");
  console.log("1. Deploy the program: anchor build && anchor deploy --provider.cluster localnet");
  console.log("2. Start the frontend: npm run dev");
  console.log("3. Configure Phantom wallet to use localhost:8899");
  console.log("4. Import your keypair into Phantom for testing");
}

main().catch((error) => {
  console.error("Setup failed:", error);
  process.exit(1);
});
