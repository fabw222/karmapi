use anchor_lang::prelude::*;

declare_id!("8oErexD9Jgq6CfZvqGToAorLk1EHcdvKnNpcmfTen1XU");

#[program]
pub mod settlement {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
