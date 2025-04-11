import {
    Connection,
    PublicKey,
    SystemProgram,
    clusterApiUrl,
    SYSVAR_RENT_PUBKEY
  } from "@solana/web3.js";
  import { AnchorProvider, Program } from "@project-serum/anchor";
  import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
  import idl from "./idl.json"; // Ensure your idl.json is available
  // Initialize a TextEncoder to convert string seeds to Uint8Array
  const textEncoder = new TextEncoder();
  
  /**
   * Helper function to derive the Associated Token Account (ATA) address.
   * Uses new v2.0.0 standards: calls .toBytes() (instead of toBuffer()).
   */
  async function findAssociatedTokenAddress(walletAddress, tokenMintAddress) {
    // Associated token program ID for the standard ATA derivation.
    const associatedTokenProgramId = new PublicKey(
      "ATokenGPvbhRt7Z8BUGKh9dn1dPnse5xCCom1ULxq"
    );
    // Provided Token Program ID.
    const tokenProgramId = new PublicKey(
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
    );
    // Use the synchronous PDA derivation API, passing seeds as Uint8Arrays.
    const [ata] = PublicKey.findProgramAddressSync(
      [
        walletAddress.toBytes(), // instead of walletAddress.toBuffer()
        tokenProgramId.toBytes(),
        tokenMintAddress.toBytes()
      ],
      associatedTokenProgramId
    );
    return ata;
  }
  
  document.addEventListener("DOMContentLoaded", async () => {
    const connectWalletButton = document.getElementById("connectWallet");
    const setExemptButton = document.getElementById("setExempt");
    const registerUserButton = document.getElementById("registerUser");
    const claimTokensButton = document.getElementById("claimTokens");
    const walletAddressDiv = document.getElementById("walletAddress");
    const statusDiv = document.getElementById("status");
  
    let walletAdapter = null;
    let program = null;
  
    // Get the program ID from the IDL metadata.
    const programId = new PublicKey(idl.metadata.address);
  
    // Derive the global dapp_config PDA using a string seed encoded via TextEncoder.
    const [dappConfigPda] = PublicKey.findProgramAddressSync(
      [textEncoder.encode("dapp_config")],
      programId
    );
  
    // Connect to Phantom Wallet
    connectWalletButton.onclick = async () => {
      if (window.solana && window.solana.isPhantom) {
        try {
          // Request wallet connection
          await window.solana.connect();
          walletAdapter = window.solana;
          walletAddressDiv.textContent = `Connected: ${walletAdapter.publicKey.toString()}`;
          statusDiv.textContent = "Wallet connected successfully.";
  
          // Initialize Anchor provider with connection and wallet
          const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
          const anchorProvider = new AnchorProvider(connection, walletAdapter, {
            skipPreflight: false,
            commitment: "confirmed"
          });
          // Assume Anchor is attached globally (from bundle.js) and set the provider.
          window.anchor = window.anchor || {};
          window.anchor.setProvider(anchorProvider);
  
          // Create the program client using the loaded IDL.
          program = new Program(idl, programId, anchorProvider);
  
          // Enable buttons after wallet connection
          setExemptButton.disabled = false;
          registerUserButton.disabled = false;
          claimTokensButton.disabled = false;
        } catch (err) {
          statusDiv.textContent = `Error connecting wallet: ${err.message}`;
        }
      } else {
        statusDiv.textContent = "Phantom wallet not found. Please install it.";
      }
    };
  
    // Set Exempt Address
    setExemptButton.onclick = async () => {
      const exemptAddressInput = document.getElementById("exemptAddress").value.trim();
      if (!exemptAddressInput) {
        statusDiv.textContent = "Please enter a public key.";
        return;
      }
      try {
        const newExempt = new PublicKey(exemptAddressInput);
        await program.methods
          .setExempt(newExempt)
          .accounts({
            dappConfig: dappConfigPda,
            currentExempt: walletAdapter.publicKey
          })
          .rpc();
        statusDiv.textContent = `Exempt address set to: ${newExempt.toString()}`;
      } catch (err) {
        statusDiv.textContent = `Error setting exempt address: ${err.message}`;
      }
    };
  
    // Register User
    registerUserButton.onclick = async () => {
      try {
        const [userPda] = PublicKey.findProgramAddressSync(
          [textEncoder.encode("user"), walletAdapter.publicKey.toBytes()],
          programId
        );
        await program.methods
          .registerUser()
          .accounts({
            dappConfig: dappConfigPda,
            user: walletAdapter.publicKey,
            gatewayToken: walletAdapter.publicKey, // using user's address as gateway token
            userPda: userPda,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY
          })
          .rpc();
        statusDiv.textContent = "User registered successfully.";
      } catch (err) {
        statusDiv.textContent = `Error registering user: ${err.message}`;
      }
    };
  
    // Claim Tokens
    claimTokensButton.onclick = async () => {
      try {
        const [userPda] = PublicKey.findProgramAddressSync(
          [textEncoder.encode("user"), walletAdapter.publicKey.toBytes()],
          programId
        );
        // Fetch the dapp_config account to get the token mint.
        const dappConfigAccount = await program.account.dappConfig.fetch(dappConfigPda);
        const tokenMint = new PublicKey(dappConfigAccount.token_mint.toString());
  
        // Derive mint authority PDA using the seed "mint_authority".
        const [mintAuthorityPda] = PublicKey.findProgramAddressSync(
          [textEncoder.encode("mint_authority")],
          programId
        );
  
        // Derive the user's Associated Token Account (ATA) using their wallet and the fetched token mint.
        const userAta = await findAssociatedTokenAddress(walletAdapter.publicKey, tokenMint);
  
        await program.methods
          .claim()
          .accounts({
            dappConfig: dappConfigPda,
            user: walletAdapter.publicKey,
            gatewayToken: walletAdapter.publicKey,
            userPda: userPda,
            tokenMint: tokenMint,
            mintAuthority: mintAuthorityPda,
            userAta: userAta,
            tokenProgram: new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
            associatedTokenProgram: new PublicKey("ATokenGPvbhRt7Z8BUGKh9dn1dPnse5xCCom1ULxq"),
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY
          })
          .rpc();
        statusDiv.textContent = "Tokens claimed successfully.";
      } catch (err) {
        statusDiv.textContent = `Error claiming tokens: ${err.message}`;
      }
    };
  });
  