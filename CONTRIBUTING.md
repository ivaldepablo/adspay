# Contributing

Thanks for looking under the hood. This repo is the **adspay client** — the code that runs on your machine — kept open so you can audit exactly what it does.

## Run the tests

```bash
cd statusline
npx vitest run
```

The tests document the trust guarantees: no file patching, the six-field telemetry allowlist, signed-receipt verification, and the silent-fail circuit breaker.

## Reporting issues

- **Security / privacy concerns**: open an issue or email security@adspay.fun.
- **Bugs**: include your OS, Node version, and the output of `npx adspay verify` if it's payout-related.

## Scope

This repo is the client only. The backend (auction, billing, payouts) is closed source because it moves money, but it can't see anything the client doesn't send — and the client is right here.
