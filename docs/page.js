// We're assuming that your Rollup bundle exposes the full API on window.solanaWeb3.
// If the bundle wraps the default export, ensure that your entry file re‑exports all named exports.
const solanaWeb3 = window.solanaWeb3; 

// Create a TextEncoder to convert seed strings to Uint8Array.
const textEncoder = new TextEncoder();

/**
 * Helper function to derive the Associated Token Account (ATA) address.
 * Uses web3.js v2.0.0 APIs (.toBytes() and findProgramAddressSync).
 */
async function findAssociatedTokenAddress(walletAddress, tokenMintAddress) {
  // Associated token program ID (standard for ATA derivation).
  const associatedTokenProgramId = new solanaWeb3.address(
    'ATokenGPvbhRt7Z8BUGKh9dn1dPnse5xCCom1ULxq'
  );
  // Provided Token Program ID.
  const tokenProgramId = new solanaWeb3.address(
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  );
  // Derive the ATA using Uint8Array seeds.
  const [ata] = solanaWeb3.address.findProgramAddressSync(
    [
      walletAddress.toBytes(), // using .toBytes() now
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

  // Load the IDL.
  // Make sure your idl.json file includes the correct metadata.address field.
  const idl = await fetch('./idl.json').then(res => res.json());

  // Use the program address from the IDL metadata.
  const programId = new solanaWeb3.address("BYJtTQxe8F1Zi41bzWRStVPf57knpst3JqvZ7P5EMjex");

  // Derive the global dapp_config PDA using a string seed encoded to Uint8Array.
  const [pda] = await getProgramDerivedAddress(
    [new TextEncoder().encode('dapp_config')],
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

        // Explicitly connect to Devnet.
        const connection = new solanaWeb3.Connection(
          solanaWeb3.clusterApiUrl('devnet'),
          'confirmed'
        );
        
        // If you are using Anchor (for example, via @project-serum/anchor),
        // create an AnchorProvider and Program as follows:
        const anchorProvider = new solanaWeb3.AnchorProvider(
          connection,
          walletAdapter,
          {
            skipPreflight: false,
            commitment: 'confirmed'
          }
        );
        // Optionally, if you have a global Anchor object from another bundle,
        // you can set its provider:
        if(window.anchor && window.anchor.setProvider) {
          window.anchor.setProvider(anchorProvider);
        }

        // Create your program client using the loaded IDL.
        // (This is an Anchor construct; if you’re not using Anchor,
        // you’ll have to build raw transactions using solana-web3 only.)
        program = new solanaWeb3.Program(idl, programId, anchorProvider);

        // Enable additional buttons after wallet is connected.
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
      const newExempt = new solanaWeb3.address(exemptAddressInput);
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
      const [userPda] = solanaWeb3.address.findProgramAddressSync(
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
          systemProgram: solanaWeb3.SystemProgram.programId,
          rent: solanaWeb3.SYSVAR_RENT_PUBKEY,
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
      const [userPda] = solanaWeb3.address.findProgramAddressSync(
        [textEncoder.encode('user'), walletAdapter.publicKey.toBytes()],
        programId
      );
      // Fetch the dapp_config account to get the token mint.
      const dappConfigAccount = await program.account.dappConfig.fetch(dappConfigPda);
      const tokenMint = new solanaWeb3.address(dappConfigAccount.token_mint.toString());

      // Derive mint authority PDA using seed "mint_authority".
      const [mintAuthorityPda] = solanaWeb3.address.findProgramAddressSync(
        [textEncoder.encode('mint_authority')],
        programId
      );

      // Derive the user's Associated Token Account (ATA).
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
          tokenProgram: new solanaWeb3.address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
          associatedTokenProgram: new solanaWeb3.address("ATokenGPvbhRt7Z8BUGKh9dn1dPnse5xCCom1ULxq"),
          systemProgram: solanaWeb3.SystemProgram.programId,
          rent: solanaWeb3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      statusDiv.textContent = 'Tokens claimed successfully.';
    } catch (err) {
      statusDiv.textContent = `Error claiming tokens: ${err.message}`;
    }
  };
});
