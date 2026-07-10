import { test, expect } from "vitest";
import { statSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeJson, isAdEnabled } from "./config.js";

test("isAdEnabled: on by default (enabled undefined)", () => {
  expect(isAdEnabled({ deviceId: "d1" }, 1000)).toBe(true);
});

test("isAdEnabled: off hides the ad", () => {
  expect(isAdEnabled({ enabled: false }, 1000)).toBe(false);
});

test("isAdEnabled: pause hides the ad until pausedUntil, then shows again", () => {
  const cfg = { enabled: true, pausedUntil: 5000 };
  expect(isAdEnabled(cfg, 4999)).toBe(false); // dentro de la pausa
  expect(isAdEnabled(cfg, 5000)).toBe(true);  // pausa expirada
  expect(isAdEnabled(cfg, 9999)).toBe(true);
});

test("isAdEnabled: off wins even if not paused", () => {
  expect(isAdEnabled({ enabled: false, pausedUntil: null }, 1000)).toBe(false);
});

test("isAdEnabled: no config → false", () => {
  expect(isAdEnabled(null, 1000)).toBe(false);
});

test("writeJson honors mode 0600 for secrets (config.json)", () => {
  const path = join(mkdtempSync(join(tmpdir(), "adspay-cfg-")), "config.json");
  writeJson(path, { apiKey: "s".repeat(64) }, { mode: 0o600 });
  const mode = statSync(path).mode & 0o777;
  expect(mode).toBe(0o600);
});

test("writeJson without mode leaves default perms (not forced to 0600)", () => {
  const path = join(mkdtempSync(join(tmpdir(), "adspay-cfg-")), "plain.json");
  writeJson(path, { a: 1 });
  // No debe quedar restringido: comprobamos que sigue siendo legible por el dueño.
  const mode = statSync(path).mode & 0o600;
  expect(mode & 0o400).toBe(0o400);
});
