import * as anchor from '@coral-xyz/anchor';

// If you want to expose everything as a single object, simply re‑export the default.
export default anchor;export async function getPhantom() {
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