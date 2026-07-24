// Circuit breaker: records how the last status-line runs went in
// ~/.adspay/breaker.json. If more than half of the last WINDOW runs failed, ads
// stop rendering for TRIP_MS (1h). So if our backend is down or this client is
// broken, we get out of the user's way without them having to do anything.
import { BREAKER_PATH, readJson, writeJson } from "./config.js";

export const WINDOW = 20;
export const TRIP_MS = 60 * 60 * 1000; // 1h

function emptyState() {
  return { outcomes: [], trippedUntil: null };
}

/**
 * Records a success (ok=true) or a failure (ok=false), keeping only the last
 * WINDOW results. If a previous trip has expired, the window starts clean.
 * Trips the breaker once more than half of a full window has failed.
 * Returns the resulting state.
 */
export function recordOutcome(ok, { path = BREAKER_PATH, now = Date.now() } = {}) {
  const state = readJson(path) ?? emptyState();
  let trippedUntil = state.trippedUntil ?? null;
  let prev = Array.isArray(state.outcomes) ? state.outcomes : [];

  // Trip has expired -> clean slate.
  if (trippedUntil && now >= trippedUntil) {
    trippedUntil = null;
    prev = [];
  }

  const outcomes = [...prev, ok ? 1 : 0].slice(-WINDOW);

  if (!trippedUntil && outcomes.length >= WINDOW) {
    const failures = outcomes.filter((o) => o === 0).length;
    if (failures > WINDOW / 2) trippedUntil = now + TRIP_MS;
  }

  const next = { outcomes, trippedUntil };
  writeJson(path, next);
  return next;
}

/** Is the breaker tripped right now? */
export function isTripped({ path = BREAKER_PATH, now = Date.now() } = {}) {
  const state = readJson(path);
  if (!state?.trippedUntil) return false;
  return now < state.trippedUntil;
}
