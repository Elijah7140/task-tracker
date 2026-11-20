import type { MenuItemConstructorOptions } from "electron";

/**
 * The native application menu for a packaged build, or null for none.
 *
 * Windows and Linux use the in-window menu bar only (PLAN §8). macOS routes the
 * standard text shortcuts (Cmd+C/V/X/A) and Cmd+Q through the application menu, so
 * without one they stop working. Its menu therefore offers the app menu and the
 * clipboard commands. Undo and Redo stay out: a native accelerator for Cmd+Z would
 * take the key before the renderer's history shortcuts see it. Reload and developer
 * tools stay out on every platform.
 */
export function applicationMenuTemplate(
  platform: NodeJS.Platform,
): MenuItemConstructorOptions[] | null {
  if (platform !== "darwin") {
    return null;
  }
  return [
    { role: "appMenu" },
    {
      label: "Edit",
      submenu: [{ role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }],
    },
  ];
}
