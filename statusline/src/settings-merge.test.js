import { test, expect } from "vitest";
import { mergeStatusLine, isOwnCommand } from "./settings-merge.js";

const NPX = 'node "/Users/x/.npm/_npx/23c7186dda632a02/node_modules/adspay/src/statusline.js"';
const GLOBAL = 'node "/usr/local/lib/node_modules/adspay/src/statusline.js"';

test("recognises an adspay status line wherever the package is installed", () => {
  expect(isOwnCommand(NPX)).toBe(true);
  expect(isOwnCommand(GLOBAL)).toBe(true);
  expect(isOwnCommand("C:\\Users\\x\\AppData\\npm\\adspay\\src\\statusline.js")).toBe(true);
  expect(isOwnCommand("ccvitals")).toBe(false);
  expect(isOwnCommand("node /opt/mytool/statusline.js")).toBe(false);
  expect(isOwnCommand(undefined)).toBe(false);
});

// The bug this guards against: reinstalling through a different path used to
// make adspay chain itself, spawning a new copy on every render until the
// terminal filled with orphaned processes and the status line went blank.
test("reinstalling from a different path never chains adspay to itself", () => {
  const { previousCommand } = mergeStatusLine({ statusLine: { type: "command", command: NPX } }, GLOBAL);
  expect(previousCommand).toBeNull();
});

test("an unrelated status line is still chained", () => {
  const { merged, previousCommand } = mergeStatusLine(
    { statusLine: { type: "command", command: "ccvitals" }, model: "opus" },
    GLOBAL
  );
  expect(previousCommand).toBe("ccvitals");
  expect(merged.statusLine.command).toBe(GLOBAL);
  expect(merged.model).toBe("opus"); // other settings survive untouched
});

test("no previous status line means nothing to chain", () => {
  expect(mergeStatusLine({}, GLOBAL).previousCommand).toBeNull();
});

test("a non-command status line is not chained", () => {
  const settings = { statusLine: { type: "static", text: "hi" } };
  expect(mergeStatusLine(settings, GLOBAL).previousCommand).toBeNull();
});
