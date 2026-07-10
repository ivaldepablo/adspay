/**
 * Configura statusLine en el settings.json de Claude Code sin machacar
 * el resto de claves. Si ya había un statusLine de otro comando, lo
 * devuelve para que statusline.js lo encadene (su salida + " | " + ad).
 */
export function mergeStatusLine(settings, command) {
  const prev = settings.statusLine;
  const previousCommand =
    prev && prev.type === "command" && typeof prev.command === "string" && prev.command !== command
      ? prev.command
      : null;
  return {
    merged: { ...settings, statusLine: { type: "command", command } },
    previousCommand,
  };
}
