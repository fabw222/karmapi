use anchor_lang::prelude::*;

// Mirror of Market struct from market-factory
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub creator: Pubkey,
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
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MarketStatus {
    Open,
    Settled,
}
