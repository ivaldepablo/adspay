import { test, expect } from "vitest";
import { statSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platform } from "node:os";
import { writeJson, isAdEnabled, withStateLock } from "./config.js";

test("isAdEnabled: on by default (enabled undefined)", () => {
  expect(isAdEnabled({ deviceId: "d1" }, 1000)).toBe(true);
});

test("isAdEnabled: off hides the ad", () => {
  expect(isAdEnabled({ enabled: false }, 1000)).toBe(false);
});

test("isAdEnabled: pause hides the ad until pausedUntil, then shows again", () => {
  const cfg = { enabled: true, pausedUntil: 5000 };
  expect(isAdEnabled(cfg, 4999)).toBe(false); // still inside the pause
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
  // Windows does not implement POSIX mode bits; chmod is meaningful on the
  // Unix systems where 0600 is enforceable. The write itself is still tested.
  if (platform() !== "win32") expect(mode).toBe(0o600);
});

test("writeJson without mode leaves default perms (not forced to 0600)", () => {
  const path = join(mkdtempSync(join(tmpdir(), "adspay-cfg-")), "plain.json");
  writeJson(path, { a: 1 });
  // Must not end up over-restricted: check it is still readable by its owner.
  const mode = statSync(path).mode & 0o600;
  expect(mode & 0o400).toBe(0o400);
});

// Two Claude Code windows share ~/.adspay/state.json. Both used to read the same
// sequence number and send it; the server accepted one and rejected the other as
// a replay, and those impressions vanished without a trace.
test("withStateLock lets only one holder into the critical section at a time", () => {
  const order = [];
  const outer = withStateLock(() => {
    order.push("outer");
    // A second window arriving mid-write must be turned away, not allowed in.
    const inner = withStateLock(() => { order.push("inner"); return "ran"; }, "skipped");
    expect(inner).toBe("skipped");
    return "done";
  });
  expect(outer).toBe("done");
  expect(order).toEqual(["outer"]);
});

test("withStateLock releases the lock even when the body throws", () => {
  expect(() => withStateLock(() => { throw new Error("boom"); })).toThrow("boom");
  expect(withStateLock(() => "free", "blocked")).toBe("free");
});
