#!/usr/bin/env node
import { readFileSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { ADSPAY_DIR, CONFIG_PATH, DEFAULT_API, readJson, writeJson, writeConfig } from "../src/config.js";
import { mergeStatusLine, isOwnCommand } from "../src/settings-merge.js";
import { isValidSolanaAddress } from "../src/wallet.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLAUDE_SETTINGS = join(homedir(), ".claude", "settings.json");

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

async function init() {
  const api = DEFAULT_API;
  console.log(`\n✶ adspay.fun — get paid for your spinner time (70% share, USDC on Solana)\n`);

  const existing = readJson(CONFIG_PATH);
  let deviceId, apiKey, readToken, foundingRank;
  if (existing?.deviceId && existing?.apiKey) {
    ({ deviceId, apiKey } = existing);
    readToken = existing.readToken;
    foundingRank = existing.foundingRank ?? null;
    console.log(`Device already registered: ${deviceId}`);
  } else {
    // Country as declared by the locale (best effort) for honest geo-targeting.
    let country;
    try {
      country = (Intl.DateTimeFormat().resolvedOptions().locale.split("-")[1] || "").toUpperCase() || undefined;
    } catch { country = undefined; }
    const res = await fetch(`${api}/v1/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surface: "terminal", country }),
    });
    if (!res.ok) {
      console.error(`Registration failed (${res.status}). Is ADSPAY_API correct? (${api})`);
      process.exit(1);
    }
    ({ deviceId, apiKey, readToken, foundingRank } = await res.json());
    console.log(`Device registered: ${deviceId}`);
    if (foundingRank && foundingRank <= 500) {
      console.log(`🏅 You are founding device #${foundingRank} — you earn 85% for life (everyone else earns 70%).`);
    }
  }

  let wallet = existing?.wallet;
  if (!wallet) {
    wallet = await ask("Solana wallet to get paid in USDC (press enter to set it later): ");
    if (wallet && !isValidSolanaAddress(wallet)) {
      console.log(`That doesn't look like a Solana address, so we haven't saved it.`);
      console.log("You still earn — set it when you have it to hand: `adspay wallet <address>`.");
      wallet = "";
    }
    if (wallet) {
      await fetch(`${api}/v1/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, apiKey, wallet }),
      }).catch(() => {});
    } else {
      console.log("No wallet yet: you still earn — set it later with `adspay wallet <address>`.");
    }
  }

  // Point Claude Code's statusLine at us, preserving whatever was there.
  const statuslinePath = join(__dirname, "..", "src", "statusline.js");
  const command = `node "${statuslinePath}"`;
  let settings = {};
  if (existsSync(CLAUDE_SETTINGS)) {
    try {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
    } catch {
      console.error(
        `⚠️  ${CLAUDE_SETTINGS} is not valid JSON — leaving it untouched so we don't make it worse.\n` +
          `Fix it (or delete it) and run again: npx adspay init`
      );
      process.exit(1);
    }
    // Back up once, before we touch the file for the first time.
    const backup = `${CLAUDE_SETTINGS}.adspay-backup`;
    if (!existsSync(backup)) copyFileSync(CLAUDE_SETTINGS, backup);
  }
  const { merged, previousCommand } = mergeStatusLine(settings, command);
  writeJson(CLAUDE_SETTINGS, merged);

  writeConfig({
    deviceId, apiKey, api,
    readToken: readToken ?? existing?.readToken ?? null,
    foundingRank: foundingRank ?? existing?.foundingRank ?? null,
    wallet: wallet || null,
    previousCommand: previousCommand ?? existing?.previousCommand ?? null,
    enabled: existing?.enabled ?? true,
    pausedUntil: existing?.pausedUntil ?? null,
  });

  console.log(`\n✅ Done. Open Claude Code and your status line starts earning.`);
  if (previousCommand) console.log(`(Your previous statusLine is chained automatically.)`);
  console.log(`Earnings dashboard: https://adspay.fun/me\n`);
}

async function setWallet(address) {
  const cfg = readJson(CONFIG_PATH);
  if (!cfg) { console.error("Run this first: npx adspay init"); process.exit(1); }
  // Catch a mistyped address now. Stored unchecked, it fails silently inside the
  // hourly payout sweep instead, for ever, showing only "failed".
  if (!isValidSolanaAddress(address)) {
    console.error(`Not a Solana address: "${address}"`);
    console.error("It should be 32-44 characters, base58 (no 0, O, I or l). Copy it from your wallet.");
    process.exit(1);
  }
  await fetch(`${cfg.api}/v1/wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: cfg.deviceId, apiKey: cfg.apiKey, wallet: address }),
  });
  writeConfig({ ...cfg, wallet: address });
  console.log(`Payout wallet set: ${address}`);
}

function requireConfig() {
  const cfg = readJson(CONFIG_PATH);
  if (!cfg) { console.error("Run this first: npx adspay init"); process.exit(1); }
  return cfg;
}

async function verify() {
  const cfg = requireConfig();
  if (!cfg.readToken) {
    console.error("This device has no readToken. Run `npx adspay init` again.");
    process.exit(1);
  }
  const { verifyReceipt } = await import("../src/receipt.js");
  const usd = (m) => `$${(m / 1_000_000).toFixed(6)}`;
  const [wk, rc] = await Promise.all([
    fetch(`${cfg.api}/.well-known/adspay-receipts.json`).then((r) => r.json()),
    fetch(`${cfg.api}/v1/receipts?token=${cfg.readToken}`).then((r) => r.json()),
  ]);
  const publicKey = wk?.receipt?.publicKey;
  const receipts = rc?.receipts ?? [];
  if (!publicKey) { console.error("Could not fetch the public key."); process.exit(1); }
  if (receipts.length === 0) {
    console.log("No signed receipts yet (they are signed within a minute of impressions being credited).");
    return;
  }
  let okCount = 0, badCount = 0, toYou = 0;
  console.log(`\nVerifying ${receipts.length} receipt(s) against the published public key:\n`);
  for (const r of receipts) {
    const res = verifyReceipt(r, publicKey);
    if (res.ok) {
      okCount++; toYou += res.body.netMicroUsd;
      console.log(`  ✓ signature OK, arithmetic OK — ${usd(res.body.netMicroUsd)} to you`);
    } else {
      badCount++;
      console.log(`  ✗ FAILED: ${res.reasons.join(", ")}`);
    }
  }
  console.log(`\n${okCount} verified, ${badCount} failed. Total credited: ${usd(toYou)}.`);
  console.log("Verified locally — no trust in the adspay server required.\n");
  if (badCount > 0) process.exit(1);
}

function setEnabled(on) {
  const cfg = requireConfig();
  writeConfig({ ...cfg, enabled: on, pausedUntil: on ? null : cfg.pausedUntil ?? null });
  if (on) {
    console.log("Ads enabled.");
    return;
  }
  console.log("Ads disabled. Turn them back on with `adspay on`.");
  // With no status line of their own, silence means an empty row — worse than
  // what Claude Code showed before we arrived. Say so rather than let them find
  // out, and point at the way out.
  if (!cfg.previousCommand) {
    console.log("Your status line will now be blank. To remove adspay entirely: `adspay uninstall`.");
  }
}

// Puts the statusLine setting back exactly how we found it and removes our local
// data. Anything that takes over a config file owes the user a clean way out.
function uninstall() {
  let settings = null;
  if (existsSync(CLAUDE_SETTINGS)) {
    try {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
    } catch {
      console.error(`⚠️  ${CLAUDE_SETTINGS} is not valid JSON — not touching it. Remove the "statusLine" entry by hand.`);
      process.exit(1);
    }
  }

  if (settings) {
    const cfg = readJson(CONFIG_PATH);
    const ours = isOwnCommand(settings.statusLine?.command);
    if (ours && cfg?.previousCommand) {
      settings.statusLine = { type: "command", command: cfg.previousCommand };
      console.log("Restored the status line you had before adspay.");
    } else if (ours) {
      delete settings.statusLine;
      console.log("Removed our status line; Claude Code goes back to its default.");
    } else {
      console.log("Your status line is not adspay's — leaving it exactly as it is.");
    }
    writeJson(CLAUDE_SETTINGS, settings);
  }

  rmSync(ADSPAY_DIR, { recursive: true, force: true });
  console.log("Deleted ~/.adspay. Any balance you already earned is still yours — see https://adspay.fun/me");
  console.log("Sorry it wasn't a fit. If something broke, we'd genuinely like to know: support@adspay.fun");
}

function pause(hoursArg) {
  const hours = Number(hoursArg);
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error("Usage: adspay pause <hours>  (e.g. `adspay pause 2`)");
    process.exit(1);
  }
  const cfg = requireConfig();
  const pausedUntil = Date.now() + hours * 3600_000;
  writeConfig({ ...cfg, pausedUntil });
  console.log(`Ads paused until ${new Date(pausedUntil).toLocaleString()}. Resume with \`adspay on\`.`);
}

/** Renders the status line exactly as Claude Code will, so you can confirm the
 *  install worked without opening the editor. Same code path, no simulation. */
async function preview() {
  requireConfig();
  const { spawnSync } = await import("node:child_process");
  const statuslinePath = join(__dirname, "..", "src", "statusline.js");
  const out = spawnSync(process.execPath, [statuslinePath], {
    input: JSON.stringify({ session_id: "preview", model: { display_name: "Claude" } }),
    encoding: "utf8",
    timeout: 10_000,
  });
  console.log("\nThis is what Claude Code shows while the agent thinks:\n");
  console.log("  \x1b[2m✻ Thinking…\x1b[0m " + (out.stdout || "").trim());
  console.log("\nEvery 5 seconds it's on screen, you earn. `adspay off` stops it.\n");
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "init") await init();
else if (cmd === "wallet" && arg) await setWallet(arg);
else if (cmd === "off") setEnabled(false);
else if (cmd === "on") setEnabled(true);
else if (cmd === "pause") pause(arg);
else if (cmd === "verify") await verify();
else if (cmd === "preview") await preview();
else if (cmd === "uninstall") uninstall();
else {
  console.log(
    "Usage:\n" +
      "  npx adspay init                set up the status line\n" +
      "  npx adspay preview             see the line as Claude Code renders it\n" +
      "  npx adspay wallet <address>    set your Solana wallet (USDC payouts)\n" +
      "  npx adspay verify              check your signed receipts (no trust in our server)\n" +
      "  npx adspay off                 turn ads off\n" +
      "  npx adspay on                  turn ads back on (clears pause)\n" +
      "  npx adspay pause <hours>       pause ads for N hours\n" +
      "  npx adspay uninstall           restore your status line and delete ~/.adspay"
  );
  process.exit(cmd ? 1 : 0);
}
