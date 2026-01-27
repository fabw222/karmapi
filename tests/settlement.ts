import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Settlement } from "../target/types/settlement";
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

  const settlementProgram = anchor.workspace.Settlement as Program<Settlement>;
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
      await settlementProgram.methods
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

      // Create a new market that expires in 1 second
      const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 1);

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

      // Wait for market to expire
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Settle market with YES outcome
      await settlementProgram.methods
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
      await settlementProgram.methods
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
        await settlementProgram.methods
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
  });
});
