// Receipt verification — a pure mirror of convex/receiptFormat.ts, Node stdlib
// only. It lets a developer check their earnings WITHOUT trusting our server:
// (1) the Ed25519 signature is valid against the published public key, and
// (2) the payout arithmetic is reproducible — so a server that signed honestly
// but computed dishonestly still fails the check.
import { createPublicKey, verify as nodeVerify } from "node:crypto";

const BPS_DEN = 10_000;

export function canonicalize(value) {
  return JSON.stringify(sortDeep(value));
}
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = sortDeep(value[key]);
    }
    return out;
  }
  return value;
}

/** Does the arithmetic add up? gross = perImp×count, net = floor(gross×bps/10000). */
export function checkArithmetic(body) {
  const gross = body.pricePerImpressionMicroUsd * body.count;
  if (gross !== body.grossMicroUsd) return false;
  const net = Math.floor((gross * body.devShareBps) / BPS_DEN);
  return net === body.netMicroUsd;
}

/** Verifies a signed receipt against the public key (SPKI DER, base64). */
export function verifyReceipt(receipt, publicKeyB64) {
  const reasons = [];
  let body;
  try {
    body = JSON.parse(receipt.bodyJson);
  } catch {
    return { ok: false, signatureValid: false, arithmeticValid: false, reasons: ["bad_json"] };
  }
  let signatureValid = false;
  try {
    const pub = createPublicKey({
      key: Buffer.from(publicKeyB64, "base64"),
      format: "der",
      type: "spki",
    });
    signatureValid = nodeVerify(
      null,
      Buffer.from(canonicalize(body), "utf8"),
      pub,
      Buffer.from(receipt.signature, "base64url")
    );
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) reasons.push("bad_signature");
  const arithmeticValid = checkArithmetic(body);
  if (!arithmeticValid) reasons.push("bad_arithmetic");
  return { ok: signatureValid && arithmeticValid, signatureValid, arithmeticValid, reasons, body };
}
