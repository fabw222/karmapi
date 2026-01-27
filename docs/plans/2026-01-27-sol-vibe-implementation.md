# Sol Vibe Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a binary prediction market on Sonic SVM with pari-mutuel betting, supporting both price predictions (Pyth oracle) and general events (creator settlement).

**Architecture:** Two Anchor programs (market-factory, settlement) with a Next.js frontend. Markets hold YES/NO token pools, users bet on sides, winners split the total pool proportionally.

**Tech Stack:** Anchor (Rust), Next.js 14, Tailwind CSS, @solana/wallet-adapter, @coral-xyz/anchor, Pyth Network

**Reference:** See `docs/plans/2026-01-27-sol-vibe-design.md` for full design details.

---

## Phase 1: Project Setup

### Task 1: Initialize Anchor Workspace

**Files:**
- Create: `Anchor.toml`
- Create: `Cargo.toml`
- Create: `programs/market-factory/Cargo.toml`
- Create: `programs/market-factory/src/lib.rs`
- Create: `programs/settlement/Cargo.toml`
- Create: `programs/settlement/src/lib.rs`

**Step 1: Initialize Anchor project**

Run:
```bash
anchor init sol-vibe --template=multiple
cd sol-vibe
```

Note: If already in project directory, run:
```bash
anchor init . --template=multiple --force
```

**Step 2: Create second program (settlement)**

Run:
```bash
anchor new settlement
```

**Step 3: Rename default program to market-factory**

Run:
```bash
mv programs/sol-vibe programs/market-factory
```

Update `Anchor.toml`:
```toml
[features]
resolution = true
skip-lint = false

[programs.localnet]
market_factory = "YOUR_PROGRAM_ID_1"
settlement = "YOUR_PROGRAM_ID_2"

[programs.devnet]
market_factory = "YOUR_PROGRAM_ID_1"
settlement = "YOUR_PROGRAM_ID_2"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "Localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

**Step 4: Configure for Sonic SVM testnet**

Add to `Anchor.toml`:
```toml
[programs.sonic-testnet]
market_factory = "YOUR_PROGRAM_ID_1"
settlement = "YOUR_PROGRAM_ID_2"

[provider.sonic-testnet]
cluster = "https://api.testnet.sonic.game"
wallet = "~/.config/solana/id.json"
```

**Step 5: Build to generate program IDs**

Run:
```bash
anchor build
```

**Step 6: Update program IDs in Anchor.toml and lib.rs**

Get the generated program IDs:
```bash
solana address -k target/deploy/market_factory-keypair.json
solana address -k target/deploy/settlement-keypair.json
```

Update both `Anchor.toml` and `declare_id!()` in each `lib.rs`.

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: initialize Anchor workspace with market-factory and settlement programs"
```

---

### Task 2: Add Shared Types and Dependencies

**Files:**
- Modify: `programs/market-factory/Cargo.toml`
- Modify: `programs/settlement/Cargo.toml`
- Create: `programs/market-factory/src/state.rs`
- Modify: `programs/market-factory/src/lib.rs`

**Step 1: Update market-factory Cargo.toml**

```toml
[package]
name = "market-factory"
version = "0.1.0"
description = "Sol Vibe Market Factory Program"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "market_factory"

[features]
default = []
cbs = ["anchor-lang/cpi"]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]

[dependencies]
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
```

**Step 2: Update settlement Cargo.toml**

```toml
[package]
name = "settlement"
version = "0.1.0"
description = "Sol Vibe Settlement Program"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "settlement"

[features]
default = []
cbs = ["anchor-lang/cpi"]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]

[dependencies]
anchor-lang = "0.30.1"
anchor-spl = "0.30.1"
pyth-solana-receiver-sdk = "0.8.0"
```

**Step 3: Create state.rs with shared types**

Create `programs/market-factory/src/state.rs`:
```rust
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub creator: Pubkey,
    pub market_type: MarketType,
    #[max_len(128)]
    pub title: String,
    #[max_len(512)]
    pub description: String,

    // Betting token
    pub bet_token_mint: Pubkey,
    pub vault: Pubkey,

    // YES/NO token mints
    pub yes_mint: Pubkey,
    pub no_mint: Pubkey,

    // Pool stats
    pub yes_pool: u64,
    pub no_pool: u64,

    // Timing and status
    pub expiry_timestamp: i64,
    pub status: MarketStatus,
    pub outcome: Option<bool>,

    // Price market only
    pub price_feed_id: Option<[u8; 32]>,
    pub target_price: Option<i64>,

    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketType {
    Price,
    Event,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    Open,
    Settled,
}

impl Market {
    pub const SEED_PREFIX: &'static [u8] = b"market";
}
```

**Step 4: Update lib.rs to use state module**

Update `programs/market-factory/src/lib.rs`:
```rust
use anchor_lang::prelude::*;

pub mod state;

declare_id!("YOUR_PROGRAM_ID");

#[program]
pub mod market_factory {
    use super::*;

    pub fn create_event_market(
        _ctx: Context<CreateEventMarket>,
        _title: String,
        _description: String,
        _expiry_timestamp: i64,
    ) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateEventMarket {}
```

**Step 5: Build to verify**

Run:
```bash
anchor build
```

Expected: Build succeeds

**Step 6: Commit**

```bash
git add programs/
git commit -m "chore: add shared types and dependencies"
```

---

## Phase 2: Market Factory Contract

### Task 3: Implement create_event_market

**Files:**
- Create: `programs/market-factory/src/instructions/mod.rs`
- Create: `programs/market-factory/src/instructions/create_event_market.rs`
- Modify: `programs/market-factory/src/lib.rs`
- Create: `tests/market-factory.ts`

**Step 1: Write the failing test**

