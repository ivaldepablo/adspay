// Solana address validation — PURE, no dependencies. Mirror of convex/wallet.ts.
//
// A payout wallet used to be stored verbatim, so a typo (or "my paypal account")
// was accepted happily. The developer then earned, the hourly sweep created a
// payout, the on-chain send threw on an unparseable address, the entries went
// back to payable, and the same failure repeated every hour for ever — with
// nothing but "failed" on their dashboard to explain it. Catching it here means
// they find out while they can still fix it.

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Decodes base58 to a byte length; returns null if any character is invalid. */
function base58ByteLength(input) {
  const bytes = [0];
  for (const char of input) {
    const value = BASE58.indexOf(char);
    if (value === -1) return null;
    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading '1's are leading zero bytes.
  let leadingZeros = 0;
  for (const char of input) {
    if (char !== "1") break;
    leadingZeros++;
  }
  return bytes.length + leadingZeros - (bytes[bytes.length - 1] === 0 ? 1 : 0);
}

/** Is this a syntactically valid Solana address (32 bytes, base58)? */
export function isValidSolanaAddress(address) {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  // Every 32-byte base58 string lands in this range; checking it first rejects
  // the obvious cases without doing the arithmetic.
  if (trimmed.length < 32 || trimmed.length > 44) return false;
  return base58ByteLength(trimmed) === 32;
}
