// Recognises a command that is an adspay status line, whichever copy of the
// package it points at. The command we install embeds an absolute path, and that
// path changes between an npx cache and a global install — so comparing strings
// is not enough. Without this, reinstalling would make adspay chain *itself*:
// every render would spawn another copy, forever.
const OWN_COMMAND = /adspay[^"']*[\\/]statusline\.js/i;

export function isOwnCommand(command) {
  return typeof command === "string" && OWN_COMMAND.test(command);
}

/**
 * Points Claude Code's statusLine at us without clobbering any other key in
 * settings.json. If another command already held the slot, it is returned so
 * statusline.js can keep running it and chain its output ahead of the ad.
 */
export function mergeStatusLine(settings, command) {
  const prev = settings.statusLine;
  const isChainable =
    prev &&
    prev.type === "command" &&
    typeof prev.command === "string" &&
    prev.command !== command &&
    !isOwnCommand(prev.command);
  return {
    merged: { ...settings, statusLine: { type: "command", command } },
    previousCommand: isChainable ? prev.command : null,
  };
}
