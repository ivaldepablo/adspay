# Changelog

## 0.2.0 — 2026-07-19

- New `npx adspay preview` command: renders the status line exactly as Claude Code will,
  so you can confirm the install worked without opening the editor.
- All CLI output is now in English.
- No changes to the wire protocol: the client still sends only
  `{ deviceId, campaignId, count, tsStart, tsEnd, seq }`.

## 0.1.0 — 2026-07-10

Initial public release.

- npm package `adspay`: status-line client for Claude Code (zero dependencies).
- Ed25519-signed earning receipts + `npx adspay verify` (signature + payout arithmetic,
  verified locally against the published key).
- Founding devices: the first 500 lock in an 85% revenue share for life (70% standard).
- USDC payouts on Solana from $1, swept hourly.
- Privacy allowlist: the client can only ever send
  `{ deviceId, campaignId, count, tsStart, tsEnd, seq }` — enforced with a test.
- Circuit breaker: auto-mutes for 1h if the API keeps failing; your own status line is
  chained, never replaced.
- Controls: `adspay off | on | pause <hours> | wallet <address> | verify`.
