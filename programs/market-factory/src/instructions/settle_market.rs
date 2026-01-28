use anchor_lang::prelude::*;

use crate::state::{Market, MarketStatus};
use crate::error::MarketError;

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    pub creator: Signer<'info>,

    #[account(
        mut,
        constraint = market.creator == creator.key() @ MarketError::Unauthorized,
        constraint = market.status == MarketStatus::Open @ MarketError::AlreadySettled,
    )]
    pub market: Account<'info, Market>,
}

pub fn settle_market(ctx: Context<SettleMarket>, outcome: bool) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    require!(
        clock.unix_timestamp >= market.expiry_timestamp,
        MarketError::MarketNotExpired
    );

    market.status = MarketStatus::Settled;
    market.outcome = Some(outcome);

    Ok(())
}