Create `tests/market-factory.ts`:
```typescript
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

  describe("create_event_market", () => {
    it("creates an event market with correct parameters", async () => {
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
        .createEventMarket(title, description, expiryTimestamp)
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
      expect(market.marketType).to.deep.equal({ event: {} });
      expect(market.status).to.deep.equal({ open: {} });
      expect(market.yesPool.toNumber()).to.equal(0);
      expect(market.noPool.toNumber()).to.equal(0);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
anchor test
```

Expected: FAIL - instruction not implemented

**Step 3: Create instructions module**

Create `programs/market-factory/src/instructions/mod.rs`:
```rust
pub mod create_event_market;

pub use create_event_market::*;
```

**Step 4: Implement create_event_market instruction**

Create `programs/market-factory/src/instructions/create_event_market.rs`:
```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::{Market, MarketStatus, MarketType};

#[derive(Accounts)]
#[instruction(title: String, description: String, expiry_timestamp: i64)]
pub struct CreateEventMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
        seeds = [
            Market::SEED_PREFIX,
            creator.key().as_ref(),
            bet_token_mint.key().as_ref(),
            &expiry_timestamp.to_le_bytes(),
        ],
        bump,
    )]
    pub market: Account<'info, Market>,

    pub bet_token_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        seeds = [b"yes_mint", market.key().as_ref()],
        bump,
        mint::decimals = bet_token_mint.decimals,
        mint::authority = market,
    )]
    pub yes_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        seeds = [b"no_mint", market.key().as_ref()],
        bump,
        mint::decimals = bet_token_mint.decimals,
        mint::authority = market,
    )]
    pub no_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        seeds = [b"vault", market.key().as_ref()],
        bump,
        token::mint = bet_token_mint,
        token::authority = market,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn create_event_market(
    ctx: Context<CreateEventMarket>,
    title: String,
    description: String,
    expiry_timestamp: i64,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    require!(
        expiry_timestamp > clock.unix_timestamp,
        MarketError::ExpiryInPast
    );
    require!(title.len() <= 128, MarketError::TitleTooLong);
    require!(description.len() <= 512, MarketError::DescriptionTooLong);

    market.creator = ctx.accounts.creator.key();
    market.market_type = MarketType::Event;
    market.title = title;
    market.description = description;
    market.bet_token_mint = ctx.accounts.bet_token_mint.key();
    market.vault = ctx.accounts.vault.key();
    market.yes_mint = ctx.accounts.yes_mint.key();
    market.no_mint = ctx.accounts.no_mint.key();
    market.yes_pool = 0;
    market.no_pool = 0;
    market.expiry_timestamp = expiry_timestamp;
    market.status = MarketStatus::Open;
    market.outcome = None;
    market.price_feed_id = None;
    market.target_price = None;
    market.bump = ctx.bumps.market;

    Ok(())
}

#[error_code]
pub enum MarketError {
    #[msg("Expiry timestamp must be in the future")]
    ExpiryInPast,
    #[msg("Title exceeds maximum length of 128 characters")]
    TitleTooLong,
    #[msg("Description exceeds maximum length of 512 characters")]
    DescriptionTooLong,
}
```

**Step 5: Update lib.rs**

Update `programs/market-factory/src/lib.rs`:
```rust
use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("YOUR_PROGRAM_ID");

#[program]
pub mod market_factory {
    use super::*;

    pub fn create_event_market(
        ctx: Context<CreateEventMarket>,
        title: String,
        description: String,
        expiry_timestamp: i64,
    ) -> Result<()> {
        instructions::create_event_market::create_event_market(ctx, title, description, expiry_timestamp)
    }
}
```

**Step 6: Build and run test**

Run:
```bash
anchor build && anchor test
```

Expected: PASS

**Step 7: Commit**

```bash
git add programs/market-factory/ tests/
git commit -m "feat(market-factory): implement create_event_market instruction"
```

---

### Task 4: Implement create_price_market

**Files:**
- Create: `programs/market-factory/src/instructions/create_price_market.rs`
- Modify: `programs/market-factory/src/instructions/mod.rs`
- Modify: `programs/market-factory/src/lib.rs`
- Modify: `tests/market-factory.ts`

**Step 1: Write the failing test**

Add to `tests/market-factory.ts`:
```typescript
describe("create_price_market", () => {
  it("creates a price market with Pyth feed", async () => {
    const targetPrice = new anchor.BN(150000_00000000); // $150,000 with 8 decimals
    const expiryTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400 * 7);

    // BTC/USD Pyth feed ID (32 bytes)
    const priceFeedId = Buffer.from(
      "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
      "hex"
    );

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
      .createPriceMarket(
        Array.from(priceFeedId),
        targetPrice,
        expiryTimestamp
      )
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

    expect(market.marketType).to.deep.equal({ price: {} });
    expect(market.priceFeedId).to.deep.equal(Array.from(priceFeedId));
    expect(market.targetPrice.toNumber()).to.equal(targetPrice.toNumber());
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
anchor test
```

Expected: FAIL

**Step 3: Create create_price_market.rs**

