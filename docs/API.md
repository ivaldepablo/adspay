# adspay read-only API

Public, stable, read-only endpoints so you can build your own dashboards, menu-bar apps or
verifiers without handing any tool your write credentials.

Base URL: `https://dazzling-dachshund-384.convex.site`

## Auth

Everything below uses your **read token** — printed by `npx adspay init` and stored in
`~/.adspay/config.json` as `readToken`. It can *read* your stats; it can never submit
impressions, change your wallet or move funds. Pass it as `?token=` or header
`X-Adspay-Read-Token`.

## Endpoints

### `GET /v1/portfolio?token=<readToken>`

Your device's money at a glance.

```json
{
  "deviceId": "…", "surface": "terminal", "status": "active",
  "lifetimeMicroUsd": 123400, "todayMicroUsd": 5600,
  "pendingMicroUsd": 4000, "payableMicroUsd": 1600, "paidMicroUsd": 117800,
  "foundingRank": 41, "trustScore": 17.3
}
```

All money fields are **micro-USD** (1 USDC = 1,000,000). `pending` = inside the 24h
anti-fraud hold; `payable` = will be swept to your wallet on the next hourly payout run.

### `GET /v1/earnings?token=<readToken>`

Caps and your current position against them.

```json
{
  "dailyCapMicroUsd": 5000000, "dailyUsedMicroUsd": 120000,
  "hourlyImpressionsCap": 720, "hourlyImpressionsUsed": 96,
  "devShareBps": 8500
}
```

### `GET /v1/receipts?token=<readToken>`

Your Ed25519-signed earning receipts (what `npx adspay verify` consumes).

```json
{ "receipts": [ { "bodyJson": "{…}", "signature": "base64url…", "keyId": "k1", "createdAt": 1783600000000 } ] }
```

Verify each one against the published key — signature **and** arithmetic:

### `GET /.well-known/adspay-receipts.json` (no auth)

```json
{ "receipt": { "keyId": "k1", "alg": "ed25519", "format": "spki-der-base64", "publicKey": "MCow…" } }
```

The reference verifier is ~60 lines: [`statusline/src/receipt.js`](../statusline/src/receipt.js).

### `GET /v1/ad?surface=terminal|extension` (no auth)

The ad that would serve right now (200 with JSON, or 204 when no fill). Useful for
inspecting what your machine would show — hitting this endpoint does **not** credit
impressions.

## Rules of the road

- Poll politely (≥30s). The official client caches ads for 60s.
- Fields may be **added** over time; never removed or renamed without a version bump.
- Found something broken? Open an issue.
