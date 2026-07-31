import { test, expect } from "vitest";
import { toLines, compose, fitAd } from "./chain.js";

test("toLines drops the trailing newline but keeps interior blank lines", () => {
  expect(toLines("one\n")).toEqual(["one"]);
  expect(toLines("one\n\ntwo\n\n")).toEqual(["one", "", "two"]);
  expect(toLines("")).toEqual([]);
  expect(toLines(undefined)).toEqual([]);
});

test("toLines normalises CRLF so Windows status lines do not gain blank rows", () => {
  expect(toLines("one\r\ntwo\r\n")).toEqual(["one", "two"]);
});

// The bug this guards against: a two-row status line (usage on top, git below)
// used to lose its second row entirely once adspay took over the slot.
test("compose keeps every line of a multi-line status line", () => {
  const prev = toLines("Usage: 42% | Context: 18k\nGit: main | Cost: $1.23\n");
  expect(compose(prev, "✶ ad")).toBe(
    "Usage: 42% | Context: 18k\nGit: main | Cost: $1.23 | ✶ ad"
  );
});

test("compose appends to the last line so the ad never costs an extra row", () => {
  expect(compose(["a", "b", "c"], "✶ ad").split("\n")).toHaveLength(3);
});

test("compose renders the ad alone when there was no previous status line", () => {
  expect(compose([], "✶ ad")).toBe("✶ ad");
});

test("compose renders the previous status line untouched when the ad is silent", () => {
  expect(compose(["a", "b"], "")).toBe("a\nb");
  expect(compose(["a", "b"], null)).toBe("a\nb");
});

test("compose does not leave a dangling separator on a blank last line", () => {
  expect(compose(["a", ""], "✶ ad")).toBe("a\n✶ ad");
});

test("compose returns nothing when there is neither a previous line nor an ad", () => {
  expect(compose([], "")).toBe("");
});

// ---------------------------------------------------------------------------
// fitAd: how much of the row is actually ours.
//
// Before this existed, compose() measured nothing. The ad went on the end of the
// user's status line and the terminal cut it — with the impression already
// counted and a signed receipt attesting that it had been shown.
// ---------------------------------------------------------------------------

test("fitAd leaves a short ad untouched when the row has room", () => {
  const got = fitAd(["Git: main"], "Try Linear now", 80);
  expect(got.renderable).toBe(true);
  expect(got.wasTruncated).toBe(false);
  expect(got.rendered).toBe("✶ Try Linear now");
});

test("fitAd truncates against what the previous status line already occupies", () => {
  const long = "Usage: 42% | Context: 18k | Git: main | Cost: $1.23 | Model: opus";
  const got = fitAd([long], "Try Linear — issue tracking built for speed", 80);
  expect(got.renderable).toBe(false); // 65 + 3 separator leaves 12 of 80: not legible
});

test("fitAd measures the last line only, since that is where the ad lands", () => {
  const wide = fitAd(["a".repeat(70), "short"], "Try Linear now", 80);
  expect(wide.renderable).toBe(true);
  expect(wide.wasTruncated).toBe(false);
});

test("fitAd gives the ad the whole row when there was no status line before", () => {
  const got = fitAd([], "Try Linear now", 80);
  expect(got.rendered).toBe("✶ Try Linear now");
});

test("fitAd charges no separator against a blank last line", () => {
  const withBlank = fitAd(["header", ""], "Try Linear now", 20);
  const withoutBlank = fitAd([], "Try Linear now", 20);
  expect(withBlank).toEqual(withoutBlank);
});

test("fitAd refuses to render rather than squeeze into nothing", () => {
  const got = fitAd(["x".repeat(70)], "Try Linear now", 80);
  expect(got.renderable).toBe(false);
  expect(got.rendered).toBe("");
});

// The invariant that matters most in this file: whatever fitAd decides, the
// user's own status line is returned byte-for-byte unchanged.
test("compose never alters the status line it was given, at any width", () => {
  const prev = ["Usage: 42% | Context: 18k", "Git: main | Cost: $1.23"];
  for (const width of [20, 40, 80, 200]) {
    const got = fitAd(prev, "Try Linear — issue tracking built for speed", width);
    const out = compose(prev, got.renderable ? got.rendered : "");
    const rows = out.split("\n");
    expect(rows[0]).toBe(prev[0]);
    expect(rows[rows.length - 1].startsWith(prev[1])).toBe(true);
  }
});
