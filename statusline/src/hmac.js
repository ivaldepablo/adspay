import { createHmac } from "node:crypto";

/** Debe producir exactamente la misma firma que convex/hmac.ts (WebCrypto HMAC-SHA256 hex). */
export function hmacHex(secret, message) {
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function batchMessage(p) {
  return `${p.deviceId}.${p.campaignId}.${p.count}.${p.tsStart}.${p.tsEnd}.${p.seq}`;
}
