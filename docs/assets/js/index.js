export * from '@solana/web3.js';
// Import the compatibility shim first to ensure legacy API compatibility.
import * as anchor from '@coral-xyz/anchor';
export default anchor;
// Then import other modules from your kit or other dependencies.
import { AnchorProvider, Program } from '@coral-xyz/anchor';

// You can export these modules or use them directly in your application.
export { AnchorProvider, Program }; 
export async function getPhantom() {
  try {
      const connection = await window.solana.connect();
      const publicKey = connection.publicKey;
      console.log("Phantom wallet connected:", publicKey.toString());
      return { windowSolana: window.solana, connection };
  } catch (err) {
      console.log(err.message);
      if (!(window.solana && window.solana.isPhantom)) {
          window.open("https://phantom.app/", "_blank");
      } else {
          console.error("Phantom connection error:", err.message);
      }
  }
}