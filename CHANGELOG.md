# Changelog

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
