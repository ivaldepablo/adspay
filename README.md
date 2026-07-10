# adspay — the client

[![tests](https://github.com/ivaldepablo/adspay/actions/workflows/test.yml/badge.svg)](https://github.com/ivaldepablo/adspay/actions/workflows/test.yml) [![npm](https://img.shields.io/npm/v/adspay.svg)](https://www.npmjs.com/package/adspay)

**[adspay.fun](https://adspay.fun)** pays developers for the wait time of their AI coding agents. While Claude Code is thinking, a small sponsored line rides your status line; you earn **70% of the ad revenue** it generates (**85% for life** if you're one of the first 500 devices), paid in **USDC on Solana from $1** — any country, no minimums.

This repository is the **client** — the only adspay code that runs on your machine. It is open source (MIT) on purpose: an ad network you can't inspect is an ad network you shouldn't trust. Read exactly what it does before you run it.

> The backend (auction, billing, payouts) is closed source because it moves money and holds secrets — but it can't see anything the client doesn't send, and the client is right here.

## What's in here

| Path | What it is |
| --- | --- |
| [`statusline/`](statusline) | The npm package `adspay` — the Claude Code status-line client (Node, zero dependencies). |
| [`vscode/`](vscode) | The VS Code extension source (the higher-paying editor surface). |
| [`FAQ.md`](FAQ.md) | Honest answers, including the fraud ground rules and "will this read my code?" |

## The trust guarantees — and where to verify each in this code

1. **We never patch files we don't own.** adspay integrates only through Claude Code's official `statusLine` config hook, and it *chains* your existing status line instead of overwriting it. No rewriting other extensions, no weakening anyone's CSP. → [`statusline/src/settings-merge.js`](statusline/src/settings-merge.js), and writes are atomic with a one-time backup ([`statusline/src/config.js`](statusline/src/config.js)).

2. **We can't read your code or prompts.** The only thing that ever leaves your machine is a batch of six fields — `{ deviceId, campaignId, count, tsStart, tsEnd, seq }` — and an allowlist throws if anything else is ever added, with a test that proves it. → [`statusline/src/privacy.js`](statusline/src/privacy.js) + [`privacy.test.js`](statusline/src/privacy.test.js) + [`send-batch.js`](statusline/src/send-batch.js).

3. **You can verify your earnings without trusting our server.** Every credited impression gets an **Ed25519-signed receipt**. `npx adspay verify` fetches your receipts plus our published public key and checks, locally, that the signature is ours *and* that the payout math is reproducible. → [`statusline/src/receipt.js`](statusline/src/receipt.js) + [`receipt.test.js`](statusline/src/receipt.test.js).

4. **It fails silent, never in your face.** If our API is down the status line degrades to your previous line; a circuit breaker auto-mutes for an hour after repeated failures rather than spamming errors. → [`statusline/src/breaker.js`](statusline/src/breaker.js).

## Install

```bash
npx adspay init          # registers your device and wires the status line (30s)
```

Then, whenever you like:

```bash
npx adspay wallet <address>   # set your Solana wallet (USDC payouts)
npx adspay verify             # audit your signed earning receipts locally
npx adspay off | on           # mute / unmute the ads
npx adspay pause <hours>      # pause for N hours
```

Your credentials live in `~/.adspay/config.json` (written `0600`). Watch your ledger at [adspay.fun/me](https://adspay.fun/me).

## Run the tests

The client is zero-dependency Node; the tests document the behavior above.

```bash
cd statusline && npx vitest run
```

## License

MIT — see [LICENSE](LICENSE). Only install the client from the official links on [adspay.fun/install](https://adspay.fun/install); don't trust an "adspay" package from anywhere else.
