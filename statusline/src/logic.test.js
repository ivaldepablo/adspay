import { test, expect } from "vitest";
import { hmacHex, batchMessage } from "./hmac.js";
import {
  initialState, tick, drainBatch, MS_PER_IMPRESSION, BATCH_SIZE,
  backoffMs, RETRY_BASE_MS, RETRY_MAX_MS, MAX_SEND_ATTEMPTS,
} from "./impressions.js";
import { mergeStatusLine } from "./settings-merge.js";

// RFC 4231 test case 2 — proves the node:crypto implementation produces the
// same standard HMAC-SHA256 as the server's WebCrypto.
test("hmacHex matches RFC 4231 vector", () => {
  expect(hmacHex("Jefe", "what do ya want for nothing?")).toBe(
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
  );
});

test("batchMessage canonical format matches server", () => {
  expect(batchMessage({ deviceId: "d1", campaignId: "c1", count: 20, tsStart: 1, tsEnd: 2, seq: 3 }))
    .toBe("d1.c1.20.1.2.3");
});

test("tick accumulates visible time into impressions", () => {
  let s = initialState(0);
  for (let t = 1000; t <= 12_000; t += 1000) s = tick(s, t); // 12s visibles
  expect(s.pending).toBe(2); // 12s / 5s = 2 imps, 2s acumulados
  expect(s.accumMs).toBe(2000);
  expect(s.tsStart).toBe(0);
});

test("idle gaps do not count", () => {
  let s = initialState(0);
  s = tick(s, 1000);       // +1s
  s = tick(s, 61_000);     // gap 60s → idle, no cuenta
  s = tick(s, 62_000);     // +1s
  expect(s.accumMs).toBe(2000);
  expect(s.pending).toBe(0);
});

test("drainBatch waits for BATCH_SIZE then drains with increasing seq", () => {
  let s = initialState(0);
  let t = 0;
  while (s.pending < BATCH_SIZE) { t += 1000; s = tick(s, t); }
  expect(drainBatch({ ...s, pending: BATCH_SIZE - 1 }, t).batch).toBeNull();
  const { state: s2, batch } = drainBatch(s, t);
  expect(batch).toMatchObject({ count: BATCH_SIZE, seq: 1, tsStart: 0, tsEnd: t });
  expect(batch.tsEnd - batch.tsStart).toBeGreaterThanOrEqual(batch.count * MS_PER_IMPRESSION);
  expect(s2.pending).toBe(0);
  const forced = drainBatch({ ...s2, pending: 3, tsStart: t }, t + 20_000, true);
  expect(forced.batch).toMatchObject({ count: 3, seq: 2 });
});

test("mergeStatusLine preserves settings and captures previous command", () => {
  const { merged, previousCommand } = mergeStatusLine(
    { theme: "dark", statusLine: { type: "command", command: "my-status" } },
    "node /x/statusline.js"
  );
  expect(merged.theme).toBe("dark");
  expect(merged.statusLine).toEqual({ type: "command", command: "node /x/statusline.js" });
  expect(previousCommand).toBe("my-status");

  const fresh = mergeStatusLine({}, "node /x/statusline.js");
  expect(fresh.previousCommand).toBeNull();
  expect(fresh.merged.statusLine.command).toBe("node /x/statusline.js");
});

// A single network blip used to put the client into a hot loop: the batch went
// back into `pending`, tripped the threshold on the very next render, and was
// re-sent several times a second. The server counted each stale batch as a
// rejection and the device's TrustRank fell below the earning floor in about a
// minute — permanently, and with no sign of it for its owner.
test("a failed send holds the batch back instead of retrying every render", () => {
  const now = 1_000_000;
  const state = { ...initialState(now), pending: 40, retryAfter: now + 60_000 };
  expect(drainBatch(state, now).batch).toBeNull();
  expect(drainBatch(state, now + 59_999).batch).toBeNull();
  expect(drainBatch(state, now + 60_001).batch).not.toBeNull();
});

test("backoff grows and is capped", () => {
  expect(backoffMs(1)).toBe(RETRY_BASE_MS);
  expect(backoffMs(2)).toBe(RETRY_BASE_MS * 2);
  expect(backoffMs(3)).toBe(RETRY_BASE_MS * 4);
  expect(backoffMs(99)).toBe(RETRY_MAX_MS);
  expect(backoffMs(MAX_SEND_ATTEMPTS)).toBeLessThanOrEqual(RETRY_MAX_MS);
});
