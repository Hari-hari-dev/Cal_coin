use anchor_lang::prelude::*;
use anchor_lang::prelude::InterfaceAccount;
use anchor_lang::system_program;
use anchor_spl::{
    token_2022::{self as token_2022, mint_to, ID as TOKEN_2022_PROGRAM_ID},
    // The 2022 account interfaces:
    //token_interface::{Mint, MintTo, Account as TokenAccount, Token2022 as Token},
};
//use anchor_spl::token_2022::TokenAccount;
//use spl_token_2022::state::Account as TokenAccount2022;
use anchor_spl::token_interface::{
    //Account as TokenAccount2022,//GenericTokenAccount as TokenAccount,
    Mint,
    Token2022,       // The “program” type for your token_program field
};
use anchor_spl::token_interface::TokenAccount;

use solana_gateway::Gateway;

use anchor_spl::token_2022::MintTo;
//use anchor_spl::token_2022::Account;
use anchor_spl::associated_token::AssociatedToken;
use sha3::{Digest, Keccak256};
use std::convert::TryInto;
use std::str::FromStr;
declare_id!("BYJtTQxe8F1Zi41bzWRStVPf57knpst3JqvZ7P5EMjex");

// ---------------------------------------------------------------------
//  1) PROGRAM MODULE
// ---------------------------------------------------------------------
#[program]
pub mod cal_coin {
    use super::*;

    /// One-time registration for a user:
    /// - Skips gateway check if exempt
    /// - Otherwise checks gateway token
    /// - Creates a [UserPda] for storing `last_claimed_timestamp`
    pub fn register_user(ctx: Context<RegisterUser>) -> Result<()> {
        let cfg = &ctx.accounts.dapp_config;
        let user_key = ctx.accounts.user.key();

        if user_key != cfg.exempt_address {
            // Not exempt => require gateway check
            let gatekeeper_network: Pubkey =
                Pubkey::from_str("uniqobk8oGh4XBLMqM68K8M2zNu3CdYX7q5go7whQiv").unwrap();

            Gateway::verify_gateway_token_account_info(
                &ctx.accounts.gateway_token.to_account_info(),
                &user_key,
                &gatekeeper_network,
                None,
            )
            .map_err(|_e| {
                msg!("Gateway token verification failed");
                error!(ErrorCode::GatewayCheckFailed)
            })?;
        } else {
            msg!("User is exempt => skipping gateway check in register_user");
        }

        let user_pda = &mut ctx.accounts.user_pda;
        user_pda.authority = user_key;
        user_pda.last_claimed_timestamp = 0;

        msg!(
            "Registered user => user_pda={}, authority={}",
            user_pda.key(),
            user_key
        );
        Ok(())
    }

    /// Claim tokens repeatedly:
    /// - If exempt, skip gateway check
    /// - Otherwise do gateway check
    /// - Enforces 60s cooldown
    /// - Mints to user’s ATA at ~1.25 tokens/min
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let cfg = &ctx.accounts.dapp_config;
        let user_key = ctx.accounts.user.key();
        let user_pda = &mut ctx.accounts.user_pda;

        // 1) Gateway or Exempt
        if user_key != cfg.exempt_address {
            let gatekeeper_network = Pubkey::from_str("uniqobk8oGh4XBLMqM68K8M2zNu3CdYX7q5go7whQiv")
                .unwrap();
            Gateway::verify_gateway_token_account_info(
                &ctx.accounts.gateway_token.to_account_info(),
                &user_key,
                &gatekeeper_network,
                None,
            )
            .map_err(|_e| {
                msg!("Gateway token verification failed");
                error!(ErrorCode::GatewayCheckFailed)
            })?;
        } else {
            msg!("User is exempt => skipping gateway check in claim");
        }

        // 2) Cooldown: at least 60s since last_claimed_timestamp
        let now = Clock::get()?.unix_timestamp;
        let elapsed = now.saturating_sub(user_pda.last_claimed_timestamp);
        require!(elapsed >= 60, ErrorCode::CooldownNotMet);

        // 3) Rate: 1.25 tokens/min => ~20,833 μtokens/sec if 6 decimals
        let tokens_per_second_micro = 20_833u64;
        let minted_amount = tokens_per_second_micro.saturating_mul(elapsed as u64);
        if minted_amount == 0 {
            msg!("No tokens => skipping claim");
            return Ok(());
        }

        // 4) Mint to user's ATA
        let bump = cfg.mint_authority_bump;
        let seeds = &[b"mint_authority".as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.token_mint.to_account_info(),
                to: ctx.accounts.user_ata.to_account_info(),
                authority: ctx.accounts.mint_authority.to_account_info(),
            },
            signer_seeds,
        );
        anchor_spl::token_2022::mint_to(cpi_ctx, minted_amount)?;

        // 5) Update user_pda
        user_pda.last_claimed_timestamp = now;

        msg!(
            "Claim => user={}, minted={} μtokens, after {}s, last_claimed={}",
            user_key,
            minted_amount,
            elapsed,
            now
        );
        Ok(())
    }

    /// Sets a new exempt address. Only the *current* exempt address may do so.
    /// If `exempt_address` in DappConfig is 0, then the first caller is allowed
    /// (optional logic – you can require it not be 0).
    pub fn set_exempt(ctx: Context<SetExempt>, new_exempt: Pubkey) -> Result<()> {
        let cfg = &mut ctx.accounts.dapp_config;
        let signer_key = ctx.accounts.current_exempt.key();

        // If exempt_address is Pubkey::default() (all zeros), allow the "first" set
        // otherwise require that signer == cfg.exempt_address
        if cfg.exempt_address != Pubkey::default() {
            require!(
                signer_key == cfg.exempt_address,
                ErrorCode::NotExemptAddress
            );
        }

        cfg.exempt_address = new_exempt;
        msg!("Exempt address updated => new_exempt={}", new_exempt);
        Ok(())
    }
}

