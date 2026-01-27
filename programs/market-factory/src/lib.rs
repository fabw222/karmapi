use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("AQR7DVzsy1dKM3TdRqLMbzAb5waubBJYdXd9BGuCtVpR");

#[program]
pub mod market_factory {
    use super::*;

    pub fn create_market(
        ctx: Context<CreateMarket>,
        title: String,
        description: String,
        expiry_timestamp: i64,
    ) -> Result<()> {
        instructions::create_market::create_market(ctx, title, description, expiry_timestamp)
    }

    pub fn place_bet(ctx: Context<PlaceBet>, amount: u64, side: bool) -> Result<()> {
        instructions::place_bet::place_bet(ctx, amount, side)
    }
}
