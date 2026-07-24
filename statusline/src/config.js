import {
  readFileSync, writeFileSync, mkdirSync, renameSync, chmodSync, statSync, unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export const ADSPAY_DIR = join(homedir(), ".adspay");
export const CONFIG_PATH = join(ADSPAY_DIR, "config.json");
export const STATE_PATH = join(ADSPAY_DIR, "state.json");
export const CACHE_PATH = join(ADSPAY_DIR, "cache.json");
export const BREAKER_PATH = join(ADSPAY_DIR, "breaker.json");
export const PREV_PATH = join(ADSPAY_DIR, "prev.json");
export const LOCK_PATH = join(ADSPAY_DIR, "state.lock");

// A lock held for longer than this is assumed to belong to a process that died.
const LOCK_STALE_MS = 10_000;

/**
 * Runs `fn` while holding an exclusive lock on the impression state.
 *
 * Two Claude Code windows share ~/.adspay/state.json. Both would read the same
 * sequence number, both would send it, the server accepted one and rejected the
 * other as a replay — and those impressions were dropped without a trace. The
 * more someone used the product, the more they silently lost.
 *
 * Returns `fallback` when another window holds the lock: skipping one tick costs
 * nothing, because the impressions stay in `pending` either way.
 */
export function withStateLock(fn, fallback = undefined) {
  mkdirSync(ADSPAY_DIR, { recursive: true });
  let held = false;
  try {
    try {
      writeFileSync(LOCK_PATH, String(process.pid), { flag: "wx" });
      held = true;
    } catch {
      // Someone else holds it — unless they left it behind when they died.
      let age = Infinity;
      try {
        age = Date.now() - statSync(LOCK_PATH).mtimeMs;
      } catch {
        return fallback;
      }
      if (age < LOCK_STALE_MS) return fallback;
      try {
        writeFileSync(LOCK_PATH, String(process.pid));
        held = true;
      } catch {
        return fallback;
      }
    }
    return fn();
  } finally {
    if (held) {
      try {
        unlinkSync(LOCK_PATH);
      } catch { /* already gone */ }
    }
  }
}
export const DEFAULT_API = process.env.ADSPAY_API || "https://dazzling-dachshund-384.convex.site";

export function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

// Atomic write (tmp + rename). If we wrote ~/.claude/settings.json at the moment
// Claude Code was reading or writing it, a partial write would corrupt the user's
// config. `mode` sets the final file's permissions, independent of the umask.
export function writeJson(path, data, { mode } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.adspay-tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  if (mode !== undefined) chmodSync(tmp, mode);
  renameSync(tmp, path);
}

// config.json holds the apiKey (the HMAC secret), so it is owner-only (0600).
export function writeConfig(data) {
  writeJson(CONFIG_PATH, data, { mode: 0o600 });
}

// Should the status line show an ad? Honours the kill switch (`enabled`) and a
// temporary pause (`pausedUntil`, epoch ms). A missing `enabled` counts as on.
export function isAdEnabled(cfg, now = Date.now()) {
  if (!cfg) return false;
  if (cfg.enabled === false) return false;
  if (cfg.pausedUntil && now < cfg.pausedUntil) return false;
  return true;
}
