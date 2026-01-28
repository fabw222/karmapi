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
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    // Settlement errors
    #[msg("Only the market creator can settle this market")]
    Unauthorized,
    #[msg("Market has already been settled")]
    AlreadySettled,
    #[msg("Market has not expired yet")]
    MarketNotExpired,
    #[msg("Market not settled yet")]
    NotSettled,
    #[msg("Wrong mint for redemption")]
    WrongMint,
    #[msg("Amount must be positive")]
    InvalidAmount,
    #[msg("No winning bets to redeem against")]
    NoWinningBets,
    #[msg("Vault is empty")]
    VaultEmpty,
    #[msg("Payout amount is too small")]
    PayoutTooSmall,
}
