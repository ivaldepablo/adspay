import { readFileSync, writeFileSync, mkdirSync, renameSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export const ADSPAY_DIR = join(homedir(), ".adspay");
export const CONFIG_PATH = join(ADSPAY_DIR, "config.json");
export const STATE_PATH = join(ADSPAY_DIR, "state.json");
export const CACHE_PATH = join(ADSPAY_DIR, "cache.json");
export const BREAKER_PATH = join(ADSPAY_DIR, "breaker.json");
export const DEFAULT_API = process.env.ADSPAY_API || "https://dazzling-dachshund-384.convex.site";

export function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

// Escritura atómica (tmp + rename): si escribimos ~/.claude/settings.json justo
// cuando Claude Code lo lee/escribe, un write parcial le corrompería la config.
// `mode` fija los permisos del archivo final (independiente del umask).
export function writeJson(path, data, { mode } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.adspay-tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  if (mode !== undefined) chmodSync(tmp, mode);
  renameSync(tmp, path);
}

// config.json guarda el apiKey (secreto HMAC): solo-usuario (0600).
export function writeConfig(data) {
  writeJson(CONFIG_PATH, data, { mode: 0o600 });
}

// ¿Debe el statusline mostrar ad? Respeta kill-switch (`enabled`) y pausa
// temporal (`pausedUntil`, ms epoch). `enabled` ausente cuenta como activo.
export function isAdEnabled(cfg, now = Date.now()) {
  if (!cfg) return false;
  if (cfg.enabled === false) return false;
  if (cfg.pausedUntil && now < cfg.pausedUntil) return false;
  return true;
}
