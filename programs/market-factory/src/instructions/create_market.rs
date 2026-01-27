use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::error::MarketError;
use crate::state::{Market, MarketStatus};

#[derive(Accounts)]
#[instruction(title: String, description: String, expiry_timestamp: i64)]
pub struct CreateMarket<'info> {
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

pub fn create_market(
    ctx: Context<CreateMarket>,
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
    market.bump = ctx.bumps.market;

    Ok(())
}
