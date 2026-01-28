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

    it("fails to place bet with zero amount", async () => {
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

      try {
        await program.methods
          .placeBet(new anchor.BN(0), true)
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
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.toString()).to.include("InvalidBetAmount");
      }
    });
  });

  describe("place_bet - expired market", () => {
    let expiredMarketPda: PublicKey;
    let expiredYesMint: PublicKey;
    let expiredNoMint: PublicKey;
    let expiredVault: PublicKey;
    let expiredUserTokenAccount: PublicKey;

    before(async () => {
      // Create a market that expires in 1 second
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 1);

      [expiredMarketPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market"),
          creator.publicKey.toBuffer(),
          betTokenMint.toBuffer(),
          expiryTimestamp.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      [expiredYesMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), expiredMarketPda.toBuffer()],
        program.programId
      );

      [expiredNoMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), expiredMarketPda.toBuffer()],
        program.programId
      );

      [expiredVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), expiredMarketPda.toBuffer()],
        program.programId
      );

      await program.methods
        .createMarket("Expiring Market", "For testing expired bets", expiryTimestamp)
        .accounts({
          creator: creator.publicKey,
          market: expiredMarketPda,
          betTokenMint: betTokenMint,
          yesMint: expiredYesMint,
          noMint: expiredNoMint,
          vault: expiredVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      expiredUserTokenAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        betTokenMint,
        creator.publicKey
      )).address;

      // Wait for market to expire
      await new Promise(resolve => setTimeout(resolve, 2000));
    });

    it("fails to place bet on expired market", async () => {
      const userYesAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        expiredYesMint,
        creator.publicKey
      )).address;

      const userNoAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        expiredNoMint,
        creator.publicKey
      )).address;

      try {
        await program.methods
          .placeBet(new anchor.BN(10_000_000_000), true)
          .accounts({
            bettor: creator.publicKey,
            market: expiredMarketPda,
            betTokenMint: betTokenMint,
            yesMint: expiredYesMint,
            noMint: expiredNoMint,
            vault: expiredVault,
            bettorTokenAccount: expiredUserTokenAccount,
            bettorYesAccount: userYesAccount,
            bettorNoAccount: userNoAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.toString()).to.include("MarketExpired");
      }
    });
  });

  describe("place_bet - settled market", () => {
    let settledMarketPda: PublicKey;
    let settledYesMint: PublicKey;
    let settledNoMint: PublicKey;
    let settledVault: PublicKey;
    let settledUserTokenAccount: PublicKey;

    before(async () => {
      // Create a market that expires in 1 second
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 1);

      [settledMarketPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market"),
          creator.publicKey.toBuffer(),
          betTokenMint.toBuffer(),
          expiryTimestamp.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      [settledYesMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), settledMarketPda.toBuffer()],
        program.programId
      );

      [settledNoMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), settledMarketPda.toBuffer()],
        program.programId
      );

      [settledVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), settledMarketPda.toBuffer()],
        program.programId
      );

      await program.methods
        .createMarket("Settled Market", "For testing betting on settled market", expiryTimestamp)
        .accounts({
          creator: creator.publicKey,
          market: settledMarketPda,
          betTokenMint: betTokenMint,
          yesMint: settledYesMint,
          noMint: settledNoMint,
          vault: settledVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      settledUserTokenAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        betTokenMint,
        creator.publicKey
      )).address;

      // Wait for market to expire
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Settle the market
      await program.methods
        .settleMarket(true)
        .accounts({
          creator: creator.publicKey,
          market: settledMarketPda,
        })
        .signers([creator])
        .rpc();
    });

    it("fails to place bet on settled market", async () => {
      const userYesAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        settledYesMint,
        creator.publicKey
      )).address;

      const userNoAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        creator,
        settledNoMint,
        creator.publicKey
      )).address;

      try {
        await program.methods
          .placeBet(new anchor.BN(10_000_000_000), true)
          .accounts({
            bettor: creator.publicKey,
            market: settledMarketPda,
            betTokenMint: betTokenMint,
            yesMint: settledYesMint,
            noMint: settledNoMint,
            vault: settledVault,
            bettorTokenAccount: settledUserTokenAccount,
            bettorYesAccount: userYesAccount,
            bettorNoAccount: userNoAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.toString()).to.include("MarketNotOpen");
      }
    });
  });

  describe("create_market - validation errors", () => {
    it("fails to create market with expiry in the past", async () => {
      const pastTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) - 3600); // 1 hour ago

      const [pastMarketPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market"),
          creator.publicKey.toBuffer(),
          betTokenMint.toBuffer(),
          pastTimestamp.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [pastYesMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), pastMarketPda.toBuffer()],
        program.programId
      );

      const [pastNoMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), pastMarketPda.toBuffer()],
        program.programId
      );

      const [pastVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), pastMarketPda.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .createMarket("Past Market", "Should fail", pastTimestamp)
          .accounts({
            creator: creator.publicKey,
            market: pastMarketPda,
            betTokenMint: betTokenMint,
            yesMint: pastYesMint,
            noMint: pastNoMint,
            vault: pastVault,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.toString()).to.include("ExpiryInPast");
      }
    });

    it("fails to create market with title too long", async () => {
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400);
      const longTitle = "A".repeat(129); // 129 chars, exceeds 128 limit

      const [longTitleMarketPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market"),
          creator.publicKey.toBuffer(),
          betTokenMint.toBuffer(),
          expiryTimestamp.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [longTitleYesMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), longTitleMarketPda.toBuffer()],
        program.programId
      );

      const [longTitleNoMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), longTitleMarketPda.toBuffer()],
        program.programId
      );

      const [longTitleVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), longTitleMarketPda.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .createMarket(longTitle, "Description", expiryTimestamp)
          .accounts({
            creator: creator.publicKey,
            market: longTitleMarketPda,
            betTokenMint: betTokenMint,
            yesMint: longTitleYesMint,
            noMint: longTitleNoMint,
            vault: longTitleVault,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.toString()).to.include("TitleTooLong");
      }
    });

    it("fails to create market with description too long", async () => {
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400 * 2);
      const longDescription = "B".repeat(513); // 513 chars, exceeds 512 limit

      const [longDescMarketPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market"),
          creator.publicKey.toBuffer(),
          betTokenMint.toBuffer(),
          expiryTimestamp.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [longDescYesMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), longDescMarketPda.toBuffer()],
        program.programId
      );

      const [longDescNoMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), longDescMarketPda.toBuffer()],
        program.programId
      );

      const [longDescVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), longDescMarketPda.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .createMarket("Valid Title", longDescription, expiryTimestamp)
          .accounts({
            creator: creator.publicKey,
            market: longDescMarketPda,
            betTokenMint: betTokenMint,
            yesMint: longDescYesMint,
            noMint: longDescNoMint,
            vault: longDescVault,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.toString()).to.include("DescriptionTooLong");
      }
    });
  });
});
