import { expect } from "vitest";
import { page } from "vitest/browser";

/** A top-level menu of the menu bar. */
export type MenuName = "file" | "edit" | "project" | "view";

/** The menu bar's top-level menu name, such as File. */
export const menuTrigger = (menu: MenuName) => page.getByTestId(`menu-${menu}`);

/** An open top-level menu's popup. */
export const menuPopup = (menu: MenuName) => page.getByTestId(`${menu}-menu`);

/** Opens a top-level menu with a click and waits for its popup. */
export async function openMenu(menu: MenuName) {
  await menuTrigger(menu).click();
  await expect.element(menuPopup(menu)).toBeVisible();
}

/** Opens a top-level menu and clicks one of its commands by test ID. */
export async function chooseMenuCommand(menu: MenuName, command: string) {
  await openMenu(menu);
  await menuPopup(menu).getByTestId(command).click();
}

/** The menu holding each import and export command while Home is on show (§7.9). */
const TRANSFER_MENUS: Readonly<Record<string, MenuName>> = {
  "transfer-import-json": "file",
  "transfer-export-all": "file",
  "transfer-import-csv": "project",
  "transfer-export-project": "project",
  "transfer-export-project-csv": "project",
};

/** Chooses an import or export command from the File or Project menu on Home. */
export function chooseTransferCommand(command: string) {
  return chooseMenuCommand(TRANSFER_MENUS[command] ?? "project", command);
}

/** Opens the menu that holds an import or export command. */
export function openTransferMenu(command: string) {
  return openMenu(TRANSFER_MENUS[command] ?? "project");
}