Create `programs/market-factory/src/instructions/create_price_market.rs`:
```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::{Market, MarketStatus, MarketType};
use crate::instructions::create_event_market::MarketError;

#[derive(Accounts)]
#[instruction(price_feed_id: [u8; 32], target_price: i64, expiry_timestamp: i64)]
pub struct CreatePriceMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
        seeds = [
            Market::SEED_PREFIX,
            creator.key().as_ref(),
            bet_token_mint.key().as_ref(),
            &expiry_timestamp.to_le_bytes(),
        ],
        bump,
    )]
    pub market: Account<'info, Market>,

    pub bet_token_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        seeds = [b"yes_mint", market.key().as_ref()],
        bump,
        mint::decimals = bet_token_mint.decimals,
        mint::authority = market,
    )]
    pub yes_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        seeds = [b"no_mint", market.key().as_ref()],
        bump,
        mint::decimals = bet_token_mint.decimals,
        mint::authority = market,
    )]
    pub no_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        seeds = [b"vault", market.key().as_ref()],
        bump,
        token::mint = bet_token_mint,
        token::authority = market,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn create_price_market(
    ctx: Context<CreatePriceMarket>,
    price_feed_id: [u8; 32],
    target_price: i64,
    expiry_timestamp: i64,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    require!(
        expiry_timestamp > clock.unix_timestamp,
        MarketError::ExpiryInPast
    );
    require!(target_price > 0, MarketError::InvalidTargetPrice);

    // Generate title from price
    let title = format!("Price >= ${}", target_price / 100_000_000);
    let description = "Price prediction market. Settles automatically via Pyth oracle.".to_string();

    market.creator = ctx.accounts.creator.key();
    market.market_type = MarketType::Price;
    market.title = title;
    market.description = description;
    market.bet_token_mint = ctx.accounts.bet_token_mint.key();
    market.vault = ctx.accounts.vault.key();
    market.yes_mint = ctx.accounts.yes_mint.key();
    market.no_mint = ctx.accounts.no_mint.key();
    market.yes_pool = 0;
    market.no_pool = 0;
    market.expiry_timestamp = expiry_timestamp;
    market.status = MarketStatus::Open;
    market.outcome = None;
    market.price_feed_id = Some(price_feed_id);
    market.target_price = Some(target_price);
    market.bump = ctx.bumps.market;

    Ok(())
}
```

**Step 4: Update mod.rs**

Update `programs/market-factory/src/instructions/mod.rs`:
```rust
pub mod create_event_market;
pub mod create_price_market;

pub use create_event_market::*;
pub use create_price_market::*;
```

**Step 5: Add error variant**

Add to `MarketError` in `create_event_market.rs`:
```rust
#[error_code]
pub enum MarketError {
    #[msg("Expiry timestamp must be in the future")]
    ExpiryInPast,
    #[msg("Title exceeds maximum length of 128 characters")]
    TitleTooLong,
    #[msg("Description exceeds maximum length of 512 characters")]
    DescriptionTooLong,
    #[msg("Target price must be positive")]
    InvalidTargetPrice,
}
```

**Step 6: Update lib.rs**

Add to `programs/market-factory/src/lib.rs`:
```rust
pub fn create_price_market(
    ctx: Context<CreatePriceMarket>,
    price_feed_id: [u8; 32],
    target_price: i64,
    expiry_timestamp: i64,
) -> Result<()> {
    instructions::create_price_market::create_price_market(ctx, price_feed_id, target_price, expiry_timestamp)
}
```

**Step 7: Build and run test**

Run:
```bash
anchor build && anchor test
```

Expected: PASS

**Step 8: Commit**

```bash
git add programs/market-factory/
git commit -m "feat(market-factory): implement create_price_market instruction"
```

---

### Task 5: Implement place_bet

**Files:**
- Create: `programs/market-factory/src/instructions/place_bet.rs`
- Modify: `programs/market-factory/src/instructions/mod.rs`
- Modify: `programs/market-factory/src/lib.rs`
- Modify: `tests/market-factory.ts`

**Step 1: Write the failing test**

Add to `tests/market-factory.ts`:
```typescript
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
      .createEventMarket("Test Bet Market", "Description", expiryTimestamp)
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
        bettorNoAccount: userYesAccount, // Not used for YES bet, but required
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
```

**Step 2: Run test to verify it fails**

Run:
```bash
anchor test
```

Expected: FAIL

**Step 3: Implement place_bet.rs**

Create `programs/market-factory/src/instructions/place_bet.rs`:
```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::state::{Market, MarketStatus};
use crate::instructions::create_event_market::MarketError;

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Open @ MarketError::MarketNotOpen,
    )]
    pub market: Account<'info, Market>,

    #[account(
        constraint = bet_token_mint.key() == market.bet_token_mint @ MarketError::InvalidBetToken,
    )]
    pub bet_token_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = yes_mint.key() == market.yes_mint @ MarketError::InvalidMint,
    )]
    pub yes_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = no_mint.key() == market.no_mint @ MarketError::InvalidMint,
    )]
    pub no_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = vault.key() == market.vault @ MarketError::InvalidVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = bettor_token_account.mint == bet_token_mint.key(),
        constraint = bettor_token_account.owner == bettor.key(),
    )]
    pub bettor_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = bettor_yes_account.mint == yes_mint.key(),
        constraint = bettor_yes_account.owner == bettor.key(),
    )]
    pub bettor_yes_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = bettor_no_account.mint == no_mint.key(),
        constraint = bettor_no_account.owner == bettor.key(),
    )]
    pub bettor_no_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn place_bet(ctx: Context<PlaceBet>, amount: u64, side: bool) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    require!(
        clock.unix_timestamp < market.expiry_timestamp,
        MarketError::MarketExpired
    );
    require!(amount > 0, MarketError::InvalidBetAmount);

    // Transfer bet tokens to vault
    let transfer_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.bettor_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.bettor.to_account_info(),
        },
    );
    token::transfer(transfer_ctx, amount)?;

    // Mint YES or NO tokens to bettor
    let market_key = market.key();
    let seeds = &[
        Market::SEED_PREFIX,
        market.creator.as_ref(),
        market.bet_token_mint.as_ref(),
        &market.expiry_timestamp.to_le_bytes(),
        &[market.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    if side {
        // Mint YES tokens
        let mint_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.yes_mint.to_account_info(),
                to: ctx.accounts.bettor_yes_account.to_account_info(),
                authority: market.to_account_info(),
            },
            signer_seeds,
        );
        token::mint_to(mint_ctx, amount)?;
        market.yes_pool = market.yes_pool.checked_add(amount).unwrap();
    } else {
        // Mint NO tokens
        let mint_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.no_mint.to_account_info(),
                to: ctx.accounts.bettor_no_account.to_account_info(),
                authority: market.to_account_info(),
            },
            signer_seeds,
        );
        token::mint_to(mint_ctx, amount)?;
        market.no_pool = market.no_pool.checked_add(amount).unwrap();
    }

    Ok(())
}
```

