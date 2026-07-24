import { test, expect } from "vitest";
import { toLines, compose } from "./chain.js";

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
