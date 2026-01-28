import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MarketFactory } from "../target/types/market_factory";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("settlement", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const factoryProgram = anchor.workspace.MarketFactory as Program<MarketFactory>;

  let betTokenMint: PublicKey;
  let creator: Keypair;
  let marketPda: PublicKey;

  before(async () => {
    creator = Keypair.generate();

    const sig = await provider.connection.requestAirdrop(
      creator.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    betTokenMint = await createMint(
      provider.connection,
      creator,
      creator.publicKey,
      null,
      9
    );

    // Create a market that expires in 1 second (for testing)
    const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 1);

    [marketPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("market"),
        creator.publicKey.toBuffer(),
        betTokenMint.toBuffer(),
        expiryTimestamp.toArrayLike(Buffer, "le", 8),
      ],
      factoryProgram.programId
    );

    const [yesMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("yes_mint"), marketPda.toBuffer()],
      factoryProgram.programId
    );

    const [noMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("no_mint"), marketPda.toBuffer()],
      factoryProgram.programId
    );

    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), marketPda.toBuffer()],
      factoryProgram.programId
    );

    await factoryProgram.methods
      .createMarket("Test Settlement", "Description", expiryTimestamp)
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

    // Wait for market to expire
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  describe("settle_market", () => {
    it("allows creator to settle with YES outcome", async () => {
      await factoryProgram.methods
        .settleMarket(true) // YES wins
        .accounts({
          creator: creator.publicKey,
          market: marketPda,
        })
        .signers([creator])
        .rpc();

      const market = await factoryProgram.account.market.fetch(marketPda);
      expect(market.status).to.deep.equal({ settled: {} });
      expect(market.outcome).to.equal(true);
    });
  });

  describe("redeem", () => {
    let redeemMarketPda: PublicKey;
    let redeemYesMint: PublicKey;
    let redeemNoMint: PublicKey;
    let redeemVault: PublicKey;
    let redeemer: Keypair;
    let redeemerTokenAccount: PublicKey;
    let redeemerYesAccount: PublicKey;
    let redeemerNoAccount: PublicKey;

    before(async () => {
      redeemer = Keypair.generate();

      // Airdrop SOL to redeemer
      const sig = await provider.connection.requestAirdrop(
        redeemer.publicKey,
        10 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      // Create a new market that expires in 5 seconds (enough time to place bet)
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 5);

      [redeemMarketPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market"),
          creator.publicKey.toBuffer(),
          betTokenMint.toBuffer(),
          expiryTimestamp.toArrayLike(Buffer, "le", 8),
        ],
        factoryProgram.programId
      );

      [redeemYesMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), redeemMarketPda.toBuffer()],
        factoryProgram.programId
      );

      [redeemNoMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), redeemMarketPda.toBuffer()],
        factoryProgram.programId
      );

      [redeemVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), redeemMarketPda.toBuffer()],
        factoryProgram.programId
      );

      await factoryProgram.methods
        .createMarket("Test Redeem Market", "Description", expiryTimestamp)
        .accounts({
          creator: creator.publicKey,
          market: redeemMarketPda,
          betTokenMint: betTokenMint,
          yesMint: redeemYesMint,
          noMint: redeemNoMint,
          vault: redeemVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      // Mint bet tokens to redeemer
      redeemerTokenAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        redeemer,
        betTokenMint,
        redeemer.publicKey
      )).address;

      await mintTo(
        provider.connection,
        creator,
        betTokenMint,
        redeemerTokenAccount,
        creator,
        1000_000_000_000 // 1000 tokens
      );

      // Create YES/NO token accounts for redeemer
      redeemerYesAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        redeemer,
        redeemYesMint,
        redeemer.publicKey
      )).address;

      redeemerNoAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        redeemer,
        redeemNoMint,
        redeemer.publicKey
      )).address;

      // Place a YES bet of 100 tokens
      await factoryProgram.methods
        .placeBet(new anchor.BN(100_000_000_000), true)
        .accounts({
          bettor: redeemer.publicKey,
          market: redeemMarketPda,
          betTokenMint: betTokenMint,
          yesMint: redeemYesMint,
          noMint: redeemNoMint,
          vault: redeemVault,
          bettorTokenAccount: redeemerTokenAccount,
          bettorYesAccount: redeemerYesAccount,
          bettorNoAccount: redeemerNoAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([redeemer])
        .rpc();

      // Wait for market to expire (5 seconds + buffer)
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Settle market with YES outcome
      await factoryProgram.methods
        .settleMarket(true)
        .accounts({
          creator: creator.publicKey,
          market: redeemMarketPda,
        })
        .signers([creator])
        .rpc();
    });

    it("allows winner to redeem bet tokens", async () => {
      const initialBetBalance = (await getAccount(
        provider.connection,
        redeemerTokenAccount
      )).amount;

      const yesBalance = (await getAccount(
        provider.connection,
        redeemerYesAccount
      )).amount;

      // Redeem all YES tokens
      await factoryProgram.methods
        .redeem(new anchor.BN(yesBalance.toString()))
        .accounts({
          redeemer: redeemer.publicKey,
          market: redeemMarketPda,
          vault: redeemVault,
          winningMint: redeemYesMint,
          redeemerWinningAccount: redeemerYesAccount,
          redeemerBetAccount: redeemerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([redeemer])
        .rpc();

      // Verify YES tokens were burned
      const newYesBalance = (await getAccount(
        provider.connection,
        redeemerYesAccount
      )).amount;
      expect(Number(newYesBalance)).to.equal(0);

      // Verify bet tokens were received (payout = amount since only YES bets)
      const newBetBalance = (await getAccount(
        provider.connection,
        redeemerTokenAccount
      )).amount;
      expect(Number(newBetBalance)).to.be.greaterThan(Number(initialBetBalance));
    });

    it("fails to redeem with wrong mint", async () => {
      try {
        await factoryProgram.methods
          .redeem(new anchor.BN(1))
          .accounts({
            redeemer: redeemer.publicKey,
            market: redeemMarketPda,
            vault: redeemVault,
            winningMint: redeemNoMint, // Wrong mint (NO instead of YES)
            redeemerWinningAccount: redeemerNoAccount,
            redeemerBetAccount: redeemerTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([redeemer])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.toString()).to.include("WrongMint");
      }
    });

    it("fails to redeem with zero amount", async () => {
      try {
        await factoryProgram.methods
          .redeem(new anchor.BN(0))
          .accounts({
            redeemer: redeemer.publicKey,
            market: redeemMarketPda,
            vault: redeemVault,
            winningMint: redeemYesMint,
            redeemerWinningAccount: redeemerYesAccount,
            redeemerBetAccount: redeemerTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([redeemer])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.toString()).to.include("InvalidAmount");
      }
    });
  });

  describe("settle_market - error cases", () => {
    let unsettledMarketPda: PublicKey;
    let unsettledYesMint: PublicKey;
    let unsettledNoMint: PublicKey;
    let unsettledVault: PublicKey;
    let longExpiryTimestamp: anchor.BN;
    let unauthorizedUser: Keypair;

    before(async () => {
      unauthorizedUser = Keypair.generate();

      // Airdrop SOL to unauthorized user
      const sig = await provider.connection.requestAirdrop(
        unauthorizedUser.publicKey,
        10 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      // Create a market that expires in 30 days (won't expire during test)
      longExpiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400 * 30);

      [unsettledMarketPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market"),
          creator.publicKey.toBuffer(),
          betTokenMint.toBuffer(),
          longExpiryTimestamp.toArrayLike(Buffer, "le", 8),
        ],
        factoryProgram.programId
      );

      [unsettledYesMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), unsettledMarketPda.toBuffer()],
        factoryProgram.programId
      );

      [unsettledNoMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), unsettledMarketPda.toBuffer()],
        factoryProgram.programId
      );

      [unsettledVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), unsettledMarketPda.toBuffer()],
        factoryProgram.programId
      );

      await factoryProgram.methods
        .createMarket("Long Expiry Market", "For testing settlement errors", longExpiryTimestamp)
        .accounts({
          creator: creator.publicKey,
          market: unsettledMarketPda,
          betTokenMint: betTokenMint,
          yesMint: unsettledYesMint,
          noMint: unsettledNoMint,
          vault: unsettledVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();
    });

    it("fails to settle when not market creator", async () => {
      try {
        await factoryProgram.methods
          .settleMarket(true)
          .accounts({
            creator: unauthorizedUser.publicKey,
            market: unsettledMarketPda,
          })
          .signers([unauthorizedUser])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.toString()).to.include("Unauthorized");
      }
    });

    it("fails to settle before market expiry", async () => {
      try {
        await factoryProgram.methods
          .settleMarket(true)
          .accounts({
            creator: creator.publicKey,
            market: unsettledMarketPda,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.toString()).to.include("MarketNotExpired");
      }
    });

    it("fails to settle an already settled market", async () => {
      // Use the market from the first test that's already settled
      try {
        await factoryProgram.methods
          .settleMarket(false)
          .accounts({
            creator: creator.publicKey,
            market: marketPda, // This is the already settled market from the first test
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.toString()).to.include("AlreadySettled");
      }
    });
  });

  describe("redeem - error cases", () => {
    let openMarketPda: PublicKey;
    let openYesMint: PublicKey;
    let openNoMint: PublicKey;
    let openVault: PublicKey;
    let bettor: Keypair;
    let bettorTokenAccount: PublicKey;
    let bettorYesAccount: PublicKey;

    before(async () => {
      bettor = Keypair.generate();

      // Airdrop SOL to bettor
      const sig = await provider.connection.requestAirdrop(
        bettor.publicKey,
        10 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      // Create a market that won't expire during test
      // Use 31 days offset (vs 30 days in settle_market tests) to avoid PDA collisions
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400 * 31);

      [openMarketPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market"),
          creator.publicKey.toBuffer(),
          betTokenMint.toBuffer(),
          expiryTimestamp.toArrayLike(Buffer, "le", 8),
        ],
        factoryProgram.programId
      );

      [openYesMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), openMarketPda.toBuffer()],
        factoryProgram.programId
      );

      [openNoMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), openMarketPda.toBuffer()],
        factoryProgram.programId
      );

      [openVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), openMarketPda.toBuffer()],
        factoryProgram.programId
      );

      await factoryProgram.methods
        .createMarket("Open Market for Redeem Test", "Testing redeem before settle", expiryTimestamp)
        .accounts({
          creator: creator.publicKey,
          market: openMarketPda,
          betTokenMint: betTokenMint,
          yesMint: openYesMint,
          noMint: openNoMint,
          vault: openVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();

      // Mint bet tokens to bettor
      bettorTokenAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        bettor,
        betTokenMint,
        bettor.publicKey
      )).address;

      await mintTo(
        provider.connection,
        creator,
        betTokenMint,
        bettorTokenAccount,
        creator,
        1000_000_000_000
      );

      // Create YES token account for bettor
      bettorYesAccount = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        bettor,
        openYesMint,
        bettor.publicKey
      )).address;

      // Create NO token account for bettor (needed for place_bet)
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        bettor,
        openNoMint,
        bettor.publicKey
      );

      // Place a bet to get some YES tokens
      await factoryProgram.methods
        .placeBet(new anchor.BN(100_000_000_000), true)
        .accounts({
          bettor: bettor.publicKey,
          market: openMarketPda,
          betTokenMint: betTokenMint,
          yesMint: openYesMint,
          noMint: openNoMint,
          vault: openVault,
          bettorTokenAccount: bettorTokenAccount,
          bettorYesAccount: bettorYesAccount,
          bettorNoAccount: (await getOrCreateAssociatedTokenAccount(
            provider.connection,
            bettor,
            openNoMint,
            bettor.publicKey
          )).address,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([bettor])
        .rpc();
    });

    it("fails to redeem from unsettled market", async () => {
      try {
        await factoryProgram.methods
          .redeem(new anchor.BN(50_000_000_000))
          .accounts({
            redeemer: bettor.publicKey,
            market: openMarketPda,
            vault: openVault,
            winningMint: openYesMint,
            redeemerWinningAccount: bettorYesAccount,
            redeemerBetAccount: bettorTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([bettor])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.toString()).to.include("NotSettled");
      }
    });
  });
});