**Step 4: Add error variants**

Add to `MarketError`:
```rust
#[msg("Market is not open")]
MarketNotOpen,
#[msg("Market has expired")]
MarketExpired,
#[msg("Invalid bet token")]
InvalidBetToken,
#[msg("Invalid mint")]
InvalidMint,
#[msg("Invalid vault")]
InvalidVault,
#[msg("Bet amount must be positive")]
InvalidBetAmount,
```

**Step 5: Update mod.rs and lib.rs**

Update `mod.rs`:
```rust
pub mod create_event_market;
pub mod create_price_market;
pub mod place_bet;

pub use create_event_market::*;
pub use create_price_market::*;
pub use place_bet::*;
```

Add to `lib.rs`:
```rust
pub fn place_bet(ctx: Context<PlaceBet>, amount: u64, side: bool) -> Result<()> {
    instructions::place_bet::place_bet(ctx, amount, side)
}
```

**Step 6: Build and run test**

Run:
```bash
anchor build && anchor test
```

Expected: PASS

**Step 7: Commit**

```bash
git add programs/market-factory/
git commit -m "feat(market-factory): implement place_bet instruction"
```

---

## Phase 3: Settlement Contract

### Task 6: Implement settle_event_market

**Files:**
- Create: `programs/settlement/src/instructions/mod.rs`
- Create: `programs/settlement/src/instructions/settle_event_market.rs`
- Modify: `programs/settlement/src/lib.rs`
- Create: `tests/settlement.ts`

**Step 1: Write the failing test**

Create `tests/settlement.ts`:
```typescript
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
      .createEventMarket("Test Settlement", "Description", expiryTimestamp)
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

  describe("settle_event_market", () => {
    it("allows creator to settle with YES outcome", async () => {
      await settlementProgram.methods
        .settleEventMarket(true) // YES wins
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

    it("rejects non-creator settlement", async () => {
      const nonCreator = Keypair.generate();

      try {
        await settlementProgram.methods
          .settleEventMarket(false)
          .accounts({
            creator: nonCreator.publicKey,
            market: marketPda,
          })
          .signers([nonCreator])
          .rpc();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e.message).to.include("Unauthorized");
      }
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
anchor test
```

Expected: FAIL

**Step 3: Settlement needs to read Market from market-factory**

The settlement program needs to be able to read and modify the Market account from market-factory. We'll use CPI or share the account structure.

For simplicity in a hackathon, we'll duplicate the Market struct in settlement and use cross-program invocation patterns.

Create `programs/settlement/src/state.rs`:
```rust
use anchor_lang::prelude::*;

// Mirror of Market struct from market-factory
// In production, use a shared crate
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub creator: Pubkey,
    pub market_type: MarketType,
    #[max_len(128)]
    pub title: String,
    #[max_len(512)]
    pub description: String,
    pub bet_token_mint: Pubkey,
    pub vault: Pubkey,
    pub yes_mint: Pubkey,
    pub no_mint: Pubkey,
    pub yes_pool: u64,
    pub no_pool: u64,
    pub expiry_timestamp: i64,
    pub status: MarketStatus,
    pub outcome: Option<bool>,
    pub price_feed_id: Option<[u8; 32]>,
    pub target_price: Option<i64>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketType {
    Price,
    Event,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    Open,
    Settled,
}
```

**Step 4: Implement settle_event_market**

Create `programs/settlement/src/instructions/mod.rs`:
```rust
pub mod settle_event_market;

pub use settle_event_market::*;
```

Create `programs/settlement/src/instructions/settle_event_market.rs`:
```rust
use anchor_lang::prelude::*;

use crate::state::{Market, MarketStatus, MarketType};

#[derive(Accounts)]
pub struct SettleEventMarket<'info> {
    pub creator: Signer<'info>,

    #[account(
        mut,
        constraint = market.creator == creator.key() @ SettlementError::Unauthorized,
        constraint = market.market_type == MarketType::Event @ SettlementError::WrongMarketType,
        constraint = market.status == MarketStatus::Open @ SettlementError::AlreadySettled,
    )]
    pub market: Account<'info, Market>,
}

pub fn settle_event_market(ctx: Context<SettleEventMarket>, outcome: bool) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    require!(
        clock.unix_timestamp >= market.expiry_timestamp,
        SettlementError::MarketNotExpired
    );

    market.status = MarketStatus::Settled;
    market.outcome = Some(outcome);

    Ok(())
}

#[error_code]
pub enum SettlementError {
    #[msg("Only the market creator can settle this market")]
    Unauthorized,
    #[msg("This instruction is only for event markets")]
    WrongMarketType,
    #[msg("Market has already been settled")]
    AlreadySettled,
    #[msg("Market has not expired yet")]
    MarketNotExpired,
}
```

**Step 5: Update settlement lib.rs**

Update `programs/settlement/src/lib.rs`:
```rust
use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("YOUR_SETTLEMENT_PROGRAM_ID");

#[program]
pub mod settlement {
    use super::*;

    pub fn settle_event_market(ctx: Context<SettleEventMarket>, outcome: bool) -> Result<()> {
        instructions::settle_event_market::settle_event_market(ctx, outcome)
    }
}
```

**Step 6: Build and run test**

Run:
```bash
anchor build && anchor test
```

Expected: PASS

**Step 7: Commit**

```bash
git add programs/settlement/ tests/
git commit -m "feat(settlement): implement settle_event_market instruction"
```

---

### Task 7: Implement settle_price_market

