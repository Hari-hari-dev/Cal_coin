// Anchor is attached to window by bundle.js; alias it locally.
window.anchor = window.anchor || {};
const anchor = window.anchor;

document.addEventListener('DOMContentLoaded', async () => {
  const connectWalletButton = document.getElementById('connectWallet');
  const setExemptButton = document.getElementById('setExempt');
  const registerUserButton = document.getElementById('registerUser');
  const claimTokensButton = document.getElementById('claimTokens');
  const walletAddressDiv = document.getElementById('walletAddress');
  const statusDiv = document.getElementById('status');

  let walletAdapter = null;
  let program = null;

  // Load IDL
  const idl = await fetch('./idl.json').then(res => res.json());

  // Solana program ID
  const programId = new solanaWeb3.PublicKey('BYJtTQxe8F1Zi41bzWRStVPf57knpst3JqvZ7P5EMjex');

  // Connect to Phantom Wallet
  connectWalletButton.onclick = async () => {
    if (window.solana && window.solana.isPhantom) {
      try {
        await window.solana.connect();
        walletAdapter = window.solana;
        walletAddressDiv.textContent = `Connected: ${walletAdapter.publicKey.toString()}`;
        statusDiv.textContent = 'Wallet connected successfully.';

        // Initialize Anchor provider (v0.31.0 uses AnchorProvider)
        const connection = new solanaWeb3.Connection(
          solanaWeb3.clusterApiUrl('devnet'),
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
        anchor.setProvider(anchorProvider);

        // Create your program client
        program = new anchor.Program(idl, programId, anchorProvider);

        // Enable buttons after connection
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

  // Set Exempt Address
  setExemptButton.onclick = async () => {
    const exemptAddressInput = document.getElementById('exemptAddress').value.trim();
    if (!exemptAddressInput) {
      statusDiv.textContent = 'Please enter a public key.';
      return;
    }
    try {
      const newExempt = new solanaWeb3.PublicKey(exemptAddressInput);
      const [dappConfigPda] = await solanaWeb3.PublicKey.findProgramAddress(
        [new TextEncoder().encode('dapp_config')],
        programId
      );
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
      const [userPda] = await solanaWeb3.PublicKey.findProgramAddress(
        [new TextEncoder().encode('user'), walletAdapter.publicKey.toBytes()],
        programId
      );
      const [dappConfigPda] = await solanaWeb3.PublicKey.findProgramAddress(
        [new TextEncoder().encode('dapp_config')],
        programId
      );
      await program.methods
        .registerUser()
        .accounts({
          user: walletAdapter.publicKey,
          userPda,
          dappConfig: dappConfigPda,
          systemProgram: solanaWeb3.SystemProgram.programId
        })
        .rpc();
      statusDiv.textContent = 'User registered successfully.';
    } catch (err) {
      statusDiv.textContent = `Error registering user: ${err.message}`;
    }
  };

  // Claim Tokens
  claimTokensButton.onclick = async () => {
    try {
      const [userPda] = await solanaWeb3.PublicKey.findProgramAddress(
        [new TextEncoder().encode('user'), walletAdapter.publicKey.toBytes()],
        programId
      );
      const [dappConfigPda] = await solanaWeb3.PublicKey.findProgramAddress(
        [new TextEncoder().encode('dapp_config')],
        programId
      );
      await program.methods
        .claim()
        .accounts({
          user: walletAdapter.publicKey,
          userPda,
          dappConfig: dappConfigPda,
          systemProgram: solanaWeb3.SystemProgram.programId
        })
        .rpc();
      statusDiv.textContent = 'Tokens claimed successfully.';
    } catch (err) {
      statusDiv.textContent = `Error claiming tokens: ${err.message}`;
    }
  };
});
