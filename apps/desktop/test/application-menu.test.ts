import { describe, expect, it } from "vitest";
import { applicationMenuTemplate } from "../src/application-menu.js";

/** Every role in a template, including those in submenus. */
function roles(template: ReturnType<typeof applicationMenuTemplate>): Array<string> {
  return (template ?? []).flatMap((item) => [
    ...(item.role === undefined ? [] : [item.role]),
    ...(Array.isArray(item.submenu) ? roles(item.submenu) : []),
  ]);
}

describe("applicationMenuTemplate", () => {
  it.each(["win32", "linux"] as const)("Installs no native menu on %s", (platform) => {
    const template = applicationMenuTemplate(platform);

    expect(template).toBeNull();
  });

  it("Gives macOS the app menu and the clipboard commands", () => {
    const template = applicationMenuTemplate("darwin");

    expect(roles(template)).toEqual(["appMenu", "cut", "copy", "paste", "selectAll"]);
  });

  it("Leaves undo, redo, reload and developer tools out of the macOS menu", () => {
    const template = applicationMenuTemplate("darwin");

    const blocked = ["undo", "redo", "reload", "forceReload", "toggleDevTools", "viewMenu"];
    expect(roles(template).filter((role) => blocked.includes(role))).toEqual([]);
  });
});