**Files:**
- Create: `programs/settlement/src/instructions/settle_price_market.rs`
- Modify: `programs/settlement/src/instructions/mod.rs`
- Modify: `programs/settlement/src/lib.rs`
- Modify: `tests/settlement.ts`

**Step 1: Implement settle_price_market**

Create `programs/settlement/src/instructions/settle_price_market.rs`:
```rust
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::state::{Market, MarketStatus, MarketType};
use crate::instructions::settle_event_market::SettlementError;

#[derive(Accounts)]
pub struct SettlePriceMarket<'info> {
    pub settler: Signer<'info>,

    #[account(
        mut,
        constraint = market.market_type == MarketType::Price @ SettlementError::WrongMarketType,
        constraint = market.status == MarketStatus::Open @ SettlementError::AlreadySettled,
    )]
    pub market: Account<'info, Market>,

    pub price_update: Account<'info, PriceUpdateV2>,
}

pub fn settle_price_market(ctx: Context<SettlePriceMarket>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    require!(
        clock.unix_timestamp >= market.expiry_timestamp,
        SettlementError::MarketNotExpired
    );

    let price_feed_id = market.price_feed_id.ok_or(SettlementError::MissingPriceFeed)?;
    let target_price = market.target_price.ok_or(SettlementError::MissingTargetPrice)?;

    // Get price from Pyth
    let price_update = &ctx.accounts.price_update;
    let price = price_update.get_price_no_older_than(
        &clock,
        60, // Max 60 seconds old
        &price_feed_id,
    ).map_err(|_| SettlementError::PriceUnavailable)?;

    // Determine outcome: YES wins if price >= target
    let current_price = price.price;
    let outcome = current_price >= target_price;

    market.status = MarketStatus::Settled;
    market.outcome = Some(outcome);

    Ok(())
}
```

**Step 2: Add error variants and update mod.rs**

Add to `SettlementError`:
```rust
#[msg("Price feed ID not set")]
MissingPriceFeed,
#[msg("Target price not set")]
MissingTargetPrice,
#[msg("Unable to get price from oracle")]
PriceUnavailable,
```

Update `mod.rs`:
```rust
pub mod settle_event_market;
pub mod settle_price_market;

pub use settle_event_market::*;
pub use settle_price_market::*;
```

**Step 3: Update lib.rs**

Add to `lib.rs`:
```rust
pub fn settle_price_market(ctx: Context<SettlePriceMarket>) -> Result<()> {
    instructions::settle_price_market::settle_price_market(ctx)
}
```

**Step 4: Build**

Run:
```bash
anchor build
```

Expected: Build succeeds (skip test for Pyth as it requires mainnet/devnet)

**Step 5: Commit**

```bash
git add programs/settlement/
git commit -m "feat(settlement): implement settle_price_market with Pyth oracle"
```

---

### Task 8: Implement redeem

**Files:**
- Create: `programs/settlement/src/instructions/redeem.rs`
- Modify: `programs/settlement/src/instructions/mod.rs`
- Modify: `programs/settlement/src/lib.rs`
- Modify: `tests/settlement.ts`

**Step 1: Write the failing test**

Add to `tests/settlement.ts`:
```typescript
describe("redeem", () => {
  // ... setup code to create market, place bets, settle ...

  it("allows winner to redeem proportionally", async () => {
    // User with 100 YES tokens in a 250 YES / 200 NO pool
    // If YES wins, they get 100/250 * 450 = 180 tokens

    await settlementProgram.methods
      .redeem(new anchor.BN(100_000_000_000))
      .accounts({
        redeemer: winner.publicKey,
        market: marketPda,
        vault: vault,
        winningMint: yesMint,
        redeemerWinningAccount: winnerYesAccount,
        redeemerBetAccount: winnerBetAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([winner])
      .rpc();

    // Check balance increased
  });
});
```

**Step 2: Implement redeem.rs**

Create `programs/settlement/src/instructions/redeem.rs`:
```rust
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::state::{Market, MarketStatus};
use crate::instructions::settle_event_market::SettlementError;

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub redeemer: Signer<'info>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Settled @ SettlementError::NotSettled,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        constraint = vault.key() == market.vault @ SettlementError::InvalidVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = winning_mint.key() == get_winning_mint(&market)? @ SettlementError::WrongMint,
    )]
    pub winning_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = redeemer_winning_account.mint == winning_mint.key(),
        constraint = redeemer_winning_account.owner == redeemer.key(),
    )]
    pub redeemer_winning_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = redeemer_bet_account.mint == market.bet_token_mint,
        constraint = redeemer_bet_account.owner == redeemer.key(),
    )]
    pub redeemer_bet_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

fn get_winning_mint(market: &Market) -> Result<Pubkey> {
    let outcome = market.outcome.ok_or(SettlementError::NotSettled)?;
    Ok(if outcome { market.yes_mint } else { market.no_mint })
}

pub fn redeem(ctx: Context<Redeem>, amount: u64) -> Result<()> {
    let market = &ctx.accounts.market;

    require!(amount > 0, SettlementError::InvalidAmount);

    let outcome = market.outcome.ok_or(SettlementError::NotSettled)?;

    // Calculate payout
    let total_pool = market.yes_pool.checked_add(market.no_pool).unwrap();
    let winning_pool = if outcome { market.yes_pool } else { market.no_pool };

    // payout = amount / winning_pool * total_pool
    let payout = (amount as u128)
        .checked_mul(total_pool as u128)
        .unwrap()
        .checked_div(winning_pool as u128)
        .unwrap() as u64;

    // Burn winning tokens
    let burn_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Burn {
            mint: ctx.accounts.winning_mint.to_account_info(),
            from: ctx.accounts.redeemer_winning_account.to_account_info(),
            authority: ctx.accounts.redeemer.to_account_info(),
        },
    );
    token::burn(burn_ctx, amount)?;

    // Transfer bet tokens from vault
    let seeds = &[
        b"market".as_ref(),
        market.creator.as_ref(),
        market.bet_token_mint.as_ref(),
        &market.expiry_timestamp.to_le_bytes(),
        &[market.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.redeemer_bet_account.to_account_info(),
            authority: ctx.accounts.market.to_account_info(),
        },
        signer_seeds,
    );
    token::transfer(transfer_ctx, payout)?;

    Ok(())
}
```

