# adspay

Get paid in **USDC** for the wait time of your AI coding agent. While Claude Code is thinking, a small sponsored line rides your status line; you earn **70% of the ad revenue** it generates (**85% for life** if you're one of the first 500 devices), paid on **Solana from $1** — any country, no minimums.

```bash
npx adspay init
```

That's it — it registers your device and wires Claude Code's official status line (chaining your existing one, never overwriting it). Takes about 30 seconds.

## Commands

```bash
npx adspay init             # set up the status line
npx adspay wallet <addr>    # set your Solana wallet for USDC payouts
npx adspay verify           # audit your signed earning receipts locally
npx adspay off | on         # mute / unmute the ads
npx adspay pause <hours>    # pause for N hours
```

## Why you can trust it

This client is **open source** ([github.com/ivaldepablo/adspay](https://github.com/ivaldepablo/adspay)) — it's the only adspay code that runs on your machine, so it's the code that should be auditable.

- **We never patch files we don't own.** Integration is only through Claude Code's official `statusLine` hook; your existing status line is preserved and chained.
- **We can't read your code or prompts.** The only thing that leaves your machine is a six-field batch — `{ deviceId, campaignId, count, tsStart, tsEnd, seq }` — enforced by an allowlist with a test.
- **You can verify your earnings without trusting our server.** Every credited impression gets an Ed25519-signed receipt; `npx adspay verify` checks the signature and re-runs the payout math locally.
- **Fails silent.** If the API is down, the status line degrades to your previous one — never an error in your face.

Zero runtime dependencies. Watch your ledger at [adspay.fun/me](https://adspay.fun/me).

## License

MIT. Only install from the official links on [adspay.fun/install](https://adspay.fun/install).
