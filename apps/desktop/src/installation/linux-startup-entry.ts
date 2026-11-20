import { mkdir, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { StartupEntry } from "./startup-registration.js";

/** The autostart file name. */
export const AUTOSTART_FILE_NAME = "task-tracker.desktop";

/**
 * `XDG_CONFIG_HOME` when it holds an absolute path, as the XDG base directory
 * specification requires; otherwise `~/.config`.
 */
export function resolveConfigDirectory(xdgConfigHome: string | undefined, homeDirectory: string) {
  return xdgConfigHome !== undefined && xdgConfigHome !== "" && isAbsolute(xdgConfigHome)
    ? xdgConfigHome
    : join(homeDirectory, ".config");
}

const EXEC_ESCAPES: Readonly<Record<string, string>> = {
  '"': '\\"',
  "`": "\\`",
  $: "\\$",
  "\\": "\\\\",
  "%": "%%",
};

/**
 * Quotes a path for the `Exec` key. Inside quotes, the desktop entry specification
 * escapes `"`, `` ` ``, `$` and backslash with a backslash, and doubles `%`.
 */
function quoteExecArgument(path: string) {
  return `"${path.replaceAll(/["`$\\%]/g, (character) => EXEC_ESCAPES[character] ?? character)}"`;
}

/** A launcher unescapes the entry's string value before it parses the Exec quotes. */
function escapeStringValue(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
}

function desktopEntryText(executablePath: string) {
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Task Tracker",
    `Exec=${escapeStringValue(quoteExecArgument(executablePath))}`,
    "Terminal=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}

/**
 * Starts the AppImage at sign-in through an XDG autostart file,
 * `$XDG_CONFIG_HOME/autostart/task-tracker.desktop` (§7.13). Writing is idempotent.
 */
export function linuxStartupEntry(
  configDirectory: string,
  executablePath: string,
): StartupEntry & { readonly filePath: string } {
  const filePath = join(configDirectory, "autostart", AUTOSTART_FILE_NAME);
  return {
    filePath,
    write: async () => {
      await mkdir(join(configDirectory, "autostart"), { recursive: true });
      await writeFile(filePath, desktopEntryText(executablePath));
    },
    remove: () => rm(filePath, { force: true }),
  };
}
