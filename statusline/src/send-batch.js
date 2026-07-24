#!/usr/bin/env node
// Batch sender, run as a detached process. On failure the impressions go back
// into local state so nothing the developer earned is silently dropped.
import { CONFIG_PATH, STATE_PATH, readJson, writeJson } from "./config.js";
import { hmacHex, batchMessage } from "./hmac.js";
import { assertClean } from "./privacy.js";
import { backoffMs, MAX_SEND_ATTEMPTS } from "./impressions.js";

const cfg = readJson(CONFIG_PATH);
const payloadArg = process.argv[2];
if (!cfg || !payloadArg) process.exit(0);

const { campaignId, count, tsStart, tsEnd, seq } = JSON.parse(payloadArg);
const body = { deviceId: cfg.deviceId, campaignId, count, tsStart, tsEnd, seq };
// Privacy barrier: nothing outside the allowlist ever reaches the network.
assertClean(body);
const signature = hmacHex(cfg.apiKey, batchMessage(body));

// Reasons a retry will never fix. Re-sending these only burns the device's
// TrustRank for impressions it was never going to be paid for.
const PERMANENT = new Set([
  "replay",
  "device_banned",
  "device_not_found",
  "campaign_not_found",
  "campaign_paused",
  "campaign_pending",
  "campaign_rejected",
  "campaign_exhausted",
  "low_trust",
]);

try {
  const res = await fetch(`${cfg.api}/v1/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature": signature },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const result = res.ok ? await res.json() : { accepted: false, reason: `http_${res.status}` };

  if (result.accepted) {
    // A cap can trim the batch. Whatever went unpaid returns to the queue so it
    // can go out in the next hour instead of being thrown away.
    settle(Math.max(0, count - (result.acceptedCount ?? count)));
  } else if (PERMANENT.has(result.reason)) {
    settle(0);
  } else {
    retryLater();
  }
} catch {
  retryLater();
}

/** Returns `unpaid` impressions to the queue and records when to try again. */
function settle(unpaid, retryAfter = 0, attempts = 0) {
  const state = readJson(STATE_PATH);
  if (!state) return;
  // Impressions return to pending; the consumed seq is never reused (anti-replay).
  writeJson(STATE_PATH, {
    ...state,
    pending: (state.pending ?? 0) + unpaid,
    retryAfter: retryAfter || undefined,
    attempts: attempts || undefined,
  });
}

function retryLater() {
  const state = readJson(STATE_PATH);
  if (!state) return;
  const attempts = (state.attempts ?? 0) + 1;
  // Give up eventually. Holding the batch for ever would keep the device silent,
  // and by this point roughly a day of retries has gone by.
  if (attempts > MAX_SEND_ATTEMPTS) {
    settle(0);
    return;
  }
  settle(count, Date.now() + backoffMs(attempts), attempts);
}