**Step 3: Add error variants and update files**

Add to `SettlementError`:
```rust
#[msg("Market not settled yet")]
NotSettled,
#[msg("Invalid vault")]
InvalidVault,
#[msg("Wrong mint for redemption")]
WrongMint,
#[msg("Amount must be positive")]
InvalidAmount,
```

Update `mod.rs` and `lib.rs` accordingly.

**Step 4: Build and test**

Run:
```bash
anchor build && anchor test
```

**Step 5: Commit**

```bash
git add programs/settlement/
git commit -m "feat(settlement): implement redeem instruction with pari-mutuel payout"
```

---

## Phase 4: Frontend Setup

### Task 9: Initialize Next.js Frontend

**Files:**
- Create: `app/` directory with Next.js structure
- Create: `package.json`
- Create: `tailwind.config.js`

**Step 1: Initialize Next.js**

Run:
```bash
npx create-next-app@latest app --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*"
```

**Step 2: Install Solana dependencies**

```bash
cd app
npm install @solana/web3.js @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets @coral-xyz/anchor @tanstack/react-query
```

**Step 3: Create wallet provider**

Create `app/providers/WalletProvider.tsx`:
```typescript
"use client";

import { FC, ReactNode, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

import "@solana/wallet-adapter-react-ui/styles.css";

const SONIC_TESTNET_RPC = "https://api.testnet.sonic.game";

export const WalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={SONIC_TESTNET_RPC}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
```

**Step 4: Update layout.tsx**

```typescript
import { WalletProvider } from "./providers/WalletProvider";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
```

**Step 5: Commit**

```bash
git add app/
git commit -m "chore: initialize Next.js frontend with wallet provider"
```

---

### Task 10: Create Market List Page

**Files:**
- Modify: `app/page.tsx`
- Create: `app/components/MarketCard.tsx`
- Create: `app/hooks/useMarkets.ts`

**Step 1: Create MarketCard component**

Create `app/components/MarketCard.tsx`:
```typescript
"use client";

import Link from "next/link";

interface MarketCardProps {
  pubkey: string;
  title: string;
  betToken: string;
  yesPool: number;
  noPool: number;
  expiry: Date;
  status: "open" | "settled";
  marketType: "price" | "event";
}

export function MarketCard({
  pubkey,
  title,
  betToken,
  yesPool,
  noPool,
  expiry,
  status,
  marketType,
}: MarketCardProps) {
  const totalPool = yesPool + noPool;
  const yesOdds = totalPool > 0 ? (totalPool / yesPool).toFixed(2) : "-.--";
  const noOdds = totalPool > 0 ? (totalPool / noPool).toFixed(2) : "-.--";

  return (
    <Link href={`/market/${pubkey}`}>
      <div className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center gap-2 mb-2">
          <span>{marketType === "price" ? "📈" : "🎯"}</span>
          <h3 className="font-semibold">{title}</h3>
        </div>

        <p className="text-sm text-gray-600 mb-2">投注代币: {betToken}</p>

        <div className="flex gap-4 text-sm mb-2">
          <span>YES {yesOdds}x</span>
          <span>|</span>
          <span>NO {noOdds}x</span>
        </div>

        <div className="flex justify-between text-xs text-gray-500">
          <span>总池: {totalPool.toLocaleString()}</span>
          <span>截止: {expiry.toLocaleDateString()}</span>
        </div>

        {status === "settled" && (
          <span className="inline-block mt-2 px-2 py-1 bg-gray-200 rounded text-xs">
            已结算
          </span>
        )}
      </div>
    </Link>
  );
}
```

**Step 2: Create markets hook**

Create `app/hooks/useMarkets.ts`:
```typescript
"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// TODO: Import IDL after build
// import { MarketFactory } from "../idl/market_factory";

export function useMarkets() {
  const { connection } = useConnection();

  return useQuery({
    queryKey: ["markets"],
    queryFn: async () => {
      // TODO: Fetch all market accounts
      // const program = new Program(IDL, PROGRAM_ID, provider);
      // return program.account.market.all();
      return [];
    },
  });
}
```

**Step 3: Update page.tsx**

```typescript
"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { MarketCard } from "./components/MarketCard";
import { useMarkets } from "./hooks/useMarkets";

export default function Home() {
  const { data: markets, isLoading } = useMarkets();

  return (
    <main className="container mx-auto px-4 py-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Sol Vibe</h1>
        <WalletMultiButton />
      </header>

      <div className="flex gap-4 mb-6">
        <a href="/create" className="px-4 py-2 bg-blue-600 text-white rounded">
          创建市场
        </a>
        <a href="/portfolio" className="px-4 py-2 border rounded">
          我的持仓
        </a>
      </div>

      {isLoading ? (
        <p>加载中...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets?.map((market: any) => (
            <MarketCard
              key={market.pubkey}
              pubkey={market.pubkey}
              title={market.title}
              betToken="TRUMP"
              yesPool={market.yesPool}
              noPool={market.noPool}
              expiry={new Date(market.expiryTimestamp * 1000)}
              status={market.status}
              marketType={market.marketType}
            />
          ))}
        </div>
      )}
    </main>
  );
}
```

**Step 4: Commit**

```bash
git add app/
git commit -m "feat(frontend): add market list page with MarketCard component"
```

---

### Task 11: Create Market Detail Page with Betting

