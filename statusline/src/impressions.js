export const MS_PER_IMPRESSION = 5000;
export const BATCH_SIZE = 20;
export const IDLE_GAP_MS = 5000; // a longer gap between renders means an idle session; it does not count
export const MAX_BATCH_COUNT = 100; // must match convex/fraud.ts

export function initialState(nowMs) {
  return { lastTickAt: nowMs, accumMs: 0, pending: 0, tsStart: null, seq: 0 };
}

/** Accumulates on-screen time between status-line runs and turns it into impressions. */
export function tick(state, nowMs) {
  const gap = nowMs - state.lastTickAt;
  const s = { ...state };
  if (gap > 0 && gap <= IDLE_GAP_MS) {
    if (s.tsStart === null) s.tsStart = state.lastTickAt;
    s.accumMs += gap;
    while (s.accumMs >= MS_PER_IMPRESSION) {
      s.accumMs -= MS_PER_IMPRESSION;
      s.pending += 1;
    }
  }
  s.lastTickAt = nowMs;
  return s;
}

// Backoff after a failed send, capped. Without this, a single network blip put
// the client into a loop: the batch went straight back into `pending`, hit the
// threshold again on the very next render, and got re-sent several times a
// second. The server saw a flood of stale batches, counted each as a rejection,
// and the device's TrustRank fell below the earning floor in about a minute —
// permanently, and invisibly to its owner.
export const RETRY_BASE_MS = 60_000;
export const RETRY_MAX_MS = 60 * 60_000;
export const MAX_SEND_ATTEMPTS = 8;

export function backoffMs(attempts) {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1));
}

/**
 * Pulls out a batch ready to send once there are >= BATCH_SIZE impressions (or
 * >= 1 with force, e.g. when the campaign changes). Returns { state, batch|null }.
 */
export function drainBatch(state, nowMs, force = false) {
  if (state.retryAfter && nowMs < state.retryAfter) return { state, batch: null };
  if (state.pending < (force ? 1 : BATCH_SIZE)) return { state, batch: null };
  const count = Math.min(state.pending, MAX_BATCH_COUNT);
  const batch = {
    count,
    tsStart: state.tsStart ?? nowMs - count * MS_PER_IMPRESSION,
    tsEnd: nowMs,
    seq: state.seq + 1,
  };
  return {
    state: { ...state, pending: state.pending - count, tsStart: null, seq: batch.seq },
    batch,
  };
}
