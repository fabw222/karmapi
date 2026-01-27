use anchor_lang::prelude::*;

#[error_code]
pub enum MarketError {
    #[msg("Expiry timestamp must be in the future")]
    ExpiryInPast,
    #[msg("Title exceeds maximum length of 128 characters")]
    TitleTooLong,
    #[msg("Description exceeds maximum length of 512 characters")]
    DescriptionTooLong,
    #[msg("Market is not open")]
    MarketNotOpen,
    #[msg("Market has expired")]
    MarketExpired,
    #[msg("Invalid bet token")]
    InvalidBetToken,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid vault")]
    InvalidVault,
    #[msg("Bet amount must be positive")]
    InvalidBetAmount,
}
