# Changelog

## 0.2.3 — 2026-07-25

- **Two editor windows no longer lose your impressions.** Both shared
  `~/.adspay/state.json`, read the same sequence number and sent it; the server
  accepted one and rejected the other as a replay, and those impressions were
  gone. The counter now runs under a lock.
- **A mistyped payout wallet is refused up front.** It used to be stored as typed,
  then fail inside the hourly payout for ever, showing only "failed".
- `adspay wallet` and `adspay init` both check the address before saving it.

## 0.2.2 — 2026-07-25

- **A failed send no longer burns your device.** Impressions used to go straight
  back into the queue, trip the batch threshold on the very next render, and get
  re-sent several times a second. The server counted each stale batch as a
  rejection, and a device's TrustRank could fall below the earning floor about a
  minute after one network blip — permanently, with nothing to show its owner.
  Sends now back off exponentially, stop after 8 attempts, and are never retried
  for a reason that cannot succeed.
- **Impressions trimmed by a cap are kept.** The server now reports how many of a
  batch it paid for, and the rest waits for the next hour instead of being thrown
  away.

## 0.2.1 — 2026-07-25

Three ways this client could damage a status line it did not own. All fixed, all
covered by tests.

- **Multi-line status lines are preserved.** Chaining kept only the first line of
  the command it replaced, silently deleting the rest. It now keeps every line and
  appends the ad to the last one, so the ad never costs — or removes — a row.
- **Reinstalling no longer chains adspay to itself.** The installed command embeds
  an absolute path, so installing over an npx copy made this client spawn itself on
  every render until the machine filled with orphaned processes and the status line
  went blank. adspay commands are now recognised wherever the package lives.
- **Slow status lines survive.** The 800 ms cap was tighter than the budget Claude
  Code gives, so status lines that fetch quota over the network were dropped
  entirely. Raised to 2 s, with the last known output reused for up to 5 minutes if
  the command starts failing.
- **`adspay uninstall`** restores the status line you had before and deletes
  `~/.adspay`. Turning ads off with no previous status line now warns you the row
  will be blank instead of letting you discover it.
- A closed output pipe no longer prints a Node stack trace into your terminal.
- Windows: the previous command runs through the platform shell rather than `sh`.
- All code comments and error messages are in English.

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
