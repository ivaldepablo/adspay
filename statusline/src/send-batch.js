#!/usr/bin/env node
// Enviador de batches (proceso detached). Si falla, devuelve las impresiones al state.
import { CONFIG_PATH, STATE_PATH, readJson, writeJson } from "./config.js";
import { hmacHex, batchMessage } from "./hmac.js";
import { assertClean } from "./privacy.js";

const cfg = readJson(CONFIG_PATH);
const payloadArg = process.argv[2];
if (!cfg || !payloadArg) process.exit(0);

const { campaignId, count, tsStart, tsEnd, seq } = JSON.parse(payloadArg);
const body = { deviceId: cfg.deviceId, campaignId, count, tsStart, tsEnd, seq };
// Barrera de privacidad: nada fuera de la allowlist sale a la red.
assertClean(body);
const signature = hmacHex(cfg.apiKey, batchMessage(body));

try {
  const res = await fetch(`${cfg.api}/v1/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature": signature },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const result = res.ok ? await res.json() : { accepted: false, reason: `http_${res.status}` };
  if (!result.accepted && result.reason !== "replay") requeue();
} catch {
  requeue();
}

function requeue() {
  const state = readJson(STATE_PATH);
  if (!state) return;
  // Las impresiones vuelven a pending; el seq consumido no se reutiliza (anti-replay).
  writeJson(STATE_PATH, { ...state, pending: (state.pending ?? 0) + count });
}
