export const MS_PER_IMPRESSION = 5000;
export const BATCH_SIZE = 20;
export const IDLE_GAP_MS = 5000; // gap mayor entre renders = sesión idle, no cuenta
export const MAX_BATCH_COUNT = 100; // debe coincidir con convex/fraud.ts

export function initialState(nowMs) {
  return { lastTickAt: nowMs, accumMs: 0, pending: 0, tsStart: null, seq: 0 };
}

/** Acumula tiempo visible entre invocaciones del statusline y lo convierte en impresiones. */
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
 * Extrae un batch listo para enviar cuando hay >= BATCH_SIZE impresiones
 * (o >= 1 con force, p. ej. al cambiar de campaña). Devuelve { state, batch|null }.
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
