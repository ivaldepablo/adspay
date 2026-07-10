#!/usr/bin/env node
import { readFileSync, existsSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { CONFIG_PATH, DEFAULT_API, readJson, writeJson, writeConfig } from "../src/config.js";
import { mergeStatusLine } from "../src/settings-merge.js";

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
    console.log(`Device ya registrado: ${deviceId}`);
  } else {
    // País declarado por el locale (best-effort) para geo-targeting honesto.
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
      console.error(`Registro falló (${res.status}). ¿ADSPAY_API correcto? (${api})`);
      process.exit(1);
    }
    ({ deviceId, apiKey, readToken, foundingRank } = await res.json());
    console.log(`Device registrado: ${deviceId}`);
    if (foundingRank && foundingRank <= 500) {
      console.log(`🏅 Eres founding device #${foundingRank} — cobras 85% de por vida (el resto cobra 70%).`);
    }
  }

  let wallet = existing?.wallet;
  if (!wallet) {
    wallet = await ask("Wallet Solana para cobrar en USDC (enter para configurarla luego): ");
    if (wallet) {
      await fetch(`${api}/v1/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, apiKey, wallet }),
      }).catch(() => {});
    } else {
      console.log("Sin wallet: acumulas earnings igualmente; configúrala con `adspay wallet <address>`.");
    }
  }

  // Configurar statusLine de Claude Code preservando lo que hubiera.
  const statuslinePath = join(__dirname, "..", "src", "statusline.js");
  const command = `node "${statuslinePath}"`;
  let settings = {};
  if (existsSync(CLAUDE_SETTINGS)) {
    try {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
    } catch {
      console.error(
        `⚠️  ${CLAUDE_SETTINGS} no es JSON válido — no lo toco para no empeorarlo.\n` +
          `Arréglalo (o bórralo) y vuelve a correr: npx adspay init`
      );
      process.exit(1);
    }
    // backup una sola vez, antes de modificarlo por primera vez
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

  console.log(`\n✅ Listo. Abre Claude Code y tu status line empieza a ganar.`);
  if (previousCommand) console.log(`(Tu statusLine anterior se encadena automáticamente.)`);
  console.log(`Panel de earnings: https://adspay.fun/me\n`);
}

async function setWallet(address) {
  const cfg = readJson(CONFIG_PATH);
  if (!cfg) { console.error("Ejecuta primero: npx adspay init"); process.exit(1); }
  await fetch(`${cfg.api}/v1/wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: cfg.deviceId, apiKey: cfg.apiKey, wallet: address }),
  });
  writeConfig({ ...cfg, wallet: address });
  console.log(`Wallet configurada: ${address}`);
}

function requireConfig() {
  const cfg = readJson(CONFIG_PATH);
  if (!cfg) { console.error("Ejecuta primero: npx adspay init"); process.exit(1); }
  return cfg;
}

async function verify() {
  const cfg = requireConfig();
  if (!cfg.readToken) {
    console.error("Este device no tiene readToken. Vuelve a correr `npx adspay init`.");
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
  if (!publicKey) { console.error("No pude obtener la clave pública."); process.exit(1); }
  if (receipts.length === 0) {
    console.log("Aún no hay recibos firmados (se firman al minuto de acreditar impresiones).");
    return;
  }
  let okCount = 0, badCount = 0, toYou = 0;
  console.log(`\nVerificando ${receipts.length} recibo(s) contra la clave pública publicada:\n`);
  for (const r of receipts) {
    const res = verifyReceipt(r, publicKey);
    if (res.ok) {
      okCount++; toYou += res.body.netMicroUsd;
      console.log(`  ✓ firma OK, aritmética OK — ${usd(res.body.netMicroUsd)} para ti`);
    } else {
      badCount++;
      console.log(`  ✗ FALLÓ: ${res.reasons.join(", ")}`);
    }
  }
  console.log(`\n${okCount} verificado(s), ${badCount} fallido(s). Total acreditado: ${usd(toYou)}.`);
  console.log("Verificado localmente, sin confiar en el servidor de adspay.\n");
  if (badCount > 0) process.exit(1);
}

function setEnabled(on) {
  const cfg = requireConfig();
  writeConfig({ ...cfg, enabled: on, pausedUntil: on ? null : cfg.pausedUntil ?? null });
  console.log(on ? "Ads activados." : "Ads desactivados. Reactiva con `adspay on`.");
}

function pause(hoursArg) {
  const hours = Number(hoursArg);
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error("Uso: adspay pause <horas>  (p. ej. `adspay pause 2`)");
    process.exit(1);
  }
  const cfg = requireConfig();
  const pausedUntil = Date.now() + hours * 3600_000;
  writeConfig({ ...cfg, pausedUntil });
  console.log(`Ads en pausa hasta ${new Date(pausedUntil).toLocaleString()}. Reactiva con \`adspay on\`.`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "init") await init();
else if (cmd === "wallet" && arg) await setWallet(arg);
else if (cmd === "off") setEnabled(false);
else if (cmd === "on") setEnabled(true);
else if (cmd === "pause") pause(arg);
else if (cmd === "verify") await verify();
else {
  console.log(
    "Uso:\n" +
      "  npx adspay init                configura el statusline\n" +
      "  npx adspay wallet <address>    fija tu wallet Solana (USDC)\n" +
      "  npx adspay verify              verifica tus recibos firmados (sin confiar en el server)\n" +
      "  npx adspay off                 desactiva los ads\n" +
      "  npx adspay on                  reactiva los ads (quita pausa)\n" +
      "  npx adspay pause <horas>       pausa los ads N horas"
  );
  process.exit(cmd ? 1 : 0);
}
