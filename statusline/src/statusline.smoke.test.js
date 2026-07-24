import { test, expect } from "vitest";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function runStatusline(env, stdinJson) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(__dirname, "statusline.js")], {
      env: { ...process.env, ...env },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => resolve(out));
    child.stdin.write(JSON.stringify(stdinJson));
    child.stdin.end();
  });
}

test("statusline prints the served ad and tracks state", async () => {
  // Stub ad server
  const server = createServer((req, res) => {
    if (req.url.startsWith("/v1/ad")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        campaignId: "c123", adLine: "Ramp — time is money", url: "https://ramp.com",
        clickUrl: "/r?c=c123&d=d1", ttlSeconds: 60,
      }));
    } else {
      res.writeHead(204); res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  // Temporary HOME holding a device config
  const home = mkdtempSync(join(tmpdir(), "adspay-test-"));
  mkdirSync(join(home, ".adspay"), { recursive: true });
  writeFileSync(
    join(home, ".adspay", "config.json"),
    JSON.stringify({
      deviceId: "d1", apiKey: "k".repeat(64),
      api: `http://127.0.0.1:${port}`, previousCommand: null,
    })
  );

  const out = await runStatusline({ HOME: home }, { session_id: "s1", model: { id: "claude" } });
  expect(out).toContain("Ramp — time is money");
  expect(out).toContain(`http://127.0.0.1:${port}/r?c=c123&d=d1`); // link OSC 8

  // Second run: uses the cache and persists impression state
  const out2 = await runStatusline({ HOME: home }, { session_id: "s1" });
  expect(out2).toContain("Ramp — time is money");
  const state = JSON.parse(readFileSync(join(home, ".adspay", "state.json"), "utf8"));
  expect(state.campaignId).toBe("c123");
  expect(state.lastTickAt).toBeGreaterThan(0);

  server.close();
});

test("statusline degrades gracefully without config", async () => {
  const home = mkdtempSync(join(tmpdir(), "adspay-test-"));
  const out = await runStatusline({ HOME: home }, {});
  expect(out).toContain("npx adspay init");
});
