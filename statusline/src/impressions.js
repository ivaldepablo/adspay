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

/**
 * Pulls out a batch ready to send once there are >= BATCH_SIZE impressions (or
 * >= 1 with force, e.g. when the campaign changes). Returns { state, batch|null }.
 */
export function drainBatch(state, nowMs, force = false) {
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
