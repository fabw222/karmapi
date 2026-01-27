use anchor_lang::prelude::*;

use crate::state::{Market, MarketStatus};

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    pub creator: Signer<'info>,

    #[account(
        mut,
        constraint = market.creator == creator.key() @ SettlementError::Unauthorized,
        constraint = market.status == MarketStatus::Open @ SettlementError::AlreadySettled,
    )]
    pub market: Account<'info, Market>,
}

pub fn settle_market(ctx: Context<SettleMarket>, outcome: bool) -> Result<()> {
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
    #[msg("Market has already been settled")]
    AlreadySettled,
    #[msg("Market has not expired yet")]
    MarketNotExpired,
    #[msg("Market not settled yet")]
    NotSettled,
    #[msg("Invalid vault")]
    InvalidVault,
    #[msg("Wrong mint for redemption")]
    WrongMint,
    #[msg("Amount must be positive")]
    InvalidAmount,
}
