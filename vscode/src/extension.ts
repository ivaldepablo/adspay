import * as vscode from "vscode";
import { createHmac } from "node:crypto";
import { CounterState, initialState, tick, drainBatch } from "./counter";

const DEFAULT_API = process.env.ADSPAY_API || "https://dazzling-dachshund-384.convex.site";
const AD_TTL_MS = 60_000;
const TICK_MS = 1000;

type Ad = { campaignId: string; adLine: string; url: string; clickUrl: string };
type DeviceConfig = { deviceId: string; apiKey: string; api: string };

let statusItem: vscode.StatusBarItem;
let currentAd: Ad | null = null;
let counter: CounterState;
let config: DeviceConfig | null = null;

export async function activate(context: vscode.ExtensionContext) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
  statusItem.command = "adspay.openAd";
  context.subscriptions.push(statusItem);

  context.subscriptions.push(
    vscode.commands.registerCommand("adspay.openAd", () => {
      if (currentAd && config) {
        vscode.env.openExternal(vscode.Uri.parse(`${config.api}${currentAd.clickUrl}`));
      }
    })
  );

  config = await ensureDevice(context);
  if (!config) return;

  counter = context.globalState.get<CounterState>("adspay.counter") ?? initialState(Date.now());

  await refreshAd();
  const adTimer = setInterval(refreshAd, AD_TTL_MS);
  const tickTimer = setInterval(() => onTick(context), TICK_MS);
  context.subscriptions.push({ dispose: () => clearInterval(adTimer) });
  context.subscriptions.push({ dispose: () => clearInterval(tickTimer) });
}

async function ensureDevice(context: vscode.ExtensionContext): Promise<DeviceConfig | null> {
  const stored = context.globalState.get<DeviceConfig>("adspay.device");
  if (stored?.deviceId) return stored;
  try {
    const res = await fetch(`${DEFAULT_API}/v1/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surface: "extension" }),
    });
    if (!res.ok) return null;
    const { deviceId, apiKey } = (await res.json()) as { deviceId: string; apiKey: string };
    const cfg = { deviceId, apiKey, api: DEFAULT_API };
    await context.globalState.update("adspay.device", cfg);
    vscode.window.showInformationMessage(
      "adspay: device registrado. Configura tu wallet Solana en https://adspay.fun/me para cobrar."
    );
    return cfg;
  } catch {
    return null;
  }
}

async function refreshAd() {
  if (!config) return;
  try {
    const res = await fetch(`${config.api}/v1/ad?surface=extension&d=${config.deviceId}`);
    if (res.status !== 200) {
      currentAd = null;
      statusItem.hide();
      return;
    }
    const ad = (await res.json()) as Ad;
    if (counter.campaignId && counter.campaignId !== ad.campaignId) {
      const forced = drainBatch(counter, Date.now(), true);
      if (forced.batch && counter.campaignId) void sendBatch(counter.campaignId, forced.batch);
      counter = forced.state;
    }
    counter.campaignId = ad.campaignId;
    currentAd = ad;
    statusItem.text = `✶ ${ad.adLine}`;
    statusItem.tooltip = `${ad.adLine}\n${ad.url}\n\nSponsored via adspay.fun — click to open`;
    statusItem.show();
  } catch {
    // sin red: mantenemos el último ad
  }
}

function onTick(context: vscode.ExtensionContext) {
  if (!currentAd || !config) return;
  if (!vscode.window.state.focused) {
    counter.lastTickAt = Date.now(); // ventana sin foco: no acumula
    return;
  }
  counter = tick(counter, Date.now());
  const { state, batch } = drainBatch(counter, Date.now());
  counter = state;
  void context.globalState.update("adspay.counter", counter);
  if (batch && counter.campaignId) void sendBatch(counter.campaignId, batch);
}

async function sendBatch(campaignId: string, batch: { count: number; tsStart: number; tsEnd: number; seq: number }) {
  if (!config) return;
  const body = { deviceId: config.deviceId, campaignId, ...batch };
  const message = `${body.deviceId}.${body.campaignId}.${body.count}.${body.tsStart}.${body.tsEnd}.${body.seq}`;
  const signature = createHmac("sha256", config.apiKey).update(message).digest("hex");
  try {
    await fetch(`${config.api}/v1/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Signature": signature },
      body: JSON.stringify(body),
    });
  } catch {
    counter.pending += batch.count; // reencola en fallo de red
  }
}

export function deactivate() {}
