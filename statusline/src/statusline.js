#!/usr/bin/env node
// Statusline de Claude Code: stdin JSON → primera línea de stdout.
// Nunca debe tardar ni romper: cualquier error degrada a línea vacía o passthrough.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_PATH, STATE_PATH, CACHE_PATH, readJson, writeJson, isAdEnabled } from "./config.js";
import { initialState, tick, drainBatch } from "./impressions.js";
import { recordOutcome, isTripped } from "./breaker.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function osc8(text, url) {
  return `]8;;${url}${text}]8;;`;
}

async function main() {
  let stdinData = "";
  try {
    stdinData = readAllStdinSync();
  } catch { /* sin stdin, seguimos */ }

  const cfg = readJson(CONFIG_PATH);
  let prefix = "";
  if (cfg?.previousCommand) {
    try {
      const prev = spawnSync("sh", ["-c", cfg.previousCommand], {
        input: stdinData, encoding: "utf8", timeout: 800,
      });
      prefix = (prev.stdout || "").split("\n")[0].trim();
    } catch { /* el comando previo falló; seguimos solo con el ad */ }
  }

  if (!cfg?.deviceId) {
    process.stdout.write(prefix || "✶ adspay: ejecuta `npx adspay init`");
    return;
  }

  const now = Date.now();

  // Kill-switch (`adspay off`) o pausa temporal (`adspay pause`): callamos el
  // ad y encadenamos el statusLine previo del usuario.
  if (!isAdEnabled(cfg, now)) {
    process.stdout.write(prefix);
    return;
  }

  // Circuit breaker: si las últimas invocaciones fallaron mayoritariamente,
  // no renderizamos ad durante 1h (degradado a silencio encadenado).
  if (isTripped()) {
    process.stdout.write(prefix);
    return;
  }

  // Todo el pipeline del ad va envuelto: un fallo registra outcome y degrada
  // a silencio (prefix), nunca lanza excepción hacia el host.
  try {
    const line = await renderAd(cfg, now, prefix);
    recordOutcome(true);
    process.stdout.write(line);
  } catch {
    recordOutcome(false);
    process.stdout.write(prefix);
  }
}

async function renderAd(cfg, now, prefix) {
  // Ad cacheado 60s
  let cache = readJson(CACHE_PATH);
  let fetchFailed = false;
  if (!cache || now - cache.fetchedAt > (cache.ttlSeconds ?? 60) * 1000) {
    try {
      const res = await fetch(`${cfg.api}/v1/ad?surface=terminal&d=${cfg.deviceId}`, {
        signal: AbortSignal.timeout(1500),
      });
      cache = res.status === 200
        ? { ...(await res.json()), fetchedAt: now }
        : { empty: true, fetchedAt: now, ttlSeconds: 60 };
      writeJson(CACHE_PATH, cache);
    } catch {
      fetchFailed = true;
      cache = cache ?? { empty: true, fetchedAt: now, ttlSeconds: 60 };
    }
  }

  if (cache.empty || !cache.adLine) {
    // Sin ad servible y encima el fetch reventó → cuenta como fallo del breaker.
    if (fetchFailed) throw new Error("ad fetch failed");
    return prefix || "✶ adspay";
  }

  // Contador de impresiones + batching
  let state = readJson(STATE_PATH) ?? initialState(now);
  if (state.campaignId && state.campaignId !== cache.campaignId && state.pending > 0) {
    // cambio de campaña: drena lo pendiente aunque no llegue a 20
    const forced = drainBatch(state, now, true);
    if (forced.batch) sendBatch(cfg, state.campaignId, forced.batch);
    state = forced.state;
  }
  state.campaignId = cache.campaignId;
  state = tick(state, now);
  const { state: after, batch } = drainBatch(state, now);
  if (batch) sendBatch(cfg, cache.campaignId, batch);
  writeJson(STATE_PATH, after);

  const adText = `✶ ${cache.adLine}`;
  const link = cache.clickUrl ? osc8(adText, `${cfg.api}${cache.clickUrl}`) : adText;
  return prefix ? `${prefix} | ${link}` : link;
}

function sendBatch(cfg, campaignId, batch) {
  // Proceso hijo detached: el statusline jamás espera a la red.
  const child = spawn(
    process.execPath,
    [join(__dirname, "send-batch.js"), JSON.stringify({ campaignId, ...batch })],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
}

function readAllStdinSync() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

main().catch(() => process.stdout.write(""));
