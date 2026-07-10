import { test, expect } from "vitest";
import { COUNTER_ALLOWED_KEYS, assertClean } from "./privacy.js";

// El payload real construido por send-batch.js.
function realBody() {
  return { deviceId: "d1", campaignId: "c1", count: 20, tsStart: 1, tsEnd: 2, seq: 3 };
}

test("assertClean passes with the exact batch payload", () => {
  expect(() => assertClean(realBody())).not.toThrow();
  expect(assertClean(realBody())).toEqual(realBody());
});

test("the allowlist is exactly the batch fields and is frozen", () => {
  expect([...COUNTER_ALLOWED_KEYS].sort()).toEqual(
    ["campaignId", "count", "deviceId", "seq", "tsEnd", "tsStart"]
  );
  expect(Object.isFrozen(COUNTER_ALLOWED_KEYS)).toBe(true);
  // Cada campo del payload real está permitido.
  for (const k of Object.keys(realBody())) expect(COUNTER_ALLOWED_KEYS).toContain(k);
});

test("assertClean throws on any forbidden field", () => {
  expect(() => assertClean({ ...realBody(), prompt: "secreto del usuario" })).toThrow(/prompt/);
  expect(() => assertClean({ ...realBody(), cwd: "/home/pablo" })).toThrow(/no permitido/);
  expect(() => assertClean({ ...realBody(), ip: "1.2.3.4" })).toThrow();
});

test("assertClean rejects non-objects", () => {
  expect(() => assertClean(null)).toThrow();
  expect(() => assertClean("nope")).toThrow();
});
