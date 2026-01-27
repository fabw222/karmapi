import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MarketFactory } from "../target/types/market_factory";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { expect } from "chai";

describe("market-factory", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.MarketFactory as Program<MarketFactory>;

  let betTokenMint: PublicKey;
  let creator: Keypair;

  before(async () => {
    creator = Keypair.generate();

    // Airdrop SOL to creator
    const sig = await provider.connection.requestAirdrop(
      creator.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    // Create a test SPL token for betting
    betTokenMint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      9
    );
  });

  describe("create_market", () => {
    it("creates a market with correct parameters", async () => {
      const title = "Will Trump attack Iran before Jan 31?";
      const description = "Market resolves YES if military action occurs.";
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400);

      const [marketPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market"),
          creator.publicKey.toBuffer(),
          betTokenMint.toBuffer(),
          expiryTimestamp.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [yesMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), marketPda.toBuffer()],
        program.programId
      );

      const [noMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), marketPda.toBuffer()],
        program.programId
      );

      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), marketPda.toBuffer()],
        program.programId
      );

      await program.methods
        .createMarket(title, description, expiryTimestamp)
        .accounts({
          creator: creator.publicKey,
          market: marketPda,
          betTokenMint: betTokenMint,
          yesMint: yesMint,
          noMint: noMint,
          vault: vault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      const market = await program.account.market.fetch(marketPda);

      expect(market.creator.toString()).to.equal(creator.publicKey.toString());
      expect(market.title).to.equal(title);
      expect(market.description).to.equal(description);
      expect(market.status).to.deep.equal({ open: {} });
      expect(market.yesPool.toNumber()).to.equal(0);
      expect(market.noPool.toNumber()).to.equal(0);
    });
  });

  describe("place_bet", () => {
    let marketPda: PublicKey;
    let yesMint: PublicKey;
    let noMint: PublicKey;
    let vault: PublicKey;
    let userTokenAccount: PublicKey;

    before(async () => {
      // Create a market first
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400 * 30);

      [marketPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market"),
          creator.publicKey.toBuffer(),
          betTokenMint.toBuffer(),
          expiryTimestamp.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      [yesMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), marketPda.toBuffer()],
        program.programId
      );

      [noMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), marketPda.toBuffer()],
        program.programId
      );

      [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), marketPda.toBuffer()],
        program.programId
      );

      await program.methods
        .createMarket("Test Bet Market", "Description", expiryTimestamp)
        .accounts({
          creator: creator.publicKey,
          market: marketPda,
          betTokenMint: betTokenMint,
          yesMint: yesMint,
          noMint: noMint,
          vault: vault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      // Mint some bet tokens to creator
      userTokenAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        betTokenMint,
        creator.publicKey
      )).address;

      await mintTo(
        provider.connection,
        creator,
        betTokenMint,
        userTokenAccount,
        creator,
        1000_000_000_000 // 1000 tokens
      );
    });

    it("places a YES bet correctly", async () => {
      const betAmount = new anchor.BN(100_000_000_000); // 100 tokens

      const userYesAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        yesMint,
        creator.publicKey
      )).address;

      const userNoAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        noMint,
        creator.publicKey
      )).address;

      await program.methods
        .placeBet(betAmount, true) // true = YES
        .accounts({
          bettor: creator.publicKey,
          market: marketPda,
          betTokenMint: betTokenMint,
          yesMint: yesMint,
          noMint: noMint,
          vault: vault,
          bettorTokenAccount: userTokenAccount,
          bettorYesAccount: userYesAccount,
          bettorNoAccount: userNoAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc();

      const market = await program.account.market.fetch(marketPda);
      expect(market.yesPool.toNumber()).to.equal(betAmount.toNumber());
      expect(market.noPool.toNumber()).to.equal(0);
    });

    it("places a NO bet correctly", async () => {
      const betAmount = new anchor.BN(50_000_000_000); // 50 tokens

      const userNoAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        noMint,
        creator.publicKey
      )).address;

      const userYesAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        yesMint,
        creator.publicKey
      )).address;

      await program.methods
        .placeBet(betAmount, false) // false = NO
        .accounts({
          bettor: creator.publicKey,
          market: marketPda,
          betTokenMint: betTokenMint,
          yesMint: yesMint,
          noMint: noMint,
          vault: vault,
          bettorTokenAccount: userTokenAccount,
          bettorYesAccount: userYesAccount,
          bettorNoAccount: userNoAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([creator])
        .rpc();

      const market = await program.account.market.fetch(marketPda);
      expect(market.noPool.toNumber()).to.equal(betAmount.toNumber());
    });
  });
});
