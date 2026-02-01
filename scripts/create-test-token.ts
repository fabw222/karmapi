import { Connection, Keypair, clusterApiUrl } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

async function main() {
  // Load local keypair
  const keypairPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("Payer:", payer.publicKey.toBase58());

  // Connect to devnet
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  const balance = await connection.getBalance(payer.publicKey);
  console.log("Balance:", balance / 1e9, "SOL");

  if (balance < 0.05 * 1e9) {
    console.log("Low balance — requesting airdrop...");
    const sig = await connection.requestAirdrop(payer.publicKey, 2 * 1e9);
    await connection.confirmTransaction(sig);
    console.log("Airdrop confirmed");
  }

  // Create mint (6 decimals)
  console.log("Creating token mint...");
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey, // mint authority
    null, // freeze authority
    6 // decimals
  );
  console.log("Mint address:", mint.toBase58());

  // Create associated token account
  console.log("Creating associated token account...");
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    payer.publicKey
  );
  console.log("Token account:", tokenAccount.address.toBase58());

  // Mint 1,000,000 tokens (with 6 decimals = 1_000_000_000_000 raw)
  console.log("Minting 1,000,000 tokens...");
  await mintTo(
    connection,
    payer,
    mint,
    tokenAccount.address,
    payer.publicKey,
    1_000_000 * 10 ** 6
  );

  console.log("\nDone!");
  console.log("---");
  console.log("Mint address:          ", mint.toBase58());
  console.log("Token account address: ", tokenAccount.address.toBase58());
  console.log("Amount minted:          1,000,000 tokens");
  console.log(
    "\nUse the mint address above as the Bet Token Address when creating a market."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
