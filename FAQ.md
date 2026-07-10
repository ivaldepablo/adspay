# adspay FAQ

Honest answers to the 12 questions the AI-spinner-ad niche keeps asking. Where a claim
is verifiable in code, the file is named so you can check it yourself. The client is
open source — read it, don't trust us.

Short version up front: **adspay is an ad network. An ad network you can't verify is
spyware with extra steps, so everything below is written to be checkable.** We pay 70%
of every dollar in USDC on Solana, from $1, to any country. It's found money for time
your terminal already spends spinning — not a paycheck.

---

### 1. Is this adware? Does it patch Claude Code like kickbacks did?

No. We do not patch, wrap, or rewrite any file that belongs to Claude Code, your editor,
or any other tool. The client installs itself the sanctioned way: it writes a
`statusLine` entry into `~/.claude/settings.json` — the official Claude Code extension
point for a custom status line — and nothing else.

Two things make this safe and checkable:

- **We preserve your config.** `settings-merge.js` does a shallow merge that keeps every
  other key intact. If you already had a `statusLine` command, we *chain* it: your line
  runs first, then ` | ` then the ad. There's a unit test for exactly this
  (`clients/statusline/src/logic.test.js` — "preserves other keys, chains the previous
  command").
- **We write atomically.** `config.js#writeJson` writes to a temp file and `rename()`s it
  into place, and we make a one-time `settings.json.adspay-backup` before the first edit.
  kickbacks' non-atomic writes corrupted people's settings (their issue #148); ours can't.

kickbacks got pulled from the VS Code Marketplace because it patched Claude Code binaries
on disk and relaxed the CSP. We do neither. That's why we can only live on surfaces the
platform actually sanctions — which is also our best defense against getting killed.

### 2. Will you read my code? What actually leaves my machine?

Your prompts and your code never leave your machine. Here is the **complete** list of
data the client sends, endpoint by endpoint (all in `clients/statusline/`):

- **`POST /v1/register`** — body: `{ surface: "terminal" }`. That's it. You get back a
  random `deviceId` and `apiKey`. No email required, no GitHub login.
- **`GET /v1/ad?surface=terminal&d=<deviceId>`** — to fetch the ad to display.
- **`POST /v1/batch`** — the only "telemetry". Body is exactly:
  `{ deviceId, campaignId, count, tsStart, tsEnd, seq }`.
  Translation: *"device X saw campaign Y `count` times, between these two timestamps,
  batch number `seq`."* Signed with HMAC-SHA256.
- **`POST /v1/wallet`** — `{ deviceId, apiKey, wallet }`, only when you set a payout
  address you typed yourself.

That's the entire wire protocol. No prompt text. No file contents. No file paths. No repo
name. No working directory. Claude Code pipes a session JSON blob to the status line on
stdin — we use it **only** to run your previous status-line command locally, and we never
transmit it. You can confirm all of this by reading `statusline.js` and `send-batch.js`;
they're ~100 lines each.

### 3. Isn't this just cents per hour?

Mostly, yes, and we won't pretend otherwise. kickbacks' own numbers worked out to about
$5.85 per developer over the product's life. Ad impressions on a status line are worth
fractions of a cent. Treat adspay as **found money for time you were burning anyway**, not
income. Our earnings calculator shows a realistic range and never promises a payday. If a
competitor is promising you'll get rich watching a spinner, that's the tell.

### 4. Do the payouts actually arrive, or do they just "accumulate"?

Payouts are real USDC transfers on Solana, and the minimum is **$1**
(`payouts.ts#MIN_PAYOUT_MICRO_USD = 1_000_000` micro-USD). An hourly cron sweeps every
active device with a wallet and a payable balance ≥ $1 and sends it — you don't have to
beg. Every payout is recorded with its on-chain **transaction signature**
(`payouts.ts#confirm`), which shows up in your history. That signature *is* your receipt:
paste it into any Solana explorer (Solscan, etc.) and you can see the transfer, the
amount, and the destination wallet. There is no "trust us, it's coming" — there's a
transaction hash or there isn't.

On top of the on-chain signature, **every credited impression gets an Ed25519-signed
receipt** the moment it's booked. Run `npx adspay verify` and the CLI pulls your receipts
plus our published public key (`/.well-known/adspay-receipts.json`) and checks two things
locally, without trusting our server: (1) the signature is ours, and (2) the payout math is
reproducible — it re-runs the public formula and confirms the numbers add up. If we ever
signed an honest signature over a dishonest amount, `verify` would flag `bad_arithmetic`.
"Privacy and fairness are a test, not a promise."

We're being straight about one thing: this is the part we most want to prove in public, so
at launch we're posting a real on-chain payout you can click through and verify.

### 5. Do earnings decay as I approach the payout threshold?

They can't, structurally. This was the single most damaging complaint about kickbacks
("made $5.40 the first day for 514 events, then $0.43 over 1587 events"). Here's why it
can't happen with us:

- Your share is computed **per batch, at ingest, from that batch's gross only**:
  `devShare(gross, shareBps) = floor(gross * shareBps / 10000)` in `convex/money.ts`, with
  `PAYOUT_FORMULA_VERSION` stamped on every ledger row and every signed receipt. Standard
  devices earn 7000 bps (70%); the first 500 **founding devices** earn 8500 bps (85%) for
  life. There's a hostile test (`ingest.test.ts`) that credits the same amount whether your
  balance is $0 or one cent under the threshold.
- That function **never receives your balance or the payout threshold.** It literally
  cannot see how close you are to cashing out, so it cannot throttle you as you approach
  it. Read `ingest.ts#submitBatch`: the credited amount depends on the campaign bid and
  the accepted count — nothing else about you.

The formula is public and versioned. If we ever changed the 70%, it would be a visible
diff in an open-source file, not a silent server-side dial.

### 6. What about the anti-fraud caps — will they quietly eat my earnings?

The caps exist to stop bots farming impressions (which protects advertiser money, which is
what keeps payouts funded), and they're all fixed, documented constants, not a mysterious
"quality score":

- Physical rate cap: a batch is rejected if `count` exceeds wall-clock elapsed time ÷ 5s
  (`fraud.ts` — one impression = 5s of spinner, so ~720/hour max).
- Daily cap: $5/device (`DAILY_EARNINGS_CAP_MICRO_USD`).
- Anti-replay: a monotonic `seq` per device; replayed batches are dropped, not double-paid.
- 24h maturation hold before earnings become payable, so obvious fraud can be caught first.

If you're a real human using Claude Code, none of these will ever touch you. They're
sized well above normal usage.

### 7. Are there real advertisers, or is it all house ads?

This is the honest weak spot of the *entire* category right now, us included: real
advertiser demand is the hard part, and a network with no advertisers pays you house ads
worth ~nothing. We'd rather say that plainly than fake a full inventory. Our commitment is
to build real demand before we push hard on the developer side, and to never inflate what
a device is actually earning. If the ad slot is empty, the client just shows a quiet
`✶ adspay` and books you nothing.

### 8. Anthropic (or OpenAI) will just kill this whole category.

Real risk, and we won't wave it away — Anthropic literally ran a Super Bowl ad saying
"Ads are coming to AI. But not to Claude," and the kickbacks Marketplace ban was the first
shot. Our defense is deliberately boring: we only use **sanctioned surfaces** (`statusLine`,
a normal VS Code extension). We don't patch binaries, don't relax any CSP, and don't run a
silent auto-updater. That doesn't make us immune, but it means we're not doing the specific
things that got the last guy banned. If the platform's terms change, we'll comply or shut
the surface off — we're not going to fight Anthropic over your terminal.

### 9. This is dystopian — selling human attention in a terminal.

Fair, and we're not going to insult you by pretending it's a movement. It's ads. Someone
built a market for the most-watched line on earth and the terminal's turn came. Our take:
if it's going to exist, it should be honest, non-invasive (the ad stays in the status
line — it never rides along with the model's actual output), pay a fair share, and be easy
to uninstall (`rm` the `statusLine` line, or restore the `.adspay-backup`). If that's still
not for you, that's a completely reasonable place to land.

### 10. Advertisers had to pay $7 just to see the product — is the sell side also a mess?

The advertiser side is prepaid and self-serve: buy impression blocks (minimum bid
$0.50/1000), your bid orders the queue, top bid serves first. No "pay to view the demo"
wall. It's a normal prepaid ad console, priced in whole cents.

### 11. Is support going to ghost me like kickbacks did?

"Zero transparency, zero respect" was the recurring kickbacks complaint, and honestly it's
the easiest bar in this category to clear — nobody is winning on support. The client is
open source so you can self-diagnose, the wire protocol is small enough to audit in an
afternoon, and we answer. That's the whole promise; judge us on whether we keep it.

### 12. Terminal ads already died once (npm, 2019). Why won't this?

They did — npm's terminal ads got killed by backlash within a week. That's the real ceiling
for this whole category: **the moment it's annoying, it's over.** We take that as a design
constraint, not a footnote. One line, in the status bar, cached for 60s, never in the
model's output, one command to remove. If we ever cross the annoyance line, we deserve the
same fate npm's did.

---

**Uninstall:** delete the `statusLine` entry from `~/.claude/settings.json` (or restore
`~/.claude/settings.json.adspay-backup`) and `rm -rf ~/.adspay`. Nothing else was ever
touched.
