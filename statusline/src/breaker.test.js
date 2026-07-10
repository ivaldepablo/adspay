import { test, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordOutcome, isTripped, WINDOW, TRIP_MS } from "./breaker.js";

function tmpPath() {
  return join(mkdtempSync(join(tmpdir(), "adspay-breaker-")), "breaker.json");
}

test("does not trip while the window is not full", () => {
  const path = tmpPath();
  // 19 fallos: ventana incompleta, no dispara.
  for (let i = 0; i < WINDOW - 1; i++) recordOutcome(false, { path, now: 1000 });
  expect(isTripped({ path, now: 1000 })).toBe(false);
});

test("trips when >50% of the last WINDOW fail", () => {
  const path = tmpPath();
  const now = 1_000_000;
  // 9 éxitos + 11 fallos = 11/20 > 50%.
  for (let i = 0; i < 9; i++) recordOutcome(true, { path, now });
  for (let i = 0; i < 11; i++) recordOutcome(false, { path, now });
  expect(isTripped({ path, now })).toBe(true);
});

test("exactly 50% failures does NOT trip", () => {
  const path = tmpPath();
  const now = 1_000_000;
  for (let i = 0; i < 10; i++) recordOutcome(true, { path, now });
  for (let i = 0; i < 10; i++) recordOutcome(false, { path, now });
  expect(isTripped({ path, now })).toBe(false);
});

test("resets after TRIP_MS (1h) and starts a clean window", () => {
  const path = tmpPath();
  const t0 = 1_000_000;
  for (let i = 0; i < 20; i++) recordOutcome(false, { path, now: t0 });
  expect(isTripped({ path, now: t0 })).toBe(true);

  // Justo antes de 1h sigue disparado; después ya no.
  expect(isTripped({ path, now: t0 + TRIP_MS - 1 })).toBe(true);
  expect(isTripped({ path, now: t0 + TRIP_MS })).toBe(false);

  // Un outcome tras la expiración arranca ventana limpia: un único fallo
  // (ventana incompleta) no vuelve a disparar.
  recordOutcome(false, { path, now: t0 + TRIP_MS });
  expect(isTripped({ path, now: t0 + TRIP_MS })).toBe(false);
});

test("a healthy run of successes never trips", () => {
  const path = tmpPath();
  for (let i = 0; i < 100; i++) recordOutcome(true, { path, now: 5000 });
  expect(isTripped({ path, now: 5000 })).toBe(false);
});
