// Chaining the status line that was already there.
//
// `adspay init` takes over the `statusLine` slot in the user's settings, so we
// are responsible for still running whatever command was configured before and
// showing its output. Claude Code renders multi-line status lines, and several
// popular ones (usage bars, cost trackers) emit two or three rows. Keeping only
// the first row silently deletes part of a stranger's status line, which is the
// worst thing this client can do to a machine it does not own.
//
// So: keep every line, and append the ad to the last one. The ad never costs
// the user an extra row, and it never removes one either.

/** Split a command's stdout into the lines it meant to render. */
export function toLines(stdout) {
  if (typeof stdout !== "string" || stdout === "") return [];
  const lines = stdout.replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/\s+$/, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Merge the previous status line's lines with our ad line. */
export function compose(previousLines, adLine) {
  const lines = Array.isArray(previousLines) ? previousLines : [];
  if (!lines.length) return adLine || "";
  if (!adLine) return lines.join("\n");
  const head = lines.slice(0, -1);
  const last = lines[lines.length - 1];
  const merged = last.trim() === "" ? adLine : `${last} | ${adLine}`;
  return [...head, merged].join("\n");
}
