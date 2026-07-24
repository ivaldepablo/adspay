#!/usr/bin/env node
// Claude Code status line: JSON on stdin -> the rendered line(s) on stdout.
// It must never be slow and never throw: every failure degrades to the user's
// own status line, or to nothing at all.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONFIG_PATH, STATE_PATH, CACHE_PATH, PREV_PATH,
  readJson, writeJson, isAdEnabled, withStateLock,
} from "./config.js";
import { initialState, tick, drainBatch } from "./impressions.js";
import { recordOutcome, isTripped } from "./breaker.js";
import { toLines, compose } from "./chain.js";
import { isOwnCommand } from "./settings-merge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// If the host stops reading before we finish writing, stdout emits EPIPE as an
// error event — which is not catchable by the promise chain below and would dump
// a Node stack trace into someone's terminal. Swallow it: a closed pipe means
// the status line is simply no longer wanted.
process.stdout.on("error", () => {});

// The status line we replaced gets roughly the budget Claude Code would have
// given it on its own. A tighter cap would make someone else's status line
// disappear on slow machines, and they would rightly blame us for it.
const PREVIOUS_TIMEOUT_MS = 2000;

// How long we will keep showing the previous status line's last known output
// after its command stops working. Long enough to ride out a blip, short enough
// that nobody stares at stale numbers.
const PREVIOUS_CACHE_TTL_MS = 5 * 60 * 1000;

function osc8(text, url) {
  return `]8;;${url}${text}]8;;`;
}

async function main() {
  let stdinData = "";
  try {
    stdinData = readAllStdinSync();
  } catch { /* no stdin; carry on */ }

  const cfg = readJson(CONFIG_PATH);
  const previous = cfg?.previousCommand ? runPrevious(cfg.previousCommand, stdinData) : [];

  if (!cfg?.deviceId) {
    process.stdout.write(compose(previous, "✶ adspay: run `npx adspay init`"));
    return;
  }

  const now = Date.now();

  // Kill switch (`adspay off`) or a temporary pause (`adspay pause`): stay quiet
  // and render only the user's own status line.
  if (!isAdEnabled(cfg, now)) {
    process.stdout.write(compose(previous, ""));
    return;
  }

  // Circuit breaker: if recent runs mostly failed, stop rendering ads for an
  // hour and degrade to the user's own status line.
  if (isTripped()) {
    process.stdout.write(compose(previous, ""));
    return;
  }

  // The whole ad pipeline is wrapped: a failure records the outcome and falls
  // back to silence. It never throws at the host.
  try {
    const line = await renderAd(cfg, now, previous);
    recordOutcome(true);
    process.stdout.write(line);
  } catch {
    recordOutcome(false);
    process.stdout.write(compose(previous, ""));
  }
}

// Runs the status line command that was configured before adspay and returns
// its lines. On timeout or failure we reuse the last output we saw instead of
// rendering nothing: a stale row is a far smaller sin than making the user's
// status line vanish. That fallback expires, though — a status line frozen on
// last week's numbers is its own kind of lie.
function runPrevious(command, stdinData) {
  // Never chain another copy of ourselves. Two adspay installs (an npx cache and
  // a global one) carry different absolute paths, so without this each render
  // would spawn a new copy and the terminal would fill with orphaned processes.
  if (isOwnCommand(command)) return [];
  try {
    const prev = spawnSync(command, {
      input: stdinData, encoding: "utf8", timeout: PREVIOUS_TIMEOUT_MS, shell: true,
    });
    const lines = toLines(prev.stdout);
    if (lines.length) {
      writeJson(PREV_PATH, { command, lines, at: Date.now() });
      return lines;
    }
    // Exited cleanly with no output — that is a real empty status line, not a
    // failure, so do not resurrect a cached one.
    if (!prev.error && prev.status === 0) return [];
  } catch { /* fall through to the cache */ }

  const cached = readJson(PREV_PATH);
  const fresh = cached?.at && Date.now() - cached.at < PREVIOUS_CACHE_TTL_MS;
  return fresh && cached.command === command && Array.isArray(cached.lines) ? cached.lines : [];
}

async function renderAd(cfg, now, previous) {
  // Ads are cached for 60s.
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
    // Nothing to serve and the fetch blew up too -> counts as a breaker failure.
    if (fetchFailed) throw new Error("ad fetch failed");
    return compose(previous, previous.length ? "" : "✶ adspay");
  }

  // Impression counter + batching. Held under a lock because two Claude Code
  // windows share this file: without it both read the same sequence number, the
  // server accepted one and rejected the other as a replay, and those impressions
  // were lost with nothing to show for them.
  withStateLock(() => {
    let state = readJson(STATE_PATH) ?? initialState(now);
    if (state.campaignId && state.campaignId !== cache.campaignId && state.pending > 0) {
      // Campaign changed: flush what is pending even if it is under 20.
      const forced = drainBatch(state, now, true);
      if (forced.batch) sendBatch(cfg, state.campaignId, forced.batch);
      state = forced.state;
    }
    state.campaignId = cache.campaignId;
    state = tick(state, now);
    const { state: after, batch } = drainBatch(state, now);
    if (batch) sendBatch(cfg, cache.campaignId, batch);
    writeJson(STATE_PATH, after);
  });

  const adText = `✶ ${cache.adLine}`;
  const link = cache.clickUrl ? osc8(adText, `${cfg.api}${cache.clickUrl}`) : adText;
  return compose(previous, link);
}

function sendBatch(cfg, campaignId, batch) {
  // Detached child process: the status line never waits on the network.
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
