import { existsSync } from "node:fs";

/** The shell that runs {@link CLOSE_INHERITED_DESCRIPTORS}. */
export const BASH = "/bin/bash";

/**
 * Bash that closes every descriptor above stderr. Chromium can have both ends
 * of a new renderer IPC socket open while main spawns a child, so a child that
 * outlives a renderer or main must close them, or it keeps their sockets alive.
 */
export const CLOSE_INHERITED_DESCRIPTORS = `
for path in /proc/self/fd/*; do
  descriptor=\${path##*/}
  if (( descriptor > 2 )); then
    exec {descriptor}>&-
  fi
done
`;

/** Whether this OS can run children through {@link BASH} to close inherited descriptors. */
export function canCloseInheritedDescriptors() {
  return process.platform === "linux" && existsSync(BASH);
}
