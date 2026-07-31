import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fit, width, MARKER, ELLIPSIS, MIN_LEGIBLE } from "./adline.js";

// The same file the backend suite loads. If these two implementations ever
// disagree on a single vector, an advertiser is approving one thing and a
// developer is seeing another — so this is a release blocker, not a warning.
const here = dirname(fileURLToPath(import.meta.url));
const file = JSON.parse(
  readFileSync(
    join(here, "..", "..", "..", "specs", "001-launch-readiness", "contracts", "adline-vectors.json"),
    "utf8"
  )
);

describe("adline: the constants the vectors were written against", () => {
  test("still match the module", () => {
    expect(MARKER).toBe(file.constants.MARKER);
    expect(ELLIPSIS).toBe(file.constants.ELLIPSIS);
    expect(MIN_LEGIBLE).toBe(file.constants.MIN_LEGIBLE);
  });
});

describe("adline: shared vectors", () => {
  for (const v of file.vectors) {
    test(v.name, () => {
      const got = fit(v.text, v.budget);
      expect(got.renderable).toBe(v.renderable);
      expect(got.wasTruncated).toBe(v.wasTruncated);
      if (v.rendered !== undefined) expect(got.rendered).toBe(v.rendered);
      if (got.renderable) expect(width(got.rendered)).toBeLessThanOrEqual(Math.floor(v.budget));
      if (!got.renderable) expect(got.rendered).toBe("");
      if (got.wasTruncated) expect(got.rendered.endsWith(ELLIPSIS)).toBe(true);
    });
  }
});

describe("adline: width", () => {
  test("counts a wide glyph as two columns", () => {
    expect(width("日")).toBe(2);
  });

  test("ignores colour codes and hyperlink wrappers", () => {
    const esc = String.fromCharCode(27);
    const bel = String.fromCharCode(7);
    expect(width(esc + "[31mabc" + esc + "[0m")).toBe(3);
    expect(width(esc + "]8;;https://example.com" + bel + "abc" + esc + "]8;;" + bel)).toBe(3);
  });
});

describe("adline: fit is total", () => {
  test("never throws, whatever it is handed", () => {
    for (const n of [null, undefined, 42, {}, [], NaN, Infinity, -Infinity]) {
      expect(() => fit(n, 40)).not.toThrow();
      expect(() => fit("text", n)).not.toThrow();
    }
  });
});
