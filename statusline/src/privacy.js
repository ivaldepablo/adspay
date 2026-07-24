// Privacy allowlist for the counter batch. The only thing that ever leaves the
// user's machine is a signed impression count — never prompts, paths, file
// contents or telemetry. These are EXACTLY the permitted fields: anything else
// fails the send loudly, and a test enforces it, which is what lets us claim
// "we never send anything outside this list" and mean it.
export const COUNTER_ALLOWED_KEYS = Object.freeze([
  "deviceId",
  "campaignId",
  "count",
  "tsStart",
  "tsEnd",
  "seq",
]);

/** Throws if `body` carries any field outside COUNTER_ALLOWED_KEYS. */
export function assertClean(body) {
  if (!body || typeof body !== "object") {
    throw new Error("adspay privacy: invalid batch body");
  }
  for (const key of Object.keys(body)) {
    if (!COUNTER_ALLOWED_KEYS.includes(key)) {
      throw new Error(`adspay privacy: field not allowed in batch: "${key}"`);
    }
  }
  return body;
}