**Files:**
- Create: `app/market/[id]/page.tsx`
- Create: `app/components/BetPanel.tsx`
- Create: `app/components/OddsDisplay.tsx`

**Step 1: Create OddsDisplay component**

Create `app/components/OddsDisplay.tsx`:
```typescript
interface OddsDisplayProps {
  yesPool: number;
  noPool: number;
  tokenSymbol: string;
}

export function OddsDisplay({ yesPool, noPool, tokenSymbol }: OddsDisplayProps) {
  const totalPool = yesPool + noPool;
  const yesOdds = yesPool > 0 ? (totalPool / yesPool).toFixed(2) : "-.--";
  const noOdds = noPool > 0 ? (totalPool / noPool).toFixed(2) : "-.--";

  return (
    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-100 rounded-lg">
      <div className="text-center p-4 bg-green-50 rounded">
        <div className="text-2xl font-bold text-green-600">YES</div>
        <div className="text-3xl font-bold">{yesOdds}x</div>
        <div className="text-sm text-gray-600">
          {yesPool.toLocaleString()} {tokenSymbol}
        </div>
      </div>
      <div className="text-center p-4 bg-red-50 rounded">
        <div className="text-2xl font-bold text-red-600">NO</div>
        <div className="text-3xl font-bold">{noOdds}x</div>
        <div className="text-sm text-gray-600">
          {noPool.toLocaleString()} {tokenSymbol}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create BetPanel component**

Create `app/components/BetPanel.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface BetPanelProps {
  marketPubkey: string;
  tokenSymbol: string;
  onBet: (amount: number, side: boolean) => Promise<void>;
}

