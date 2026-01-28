use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::state::{Market, MarketStatus};
use crate::error::MarketError;

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub redeemer: Signer<'info>,

    #[account(
        mut,
        constraint = market.status == MarketStatus::Settled @ MarketError::NotSettled,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        constraint = vault.key() == market.vault @ MarketError::InvalidVault,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = winning_mint.key() == get_winning_mint(&market)? @ MarketError::WrongMint,
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
    let outcome = market.outcome.ok_or(MarketError::NotSettled)?;
    Ok(if outcome { market.yes_mint } else { market.no_mint })
}

pub fn redeem(ctx: Context<Redeem>, amount: u64) -> Result<()> {
    let market = &ctx.accounts.market;

    require!(amount > 0, MarketError::InvalidAmount);

    // SECURITY FIX: Use actual vault balance and winning mint supply to prevent race condition
    // This prevents the vault drain vulnerability where multiple redemptions could
    // exceed the actual vault balance by using stale pool values
    let vault_balance = ctx.accounts.vault.amount;
    let winning_supply = ctx.accounts.winning_mint.supply;

    require!(winning_supply > 0, MarketError::NoWinningBets);
    require!(vault_balance > 0, MarketError::VaultEmpty);

    // payout = (user_tokens / total_winning_tokens) * vault_balance
    let payout = (amount as u128)
        .checked_mul(vault_balance as u128)
        .ok_or(error!(MarketError::ArithmeticOverflow))?
        .checked_div(winning_supply as u128)
        .ok_or(error!(MarketError::ArithmeticOverflow))? as u64;

    // Cap payout to actual vault balance as safety measure
    let actual_payout = std::cmp::min(payout, vault_balance);
    require!(actual_payout > 0, MarketError::PayoutTooSmall);

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
        Market::SEED_PREFIX,
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
    token::transfer(transfer_ctx, actual_payout)?;

    Ok(())
}
