import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Settlement } from "../target/types/settlement";
import { MarketFactory } from "../target/types/market_factory";
import { Keypair, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint } from "@solana/spl-token";
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
});
