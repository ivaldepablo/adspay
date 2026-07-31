/**
 * How an ad line is fitted to the space it actually has.
 *
 * Pure, like `money.ts` and `fraud.ts`, and for the same reason: this rule decides
 * whether an impression is billable at all. Before it existed, `compose()` appended
 * the ad to the end of the user's status line and measured nothing — so when the row
 * overflowed the terminal, the paid element was the first thing the terminal cut,
 * with the impression already counted and a signed receipt attesting to it.
 *
 * Mirrored byte-for-byte in behaviour by `convex/adline.ts`, which
 * this client cannot import: the backend is private and this file is published. Both load the same vectors; a case that
 * passes on one side and fails on the other is a release blocker.
 *
 * No I/O, no clock, no randomness, and no input throws.
 */

/** Prefix that marks the line as sponsored. Two columns including its space. */
export const MARKER = "✶ ";

/** Appended when text was cut. One column. */
export const ELLIPSIS = "…";

/**
 * Below this many columns an ad conveys nothing — the advertiser is better served
 * by no impression than by three characters and an ellipsis, and we are better
 * served by not billing for it. 16 columns leaves ~13 for the text itself.
 */
export const MIN_LEGIBLE = 16;

/**
 * The budget the advertiser preview evaluates against, since it cannot know any
 * individual terminal's width or the status line a developer already had.
 *
 * 80-column terminal, minus a typical Claude Code status line (model, branch,
 * context — roughly 37 columns), minus the 3-column " | " separator. Deliberately
 * a realistic case rather than a best case: an advertiser who writes 60 characters
 * should see them cut here, because they will be cut out there.
 */
export const REFERENCE_WIDTH = 40;

const ESC = 0x1b;
const BEL = 0x07;

/**
 * Strip terminal control sequences, which occupy no columns.
 *
 * Written as a scanner rather than a regex on purpose: the patterns need literal
 * ESC and BEL bytes, and every escaping layer between here and a test fixture is
 * one more place for them to be mangled into something that still almost works.
 * This version has no escapes to get wrong.
 */
function stripControl(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text.charCodeAt(i) !== ESC) {
      out += text[i];
      i += 1;
      continue;
    }
    const next = text[i + 1];
    if (next === "]") {
      // OSC (hyperlinks): runs to BEL, or to ESC followed by a backslash
      let j = i + 2;
      while (j < text.length) {
        if (text.charCodeAt(j) === BEL) { j += 1; break; }
        if (text.charCodeAt(j) === ESC && text[j + 1] === "\\") { j += 2; break; }
        j += 1;
      }
      i = j;
      continue;
    }
    if (next === "[") {
      // CSI (colour, cursor): parameter bytes, then one final letter
      let j = i + 2;
      while (j < text.length && !/[A-Za-z]/.test(text[j])) j += 1;
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

function isZeroWidth(cp) {
  return (
    (cp >= 0x0300 && cp <= 0x036f) || // combining diacritics
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
    (cp >= 0xfe20 && cp <= 0xfe2f) ||
    cp === 0x200b || cp === 0x200c || cp === 0x200d || // ZWSP, ZWNJ, ZWJ
    (cp >= 0xe0100 && cp <= 0xe01ef)
  );
}

function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f680 && cp <= 0x1f6ff) || // transport and map symbols — 🚀 lives here
    (cp >= 0x1f7e0 && cp <= 0x1f7eb) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x1fa70 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/** Display columns a string occupies in a terminal. */
export function width(text) {
  if (typeof text !== "string" || text === "") return 0;
  let cols = 0;
  for (const ch of stripControl(text)) {
    const cp = ch.codePointAt(0);
    if (isZeroWidth(cp)) continue;
    cols += isWide(cp) ? 2 : 1;
  }
  return cols;
}

/**
 * Fit an ad line into `budget` display columns, marker included.
 *
 * Cuts on a character boundary, never inside a multi-column glyph or a combining
 * sequence, and marks the cut visibly rather than letting the terminal do it
 * silently at an arbitrary point.
 */
export function fit(text, budget) {
  const clean = typeof text === "string" ? stripControl(text) : "";
  const safeBudget = Number.isFinite(budget) ? Math.floor(budget) : 0;

  if (safeBudget < MIN_LEGIBLE || clean === "") {
    return { rendered: "", wasTruncated: false, renderable: false };
  }

  const markerCols = width(MARKER);
  if (markerCols + width(clean) <= safeBudget) {
    return { rendered: MARKER + clean, wasTruncated: false, renderable: true };
  }

  // Room for the marker and the ellipsis; the rest is text.
  const textBudget = safeBudget - markerCols - width(ELLIPSIS);
  let cols = 0;
  let cut = "";
  for (const ch of clean) {
    const cp = ch.codePointAt(0);
    const w = isZeroWidth(cp) ? 0 : isWide(cp) ? 2 : 1;
    if (cols + w > textBudget) break;
    cols += w;
    cut += ch;
  }
  // A cut that lands mid-word reads as a typo; back off to the last space when one
  // is close enough that we do not lose half the line to it.
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > 0 && cols - lastSpace <= 12) cut = cut.slice(0, lastSpace);

  return {
    rendered: MARKER + cut.trimEnd() + ELLIPSIS,
    wasTruncated: true,
    renderable: true,
  };
}
