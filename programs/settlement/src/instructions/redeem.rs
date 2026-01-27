use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::state::{Market, MarketStatus};
use crate::instructions::settle_market::SettlementError;

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
    let total_pool = market.yes_pool
        .checked_add(market.no_pool)
        .ok_or(error!(SettlementError::ArithmeticOverflow))?;
    let winning_pool = if outcome { market.yes_pool } else { market.no_pool };

    require!(winning_pool > 0, SettlementError::NoWinningBets);

    // payout = amount / winning_pool * total_pool
    let payout = (amount as u128)
        .checked_mul(total_pool as u128)
        .ok_or(error!(SettlementError::ArithmeticOverflow))?
        .checked_div(winning_pool as u128)
        .ok_or(error!(SettlementError::ArithmeticOverflow))? as u64;

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
