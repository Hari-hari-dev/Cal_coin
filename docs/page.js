// Anchor is attached to window by bundle.js; alias it locally.
window.anchor = window.anchor || {};
const anchor = window.anchor;

// Create a TextEncoder to convert seed strings to Uint8Array.
const textEncoder = new TextEncoder();

/**
 * Helper function to derive the Associated Token Account (ATA) address.
 * Updated for web3.js v2.0.0, using .toBytes() and findProgramAddressSync.
 */
async function findAssociatedTokenAddress(walletAddress, tokenMintAddress) {
  // Associated token program ID for standard ATA derivation.
  const associatedTokenProgramId = new anchor.PublicKey(
    'ATokenGPvbhRt7Z8BUGKh9dn1dPnse5xCCom1ULxq'
  );
  // Provided Token Program ID.
  const tokenProgramId = new anchor.PublicKey(
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  );
  // Derive the ATA using Uint8Array seeds.
  const [ata] = anchor.PublicKey.findProgramAddressSync(
    [
      walletAddress.toBytes(), // using .toBytes() instead of .toBuffer()
      tokenProgramId.toBytes(),
      tokenMintAddress.toBytes()
    ],
    associatedTokenProgramId
  );
  return ata;
}

document.addEventListener('DOMContentLoaded', async () => {
  const connectWalletButton = document.getElementById('connectWallet');
  const setExemptButton = document.getElementById('setExempt');
  const registerUserButton = document.getElementById('registerUser');
  const claimTokensButton = document.getElementById('claimTokens');
  const walletAddressDiv = document.getElementById('walletAddress');
  const statusDiv = document.getElementById('status');

  let walletAdapter = null;
  let program = null;

  // Load the IDL. Make sure that idl.json now includes a metadata.address field.
  const idl = await fetch('./idl.json').then(res => res.json());

  // Get the program ID from the idl metadata.
  const programId = new anchor.PublicKey(idl.metadata.address);

  // Derive the global dapp_config PDA using a string seed encoded to Uint8Array.
  const [dappConfigPda] = anchor.PublicKey.findProgramAddressSync(
    [textEncoder.encode('dapp_config')],
    programId
  );

  // Connect to Phantom Wallet.
  connectWalletButton.onclick = async () => {
    if (window.solana && window.solana.isPhantom) {
      try {
        await window.solana.connect();
        walletAdapter = window.solana;
        walletAddressDiv.textContent = `Connected: ${walletAdapter.publicKey.toString()}`;
        statusDiv.textContent = 'Wallet connected successfully.';

        // Initialize connection and Anchor provider.
        const connection = new anchor.Connection(
          anchor.clusterApiUrl('devnet'),
          'confirmed'
        );
        const anchorProvider = new anchor.AnchorProvider(
          connection,
          walletAdapter,
          {
            skipPreflight: false,
            commitment: 'confirmed'
          }
        );
        // Set the provider on the global Anchor object.
        anchor.setProvider(anchorProvider);

        // Create your program client using the loaded IDL.
        program = new anchor.Program(idl, programId, anchorProvider);

        // Enable buttons after connection.
        setExemptButton.disabled = false;
        registerUserButton.disabled = false;
        claimTokensButton.disabled = false;
      } catch (err) {
        statusDiv.textContent = `Error connecting wallet: ${err.message}`;
      }
    } else {
      statusDiv.textContent = 'Phantom wallet not found. Please install it.';
    }
  };

  // Set Exempt Address.
  setExemptButton.onclick = async () => {
    const exemptAddressInput = document.getElementById('exemptAddress').value.trim();
    if (!exemptAddressInput) {
      statusDiv.textContent = 'Please enter a public key.';
      return;
    }
    try {
      const newExempt = new anchor.PublicKey(exemptAddressInput);
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

  // Register User.
  registerUserButton.onclick = async () => {
    try {
      const [userPda] = anchor.PublicKey.findProgramAddressSync(
        [textEncoder.encode('user'), walletAdapter.publicKey.toBytes()],
        programId
      );
      await program.methods
        .registerUser()
        .accounts({
          dappConfig: dappConfigPda,
          user: walletAdapter.publicKey,
          gatewayToken: walletAdapter.publicKey, // using user's address as gateway token
          userPda: userPda,
          systemProgram: anchor.SystemProgram.programId,
          rent: anchor.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      statusDiv.textContent = 'User registered successfully.';
    } catch (err) {
      statusDiv.textContent = `Error registering user: ${err.message}`;
    }
  };

  // Claim Tokens.
  claimTokensButton.onclick = async () => {
    try {
      const [userPda] = anchor.PublicKey.findProgramAddressSync(
        [textEncoder.encode('user'), walletAdapter.publicKey.toBytes()],
        programId
      );
      // Fetch the dapp_config account to get the token mint.
      const dappConfigAccount = await program.account.dappConfig.fetch(dappConfigPda);
      const tokenMint = new anchor.PublicKey(dappConfigAccount.token_mint.toString());

      // Derive mint authority PDA using seed "mint_authority".
      const [mintAuthorityPda] = anchor.PublicKey.findProgramAddressSync(
        [textEncoder.encode('mint_authority')],
        programId
      );

      // Derive the user's Associated Token Account (ATA) using their wallet and the fetched token mint.
      const userAta = await findAssociatedTokenAddress(walletAdapter.publicKey, tokenMint);

      await program.methods
        .claim()
        .accounts({
          dappConfig: dappConfigPda,
          user: walletAdapter.publicKey,
          gatewayToken: walletAdapter.publicKey, // using user's address as gateway token
          userPda: userPda,
          tokenMint: tokenMint,
          mintAuthority: mintAuthorityPda,
          userAta: userAta,
          tokenProgram: new anchor.PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
          associatedTokenProgram: new anchor.PublicKey("ATokenGPvbhRt7Z8BUGKh9dn1dPnse5xCCom1ULxq"),
          systemProgram: anchor.SystemProgram.programId,
          rent: anchor.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      statusDiv.textContent = 'Tokens claimed successfully.';
    } catch (err) {
      statusDiv.textContent = `Error claiming tokens: ${err.message}`;
    }
  };
});
