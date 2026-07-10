// Mismo modelo de impresiones que clients/statusline/src/impressions.js,
// portado a TS para la extensión. Los valores deben coincidir con convex/fraud.ts.
export const MS_PER_IMPRESSION = 5000;
export const BATCH_SIZE = 20;
export const IDLE_GAP_MS = 5000;
export const MAX_BATCH_COUNT = 100;

export type CounterState = {
  lastTickAt: number;
  accumMs: number;
  pending: number;
  tsStart: number | null;
  seq: number;
  campaignId?: string;
};

export type Batch = { count: number; tsStart: number; tsEnd: number; seq: number };

export function initialState(nowMs: number): CounterState {
  return { lastTickAt: nowMs, accumMs: 0, pending: 0, tsStart: null, seq: 0 };
}

export function tick(state: CounterState, nowMs: number): CounterState {
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

export function drainBatch(
  state: CounterState,
  nowMs: number,
  force = false
): { state: CounterState; batch: Batch | null } {
  if (state.pending < (force ? 1 : BATCH_SIZE)) return { state, batch: null };
  const count = Math.min(state.pending, MAX_BATCH_COUNT);
  const batch: Batch = {
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
