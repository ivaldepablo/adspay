// Verificación de recibos — espejo puro de convex/receiptFormat.ts. Node stdlib.
// El dev verifica sus ganancias SIN confiar en el server: (1) la firma Ed25519 es
// válida contra la clave pública publicada, y (2) la aritmética del payout es
// reproducible (si el server firmó honesto pero calculó deshonesto, sale false).
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

/** ¿Cuadra la aritmética? gross = perImp×count y net = floor(gross×bps/10000). */
export function checkArithmetic(body) {
  const gross = body.pricePerImpressionMicroUsd * body.count;
  if (gross !== body.grossMicroUsd) return false;
  const net = Math.floor((gross * body.devShareBps) / BPS_DEN);
  return net === body.netMicroUsd;
}

/** Verifica un recibo firmado contra la clave pública (SPKI DER en base64). */
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
