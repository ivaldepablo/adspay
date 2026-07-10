import { test, expect } from "vitest";
import { generateKeyPairSync, sign as nodeSign } from "node:crypto";
import { canonicalize, checkArithmetic, verifyReceipt } from "./receipt.js";

function signedReceipt(body, privateKey) {
  const bodyJson = canonicalize(body);
  const signature = nodeSign(null, Buffer.from(bodyJson, "utf8"), privateKey).toString("base64url");
  return { bodyJson, signature, keyId: "k1" };
}

const validBody = {
  schema: "adspay.receipt/v1", ledgerId: "l1", deviceId: "d1", campaignId: "c1",
  source: "impressions", count: 20, pricePerImpressionMicroUsd: 1000,
  grossMicroUsd: 20000, devShareBps: 7000, netMicroUsd: 14000,
  formulaVersion: "1.0.0", issuedAt: 1,
};

test("un recibo bien firmado y con aritmética correcta verifica ok", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const res = verifyReceipt(signedReceipt(validBody, privateKey), pub);
  expect(res.ok).toBe(true);
  expect(res.signatureValid).toBe(true);
  expect(res.arithmeticValid).toBe(true);
});

test("firma con otra clave → signatureValid false", () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const { publicKey: otherPub } = generateKeyPairSync("ed25519");
  const pub = otherPub.export({ type: "spki", format: "der" }).toString("base64");
  const res = verifyReceipt(signedReceipt(validBody, privateKey), pub);
  expect(res.signatureValid).toBe(false);
  expect(res.ok).toBe(false);
});

test("net inflado con firma válida → arithmeticValid false (server deshonesto)", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const cheating = { ...validBody, netMicroUsd: 19999 };
  const res = verifyReceipt(signedReceipt(cheating, privateKey), pub);
  expect(res.signatureValid).toBe(true);   // la firma es válida…
  expect(res.arithmeticValid).toBe(false); // …pero la cuenta no cuadra
  expect(res.ok).toBe(false);
});

test("checkArithmetic acepta 85% founding", () => {
  expect(checkArithmetic({ ...validBody, devShareBps: 8500, netMicroUsd: 17000 })).toBe(true);
});
