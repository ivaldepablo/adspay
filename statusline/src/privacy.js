// Allowlist de privacidad para el batch de contadores. El único dato que sale
// del equipo del usuario es el conteo de impresiones firmado; jamás prompts,
// rutas, contenido ni telemetría. Estos son EXACTAMENTE los campos permitidos:
// cualquier otro hace fallar el envío de forma explícita (y hay un test que lo
// prueba, así podemos afirmar "nunca enviamos nada fuera de esta lista").
export const COUNTER_ALLOWED_KEYS = Object.freeze([
  "deviceId",
  "campaignId",
  "count",
  "tsStart",
  "tsEnd",
  "seq",
]);

/** Lanza si `body` contiene cualquier campo fuera de COUNTER_ALLOWED_KEYS. */
export function assertClean(body) {
  if (!body || typeof body !== "object") {
    throw new Error("adspay privacy: body de batch inválido");
  }
  for (const key of Object.keys(body)) {
    if (!COUNTER_ALLOWED_KEYS.includes(key)) {
      throw new Error(`adspay privacy: campo no permitido en batch: "${key}"`);
    }
  }
  return body;
}
