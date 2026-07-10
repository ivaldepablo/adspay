// Circuit breaker: registra el resultado de las últimas invocaciones del
// statusline en ~/.adspay/breaker.json. Si >50% de las últimas WINDOW fallan,
// auto-desactiva el render del ad durante TRIP_MS (1h). Así, si el backend está
// caído o el cliente rompe, dejamos de molestar al usuario sin que él haga nada.
import { BREAKER_PATH, readJson, writeJson } from "./config.js";

export const WINDOW = 20;
export const TRIP_MS = 60 * 60 * 1000; // 1h

function emptyState() {
  return { outcomes: [], trippedUntil: null };
}

/**
 * Registra un éxito (ok=true) o fallo (ok=false). Mantiene solo los últimos
 * WINDOW resultados. Si el trip anterior ya expiró, arranca ventana limpia.
 * Cuando >50% de una ventana completa falla, dispara el breaker.
 * Devuelve el estado resultante.
 */
export function recordOutcome(ok, { path = BREAKER_PATH, now = Date.now() } = {}) {
  const state = readJson(path) ?? emptyState();
  let trippedUntil = state.trippedUntil ?? null;
  let prev = Array.isArray(state.outcomes) ? state.outcomes : [];

  // Trip expirado → borrón y cuenta nueva.
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

/** ¿Está el breaker disparado ahora mismo? */
export function isTripped({ path = BREAKER_PATH, now = Date.now() } = {}) {
  const state = readJson(path);
  if (!state?.trippedUntil) return false;
  return now < state.trippedUntil;
}