// ---------------------------------------------------------------------
//  2) STATE ACCOUNTS
// ---------------------------------------------------------------------

/// A global config storing the Gatekeeper network for gateway, plus
/// the Mint used for distribution, and an "exempt_address".
#[account]
pub struct DappConfig {
    /// Gatekeeper network for gateway checks if used
    pub gatekeeper_network: Pubkey, // Not mandatory if you're always using a hard-coded network
    /// The token mint used for distribution
    pub token_mint: Pubkey,
    /// Bump for the [MintAuthorityPda], so we can sign
    pub mint_authority_bump: u8,
    /// The address that is exempt from Gateway checks
    pub exempt_address: Pubkey,
}

impl DappConfig {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 32; // adjust if needed
}

/// A separate PDA that holds the bump for mint authority
#[account]
pub struct MintAuthorityPda {
    pub bump: u8,
}

impl MintAuthorityPda {
    pub const LEN: usize = 8 + 1;
}

/// Per-user account tracking last claim
#[account]
pub struct UserPda {
    pub authority: Pubkey,
    pub last_claimed_timestamp: i64,
}

impl UserPda {
    pub const LEN: usize = 8 + 32 + 8;
}

// ---------------------------------------------------------------------
//  3) ACCOUNTS FOR INSTRUCTIONS
// ---------------------------------------------------------------------

#[derive(Accounts)]
pub struct RegisterUser<'info> {
    /// The global config, used to read `exempt_address`
    #[account(
        seeds = [b"dapp_config"],
        bump
    )]
    pub dapp_config: Account<'info, DappConfig>,

    /// The user paying for the new PDA
    #[account(mut)]
    pub user: Signer<'info>,

    /// The user’s gateway token => verified in code if not exempt
    pub gateway_token: UncheckedAccount<'info>,

    /// The user’s PDA => fails if it already exists
    #[account(
        init,
        payer = user,
        space = UserPda::LEN,
        seeds = [
            b"user_pda",
            user.key().as_ref()
        ],
        bump
    )]
    pub user_pda: Account<'info, UserPda>,

    /// For create/init
    #[account(address = TOKEN_2022_PROGRAM_ID)]
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    /// The global config (for reading `exempt_address`, `mint_authority_bump`, etc.)
    #[account(
        seeds = [b"dapp_config"],
        bump
    )]
    pub dapp_config: Account<'info, DappConfig>,

    /// The user claiming tokens
    #[account(mut)]
    pub user: Signer<'info>,

    /// The user’s gateway token => verified if not exempt
    pub gateway_token: UncheckedAccount<'info>,

    /// The user’s PDA (must exist; we update `last_claimed_timestamp`)
    #[account(
        mut,
        seeds = [
            b"user_pda",
            user.key().as_ref()
        ],
        bump
    )]
    pub user_pda: Account<'info, UserPda>,

    /// The token mint => must match dapp_config.token_mint
    #[account(
        mut,
        constraint = token_mint.key() == dapp_config.token_mint
    )]
    pub token_mint: InterfaceAccount<'info, Mint>,

    /// The “mint authority” PDA => seeds = ["mint_authority"], bump = dapp_config.mint_authority_bump
    #[account(
        seeds = [b"mint_authority"],
        bump = dapp_config.mint_authority_bump,
    )]
    pub mint_authority: Account<'info, MintAuthorityPda>,

    /// The user’s ATA => auto-create if needed
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = token_mint,
        associated_token::authority = user
    )]
    pub user_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(address = TOKEN_2022_PROGRAM_ID)]
    pub token_program: Program<'info, Token2022>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

/// Instruction to let the current exempt address update to a new address.
#[derive(Accounts)]
pub struct SetExempt<'info> {
    #[account(
        mut,
        seeds = [b"dapp_config"],
        bump
    )]
    pub dapp_config: Account<'info, DappConfig>,

    /// Must be the current exempt address or zero if uninitialized
    #[account(mut)]
    pub current_exempt: Signer<'info>,
}

// ---------------------------------------------------------------------
//  4) ERROR CODES
// ---------------------------------------------------------------------

#[error_code]
pub enum ErrorCode {
    #[msg("Must wait 60s before claiming again.")]
    CooldownNotMet,
    #[msg("Gateway token check failed.")]
    GatewayCheckFailed,
    #[msg("Signer is not the current exempt address.")]
    NotExemptAddress,
}
