import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { MarketFactory } from "../target/types/market_factory";
import { startAnchor, BankrunProvider } from "anchor-bankrun";
import { Clock } from "solana-bankrun";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "spl-token-bankrun";
import { expect } from "chai";

const IDL = require("../target/idl/market_factory.json");

describe("market-factory (bankrun)", () => {
  let context: Awaited<ReturnType<typeof startAnchor>>;
  let provider: BankrunProvider;
  let program: Program<MarketFactory>;
  let betTokenMint: PublicKey;
  let creator: Keypair;

  before(async () => {
    context = await startAnchor(".", [], []);
    provider = new BankrunProvider(context);
    program = new Program<MarketFactory>(IDL, provider);

    creator = Keypair.generate();

    // Fund creator with SOL
    context.setAccount(creator.publicKey, {
      lamports: BigInt(10 * anchor.web3.LAMPORTS_PER_SOL),
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    });

    // Create test token for betting
    betTokenMint = await createMint(
      context.banksClient,
      context.payer,
      creator.publicKey, // mint authority
      null, // freeze authority
      9 // decimals
    );
  });

  describe("create_market", () => {
    it("creates a market with correct parameters", async () => {
      const title = "Will Trump attack Iran before Jan 31?";
      const description = "Market resolves YES if military action occurs.";
      const expiryTimestamp = new BN(Math.floor(Date.now() / 1000) + 86400);

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
      // Create a market first with unique expiry
      const expiryTimestamp = new BN(Math.floor(Date.now() / 1000) + 86400 * 30);

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

      // Create user token account and mint tokens
      userTokenAccount = await createAssociatedTokenAccount(
        context.banksClient,
        context.payer,
        betTokenMint,
        creator.publicKey
      );

      await mintTo(
        context.banksClient,
        context.payer,
        betTokenMint,
        userTokenAccount,
        creator, // mint authority
        BigInt(1000_000_000_000) // 1000 tokens
      );
    });

    it("places a YES bet correctly", async () => {
      const betAmount = new BN(100_000_000_000); // 100 tokens

      const userYesAccount = await createAssociatedTokenAccount(
        context.banksClient,
        context.payer,
        yesMint,
        creator.publicKey
      );

      const userNoAccount = await createAssociatedTokenAccount(
        context.banksClient,
        context.payer,
        noMint,
        creator.publicKey
      );

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
      const betAmount = new BN(50_000_000_000); // 50 tokens

      // Get existing accounts
      const userYesAccount = anchor.utils.token.associatedAddress({
        mint: yesMint,
        owner: creator.publicKey,
      });

      const userNoAccount = anchor.utils.token.associatedAddress({
        mint: noMint,
        owner: creator.publicKey,
      });

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
      const userYesAccount = anchor.utils.token.associatedAddress({
        mint: yesMint,
        owner: creator.publicKey,
      });

      const userNoAccount = anchor.utils.token.associatedAddress({
        mint: noMint,
        owner: creator.publicKey,
      });

      try {
        await program.methods
          .placeBet(new BN(0), true)
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
      // Get current clock timestamp
      const clock = await context.banksClient.getClock();
      const currentTimestamp = Number(clock.unixTimestamp);

      // Create a market that expires in 2 seconds
      const expiryTimestamp = new BN(currentTimestamp + 2);

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

      expiredUserTokenAccount = await createAssociatedTokenAccount(
        context.banksClient,
        context.payer,
        betTokenMint,
        creator.publicKey
      ).catch(() => {
        // Account may already exist
        return anchor.utils.token.associatedAddress({
          mint: betTokenMint,
          owner: creator.publicKey,
        });
      });

      // Advance the clock past expiry
      context.setClock(
        new Clock(
          clock.slot + BigInt(10),
          clock.epochStartTimestamp,
          clock.epoch,
          clock.leaderScheduleEpoch,
          BigInt(currentTimestamp + 10) // 10 seconds past creation
        )
      );
    });

    it("fails to place bet on expired market", async () => {
      const userYesAccount = await createAssociatedTokenAccount(
        context.banksClient,
        context.payer,
        expiredYesMint,
        creator.publicKey
      );

      const userNoAccount = await createAssociatedTokenAccount(
        context.banksClient,
        context.payer,
        expiredNoMint,
        creator.publicKey
      );

      try {
        await program.methods
          .placeBet(new BN(10_000_000_000), true)
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

  describe("settle_market and redeem", () => {
    let settleMarketPda: PublicKey;
    let settleYesMint: PublicKey;
    let settleNoMint: PublicKey;
    let settleVault: PublicKey;

    before(async () => {
      // Reset clock for fresh tests
      const clock = await context.banksClient.getClock();
      const currentTimestamp = Number(clock.unixTimestamp);

      // Create a market that expires in 5 seconds
      const expiryTimestamp = new BN(currentTimestamp + 5);

      [settleMarketPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market"),
          creator.publicKey.toBuffer(),
          betTokenMint.toBuffer(),
          expiryTimestamp.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      [settleYesMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("yes_mint"), settleMarketPda.toBuffer()],
        program.programId
      );

      [settleNoMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("no_mint"), settleMarketPda.toBuffer()],
        program.programId
      );

      [settleVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), settleMarketPda.toBuffer()],
        program.programId
      );

      await program.methods
        .createMarket("Settle Market", "For testing settlement", expiryTimestamp)
        .accounts({
          creator: creator.publicKey,
          market: settleMarketPda,
          betTokenMint: betTokenMint,
          yesMint: settleYesMint,
          noMint: settleNoMint,
          vault: settleVault,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([creator])
        .rpc();
    });

    it("fails to settle before expiry", async () => {
      try {
        await program.methods
          .settleMarket(true)
          .accounts({
            creator: creator.publicKey,
            market: settleMarketPda,
          })
          .signers([creator])
          .rpc();
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.toString()).to.include("MarketNotExpired");
      }
    });

    it("settles market after expiry", async () => {
      // Advance clock past expiry
      const clock = await context.banksClient.getClock();
      context.setClock(
        new Clock(
          clock.slot + BigInt(100),
          clock.epochStartTimestamp,
          clock.epoch,
          clock.leaderScheduleEpoch,
          clock.unixTimestamp + BigInt(100)
        )
      );

      await program.methods
        .settleMarket(true) // YES wins
        .accounts({
          creator: creator.publicKey,
          market: settleMarketPda,
        })
        .signers([creator])
        .rpc();

      const market = await program.account.market.fetch(settleMarketPda);
      expect(market.status).to.deep.equal({ settled: {} });
      expect(market.outcome).to.equal(true);
    });

    it("fails to place bet on settled market", async () => {
      const userTokenAccount = anchor.utils.token.associatedAddress({
        mint: betTokenMint,
        owner: creator.publicKey,
      });

      const userYesAccount = await createAssociatedTokenAccount(
        context.banksClient,
        context.payer,
        settleYesMint,
        creator.publicKey
      );

      const userNoAccount = await createAssociatedTokenAccount(
        context.banksClient,
        context.payer,
        settleNoMint,
        creator.publicKey
      );

      try {
        await program.methods
          .placeBet(new BN(10_000_000_000), true)
          .accounts({
            bettor: creator.publicKey,
            market: settleMarketPda,
            betTokenMint: betTokenMint,
            yesMint: settleYesMint,
            noMint: settleNoMint,
            vault: settleVault,
            bettorTokenAccount: userTokenAccount,
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
      const clock = await context.banksClient.getClock();
      const pastTimestamp = new BN(Number(clock.unixTimestamp) - 3600); // 1 hour ago

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
      const clock = await context.banksClient.getClock();
      const expiryTimestamp = new BN(Number(clock.unixTimestamp) + 86400);
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
      const clock = await context.banksClient.getClock();
      const expiryTimestamp = new BN(Number(clock.unixTimestamp) + 86400 * 2);
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
