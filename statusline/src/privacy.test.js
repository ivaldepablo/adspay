import { test, expect } from "vitest";
import { COUNTER_ALLOWED_KEYS, assertClean } from "./privacy.js";

// The exact payload send-batch.js builds.
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
  // Every field of the real payload is allowed.
  for (const k of Object.keys(realBody())) expect(COUNTER_ALLOWED_KEYS).toContain(k);
});

test("assertClean throws on any forbidden field", () => {
  expect(() => assertClean({ ...realBody(), prompt: "the user's secret" })).toThrow(/prompt/);
  expect(() => assertClean({ ...realBody(), cwd: "/home/pablo" })).toThrow(/not allowed/);
  expect(() => assertClean({ ...realBody(), ip: "1.2.3.4" })).toThrow();
});

test("assertClean rejects non-objects", () => {
  expect(() => assertClean(null)).toThrow();
  expect(() => assertClean("nope")).toThrow();
});
