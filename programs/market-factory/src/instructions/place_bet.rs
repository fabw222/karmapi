use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::state::{Market, MarketStatus};
use crate::error::MarketError;

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
        market.yes_pool = market.yes_pool
            .checked_add(amount)
            .ok_or(error!(MarketError::ArithmeticOverflow))?;
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
        market.no_pool = market.no_pool
            .checked_add(amount)
            .ok_or(error!(MarketError::ArithmeticOverflow))?;
    }

    Ok(())
}
