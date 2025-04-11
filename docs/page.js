import { Connection, PublicKey, SystemProgram, clusterApiUrl } from "@solana/web3.js";
import { AnchorProvider, Program } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import idl from "./idl.json";  // Anchor IDL for the program

// Configuration for the Solana connection
const network = clusterApiUrl("devnet");          // Use the appropriate cluster (devnet/mainnet)
const commitment = "processed";
const connection = new Connection(network, commitment);
const programId = new PublicKey(idl.metadata.address);
const textEncoder = new TextEncoder();
const tokenMintPubkey = new PublicKey("YourTokenMintAddressHere");  // replace with actual token mint

// Phantom wallet interface (injected by the Phantom extension)
const wallet = window.solana;

(async () => {
  if (!wallet || !wallet.isPhantom) {
    throw new Error("Phantom wallet not found");
  }
  // Connect to Phantom wallet (prompts user approval)
  await wallet.connect();

  // Initialize Anchor provider and program using the connected wallet
  const provider = new AnchorProvider(connection, wallet, { preflightCommitment: commitment });
  const program = new Program(idl, programId, provider);

  // Derive required Program Derived Addresses (PDAs)
  const [userPda, userBump] = PublicKey.findProgramAddressSync(
    [textEncoder.encode("user"), wallet.publicKey.toBytes()],
    programId
  );
  const [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
    [textEncoder.encode("vault")],
    programId
  );
  const [userTokenAccount, ataBump] = PublicKey.findProgramAddressSync(
    [wallet.publicKey.toBytes(), TOKEN_PROGRAM_ID.toBytes(), tokenMintPubkey.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  // (Bump values like userBump, vaultBump, ataBump are returned for completeness but not directly used below)

  // Register a new user account (calls the Anchor program's registerUser instruction)
  window.registerUser = async function() {
    await program.methods
      .registerUser()  // no arguments in this example
      .accounts({
        user: userPda,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId
      })
      .rpc();
  };

  // Set exemptions for the user (calls the Anchor program's setExemptions instruction)
  window.setExemptions = async function(exemptFlag) {
    await program.methods
      .setExemptions(exemptFlag)  // pass boolean or appropriate parameter as required
      .accounts({
        user: userPda,
        authority: wallet.publicKey
      })
      .rpc();
  };

  // Claim tokens for the user (calls the Anchor program's claimTokens instruction)
  window.claimTokens = async function() {
    await program.methods
      .claimTokens()
      .accounts({
        user: userPda,
        authority: wallet.publicKey,
        vault: vaultPda,
        userTokenAccount: userTokenAccount,
        tokenMint: tokenMintPubkey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId
      })
      .rpc();
  };
})();
