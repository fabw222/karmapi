use anchor_lang::prelude::*;

pub mod state;

declare_id!("AQR7DVzsy1dKM3TdRqLMbzAb5waubBJYdXd9BGuCtVpR");

#[program]
pub mod market_factory {
    use super::*;

    pub fn create_market(
        _ctx: Context<CreateMarket>,
        _title: String,
        _description: String,
        _expiry_timestamp: i64,
    ) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateMarket {}
