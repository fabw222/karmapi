use anchor_lang::prelude::*;

pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("8oErexD9Jgq6CfZvqGToAorLk1EHcdvKnNpcmfTen1XU");

#[program]
pub mod settlement {
    use super::*;

    pub fn settle_market(ctx: Context<SettleMarket>, outcome: bool) -> Result<()> {
        instructions::settle_market::settle_market(ctx, outcome)
    }

    pub fn redeem(ctx: Context<Redeem>, amount: u64) -> Result<()> {
        instructions::redeem::redeem(ctx, amount)
    }
}