export function BetPanel({ marketPubkey, tokenSymbol, onBet }: BetPanelProps) {
  const { connected } = useWallet();
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const handleBet = async (side: boolean) => {
    if (!amount || isNaN(Number(amount))) return;

    setLoading(true);
    try {
      await onBet(Number(amount), side);
      setAmount("");
    } catch (error) {
      console.error("Bet failed:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
    return (
      <div className="p-4 bg-yellow-50 rounded text-center">
        请先连接钱包
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg">
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">投注数量</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="flex-1 px-3 py-2 border rounded"
          />
          <span className="text-gray-600">{tokenSymbol}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => handleBet(true)}
          disabled={loading || !amount}
          className="px-4 py-3 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "..." : "投注 YES"}
        </button>
        <button
          onClick={() => handleBet(false)}
          disabled={loading || !amount}
          className="px-4 py-3 bg-red-600 text-white rounded font-semibold hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "..." : "投注 NO"}
        </button>
      </div>
    </div>
  );
}
```

**Step 3: Create market detail page**

Create `app/market/[id]/page.tsx`:
```typescript
"use client";

import { useParams } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { OddsDisplay } from "../../components/OddsDisplay";
import { BetPanel } from "../../components/BetPanel";

export default function MarketPage() {
  const params = useParams();
  const marketId = params.id as string;

  // TODO: Fetch market data
  const market = {
    title: "Trump 1/31前打伊朗?",
    description: "Market resolves YES if military action occurs before deadline.",
    betToken: "TRUMP",
    creator: "7xK2...",
    yesPool: 250000,
    noPool: 200000,
    expiry: new Date("2026-01-31"),
    status: "open",
    marketType: "event",
  };

  const handleBet = async (amount: number, side: boolean) => {
    // TODO: Call place_bet instruction
    console.log(`Betting ${amount} on ${side ? "YES" : "NO"}`);
  };

  return (
    <main className="container mx-auto px-4 py-8 max-w-2xl">
      <header className="flex justify-between items-center mb-8">
        <a href="/" className="text-blue-600">← 返回</a>
        <WalletMultiButton />
      </header>

      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span>{market.marketType === "price" ? "📈" : "🎯"}</span>
            <h1 className="text-2xl font-bold">{market.title}</h1>
          </div>
          <p className="text-gray-600">{market.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">投注代币:</span> {market.betToken}
          </div>
          <div>
            <span className="text-gray-500">创建者:</span> {market.creator}
          </div>
          <div>
            <span className="text-gray-500">截止时间:</span>{" "}
            {market.expiry.toLocaleString()}
          </div>
          <div>
            <span className="text-gray-500">状态:</span>{" "}
            {market.status === "open" ? "进行中" : "已结算"}
          </div>
        </div>

        <OddsDisplay
          yesPool={market.yesPool}
          noPool={market.noPool}
          tokenSymbol={market.betToken}
        />

        {market.status === "open" && (
          <BetPanel
            marketPubkey={marketId}
            tokenSymbol={market.betToken}
            onBet={handleBet}
          />
        )}
      </div>
    </main>
  );
}
```

**Step 4: Commit**

```bash
git add app/
git commit -m "feat(frontend): add market detail page with betting panel"
```

---

### Task 12: Create Market Form and Portfolio Page

**Files:**
- Create: `app/create/page.tsx`
- Create: `app/portfolio/page.tsx`
- Create: `app/components/CreateMarketForm.tsx`

**Step 1: Create CreateMarketForm**

Create `app/components/CreateMarketForm.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export function CreateMarketForm() {
  const { connected } = useWallet();
  const [marketType, setMarketType] = useState<"event" | "price">("event");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [betTokenMint, setBetTokenMint] = useState("");
  const [expiry, setExpiry] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected) return;

    setLoading(true);
    try {
      // TODO: Call create_event_market or create_price_market
      console.log("Creating market...");
    } catch (error) {
      console.error("Failed to create market:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!connected) {
    return <div className="p-4 bg-yellow-50 rounded">请先连接钱包</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">市场类型</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={marketType === "event"}
              onChange={() => setMarketType("event")}
            />
            通用事件
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={marketType === "price"}
              onChange={() => setMarketType("price")}
            />
            价格预测
          </label>
        </div>
      </div>

      {marketType === "event" ? (
        <>
          <div>
            <label className="block text-sm font-medium mb-1">标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Trump 1/31前打伊朗?"
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="详细规则说明..."
              className="w-full px-3 py-2 border rounded"
              rows={3}
            />
          </div>
        </>
      ) : (
        <div>
          <label className="block text-sm font-medium mb-1">目标价格 (USD)</label>
          <input
            type="number"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder="150000"
            className="w-full px-3 py-2 border rounded"
            required
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">投注代币 (合约地址)</label>
        <input
          type="text"
          value={betTokenMint}
          onChange={(e) => setBetTokenMint(e.target.value)}
          placeholder="6p6x..."
          className="w-full px-3 py-2 border rounded"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">截止时间</label>
        <input
          type="datetime-local"
          value={expiry}
          onChange={(e) => setExpiry(e.target.value)}
          className="w-full px-3 py-2 border rounded"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-3 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "创建中..." : "创建市场"}
      </button>
    </form>
  );
}
```

**Step 2: Create pages**

Create `app/create/page.tsx`:
```typescript
"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { CreateMarketForm } from "../components/CreateMarketForm";

export default function CreatePage() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-lg">
      <header className="flex justify-between items-center mb-8">
        <a href="/" className="text-blue-600">← 返回</a>
        <WalletMultiButton />
      </header>

      <h1 className="text-2xl font-bold mb-6">创建市场</h1>
      <CreateMarketForm />
    </main>
  );
}
```

Create `app/portfolio/page.tsx`:
```typescript
"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";

export default function PortfolioPage() {
  const { connected, publicKey } = useWallet();

  // TODO: Fetch user's positions and created markets

  if (!connected) {
    return (
      <main className="container mx-auto px-4 py-8">
        <WalletMultiButton />
        <p className="mt-4">请连接钱包查看持仓</p>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <header className="flex justify-between items-center mb-8">
        <a href="/" className="text-blue-600">← 返回</a>
        <WalletMultiButton />
      </header>

      <h1 className="text-2xl font-bold mb-6">我的持仓</h1>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">我创建的市场</h2>
        <p className="text-gray-500">暂无</p>
        {/* TODO: List markets where user is creator, with settle buttons */}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">我参与的市场</h2>
        <p className="text-gray-500">暂无</p>
        {/* TODO: List user's YES/NO token holdings with redeem buttons */}
      </section>
    </main>
  );
}
```

**Step 3: Commit**

```bash
git add app/
git commit -m "feat(frontend): add create market form and portfolio page"
```

---

## Phase 5: Integration and Deployment

### Task 13: Connect Frontend to Contracts

**Files:**
- Create: `app/idl/` (copy from target/idl after build)
- Create: `app/hooks/useProgram.ts`
- Modify: All hooks to use actual program calls

**Step 1: Copy IDL files**

After `anchor build`:
```bash
cp target/idl/market_factory.json app/idl/
cp target/idl/settlement.json app/idl/
cp target/types/market_factory.ts app/idl/
cp target/types/settlement.ts app/idl/
```

**Step 2: Create useProgram hook**

Create `app/hooks/useProgram.ts`:
```typescript
import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { MarketFactory, IDL as MarketFactoryIDL } from "../idl/market_factory";
import { Settlement, IDL as SettlementIDL } from "../idl/settlement";

const MARKET_FACTORY_PROGRAM_ID = "YOUR_MARKET_FACTORY_PROGRAM_ID";
const SETTLEMENT_PROGRAM_ID = "YOUR_SETTLEMENT_PROGRAM_ID";

export function useMarketFactoryProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  return useMemo(() => {
    if (!wallet.publicKey) return null;

    const provider = new AnchorProvider(
      connection,
      wallet as any,
      { commitment: "confirmed" }
    );

    return new Program<MarketFactory>(
      MarketFactoryIDL,
      MARKET_FACTORY_PROGRAM_ID,
      provider
    );
  }, [connection, wallet]);
}

export function useSettlementProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  return useMemo(() => {
    if (!wallet.publicKey) return null;

    const provider = new AnchorProvider(
      connection,
      wallet as any,
      { commitment: "confirmed" }
    );

    return new Program<Settlement>(
      SettlementIDL,
      SETTLEMENT_PROGRAM_ID,
      provider
    );
  }, [connection, wallet]);
}
```

**Step 3: Update hooks and components to use programs**

Update each component to use the program hooks for actual blockchain interactions.

**Step 4: Commit**

```bash
git add app/
git commit -m "feat(frontend): integrate with Anchor programs"
```

---

### Task 14: Deploy to Sonic Testnet

**Step 1: Configure Solana CLI for Sonic**

```bash
solana config set --url https://api.testnet.sonic.game
```

**Step 2: Get testnet SOL**

Visit Sonic faucet or use:
```bash
solana airdrop 2
```

**Step 3: Deploy programs**

```bash
anchor deploy --provider.cluster https://api.testnet.sonic.game
```

**Step 4: Update frontend with deployed program IDs**

Update `app/hooks/useProgram.ts` with actual program IDs.

**Step 5: Deploy frontend**

```bash
cd app
npm run build
# Deploy to Vercel, Netlify, or similar
```

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: deploy to Sonic testnet"
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|------------------|
| 1 | 1-2 | Anchor workspace, shared types |
| 2 | 3-5 | Market Factory: create markets, place bets |
| 3 | 6-8 | Settlement: settle markets, redeem winnings |
| 4 | 9-12 | Next.js frontend with all pages |
| 5 | 13-14 | Integration and deployment |

**Sources:**
- [Anchor Framework](https://www.anchor-lang.com/docs)
- [Testing Solana Programs](https://www.helius.dev/blog/a-guide-to-testing-solana-programs)
- [Sonic SVM Deployment](https://docs.sonic.game/developers/getting-started/build-and-deploy-your-first-program)
