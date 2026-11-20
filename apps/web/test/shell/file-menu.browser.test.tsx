import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  draftDialog,
  editorTitle,
  openEditor,
  openEditorWorkspace,
} from "../support/item-editor-page.js";
import { chooseMenuCommand, menuPopup, menuTrigger, openMenu } from "../support/menu-bar.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const projects = [
  { name: "Billing DB", openCount: 3, overdueCount: 1, items: [{ title: "Report" }] },
  { name: "Website", openCount: 12 },
  { name: "Data warehouse", openCount: 5, overdueCount: 4 },
];

const item = (name: string) => menuPopup("file").getByRole("menuitem", { name });
const appSettingsHeading = () => page.getByRole("heading", { level: 1, name: "App Settings" });
const homeHeading = () => page.getByRole("heading", { level: 1, name: "Projects" });
const projectHeading = (name: string) => page.getByRole("heading", { level: 1, name });
const back = () => page.getByTestId("app-settings-back");
const openSettings = () => chooseMenuCommand("file", "menu-app-settings");

/** A save dialog that stays open until the test answers it. */
function stubPendingFileDialog() {
  let answer: (choice: null) => void = () => {};
  const chooseTransferFile = vi.fn(
    () =>
      new Promise<null>((resolve) => {
        answer = resolve;
      }),
  );
  vi.stubGlobal("taskTrackerDesktop", { chooseTransferFile });
  return { chooseTransferFile, cancel: () => answer(null) };
}

async function openWorkspace() {
  const app = await renderApp({ projects });
  await page.getByRole("article", { name: "Billing DB" }).click();
  await expect.element(projectHeading("Billing DB")).toBeVisible();
  return app;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FileMenu", () => {
  it("Lists Settings and app-wide JSON import and export on Home", async () => {
    await renderApp({ projects });

    await openMenu("file");

    await expect.element(item("Settings…")).toHaveAttribute("data-testid", "menu-app-settings");
    await expect
      .element(item("Import JSON…"))
      .toHaveAttribute("data-testid", "transfer-import-json");
    await expect
      .element(item("Export everything (JSON)…"))
      .toHaveAttribute("data-testid", "transfer-export-all");
    expect(menuPopup("file").getByRole("menuitem").length).toBe(3);
  });

  it("Offers only Settings away from Home", async () => {
    await openWorkspace();

    await openMenu("file");

    await expect.element(item("Settings…")).toBeVisible();
    expect(menuPopup("file").getByRole("menuitem").length).toBe(1);
  });

  it("Opens Settings from Home, and Back returns home", async () => {
    const { history } = await renderApp({ projects });

    await openSettings();
    await expect.element(appSettingsHeading()).toBeVisible();
    await expect.poll(() => document.activeElement?.tagName).toBe("MAIN");
    await back().click();

    await expect.element(homeHeading()).toBeVisible();
    expect(history.location.pathname).toBe("/");
  });

  it("Opens Settings from a workspace, and Back returns to that project", async () => {
    const { store, history } = await openWorkspace();
    const projectId = store.summaries[0]!.project.id;

    await openSettings();
    await expect.element(appSettingsHeading()).toBeVisible();
    await back().click();

    await expect.element(projectHeading("Billing DB")).toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}`);
  });

  it("Leaves Search for Settings, and Back returns to the project behind it", async () => {
    const { store, history } = await openWorkspace();
    const projectId = store.summaries[0]!.project.id;
    await chooseMenuCommand("view", "menu-search");
    await expect.element(page.getByRole("heading", { level: 1, name: "Search" })).toBeVisible();

    await openSettings();
    await expect.element(appSettingsHeading()).toBeVisible();
    await expect.element(page.getByTestId("search-back")).not.toBeInTheDocument();
    await back().click();

    await expect.element(projectHeading("Billing DB")).toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}`);
  });

  it("Leaves Trash over Home for Settings, and Back returns home", async () => {
    const { history } = await renderApp({ projects });
    await userEvent.keyboard("{Control>}{Shift>}t{/Shift}{/Control}");
    await expect.element(page.getByRole("heading", { name: "Trash", exact: true })).toBeVisible();

    await openSettings();
    await expect.element(appSettingsHeading()).toBeVisible();
    await back().click();

    await expect.element(homeHeading()).toBeVisible();
    expect(history.location.pathname).toBe("/");
  });

  it("Opens Settings from Project Settings, and Back returns to that project", async () => {
    const { store, history } = await renderApp({ projects });
    const projectId = store.summaries[0]!.project.id;
    history.push(`/projects/${projectId}/settings`);
    await expect.element(projectHeading("Project Settings")).toBeVisible();

    await openSettings();
    await expect.element(appSettingsHeading()).toBeVisible();
    await back().click();

    await expect.element(projectHeading("Billing DB")).toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}`);
  });

  it("Over App Settings, returns to it without asking when nothing changed", async () => {
    const { history } = await renderApp({ projects });
    await openSettings();
    await expect.element(appSettingsHeading()).toBeVisible();
    await userEvent.keyboard("{Control>}{Shift>}d{/Shift}{/Control}");
    await expect.element(page.getByTestId("today-page")).toBeVisible();

    await openSettings();

    await expect.element(appSettingsHeading()).toBeVisible();
    await expect.element(page.getByTestId("today-page")).not.toBeInTheDocument();
    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
    expect(history.location.pathname).toBe("/settings");
  });

  it("Asks the item editor's draft before leaving a covering page for Settings", async () => {
    const { history, projectId } = await openEditorWorkspace();
    await openEditor();
    await editorTitle().fill("Renamed in the editor");
    await userEvent.keyboard("{Control>}{Shift>}t{/Shift}{/Control}");
    await expect.element(page.getByRole("heading", { name: "Trash", exact: true })).toBeVisible();

    await openSettings();
    await expect.element(draftDialog()).toBeVisible();
    await page.getByTestId("draft-dialog-cancel").click();

    await expect.element(draftDialog()).not.toBeInTheDocument();
    await expect.element(page.getByRole("heading", { name: "Trash", exact: true })).toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}`);
    await openSettings();
    await page.getByTestId("draft-dialog-discard").click();
    await expect.element(appSettingsHeading()).toBeVisible();
  });

  it("Asks before leaving Project Settings with unsaved changes", async () => {
    const { store, history } = await renderApp({ projects });
    const projectId = store.summaries[0]!.project.id;
    history.push(`/projects/${projectId}/settings`);
    await expect.element(projectHeading("Project Settings")).toBeVisible();
    await page.getByTestId("project-yellow-override").click();

    await openSettings();
    const discard = page.getByRole("alertdialog", { name: "Discard unsaved settings?" });
    await expect.element(discard).toBeVisible();
    await page.getByTestId("confirm-dialog-cancel").click();

    await expect.element(projectHeading("Project Settings")).toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}/settings`);
  });

  it("Disables its transfer commands while a save dialog is open", async () => {
    const dialog = stubPendingFileDialog();
    await renderApp({ projects });
    await chooseMenuCommand("file", "transfer-export-all");
    await expect.poll(() => dialog.chooseTransferFile.mock.calls.length).toBe(1);

    await openMenu("file");
    await menuPopup("file").getByTestId("transfer-import-json").click({ force: true });

    for (const testId of ["transfer-import-json", "transfer-export-all"]) {
      await expect.element(page.getByTestId(testId)).toHaveAttribute("aria-disabled", "true");
    }
    await expect.element(item("Settings…")).not.toHaveAttribute("aria-disabled");
    expect(dialog.chooseTransferFile).toHaveBeenCalledTimes(1);
  });

  it("Enables its transfer commands again once the save dialog is cancelled", async () => {
    const dialog = stubPendingFileDialog();
    await renderApp({ projects });
    await chooseMenuCommand("file", "transfer-export-all");
    await expect.poll(() => dialog.chooseTransferFile.mock.calls.length).toBe(1);

    dialog.cancel();
    await openMenu("file");

    await expect
      .element(page.getByTestId("transfer-export-all"))
      .not.toHaveAttribute("aria-disabled");
  });

  it("Runs the highlighted command with Enter after opening with Alt+F", async () => {
    const dialog = stubPendingFileDialog();
    await renderApp({ projects });
    await expect.element(homeHeading()).toBeVisible();

    await userEvent.keyboard("{Alt>}f{/Alt}");
    await expect.element(item("Settings…")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(item("Import JSON…")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(item("Export everything (JSON)…")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect
      .poll(() => dialog.chooseTransferFile.mock.calls)
      .toEqual([[{ purpose: "export-json", suggestedName: "task-tracker-export.json" }]]);
  });

  it("Opens with Enter and closes with Escape, returning focus to its name", async () => {
    await renderApp({ projects });
    menuTrigger("file").element().focus();

    await userEvent.keyboard("{Enter}");
    await expect.element(menuPopup("file")).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(menuPopup("file")).not.toBeInTheDocument();
    await expect.element(menuTrigger("file")).toHaveFocus();
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed baseline of Home with the File menu open", async () => {
      await renderApp({ projects });
      await expect.element(page.getByRole("article", { name: "Data warehouse" })).toBeVisible();
      await settleTheme(theme);

      await openMenu("file");
      await expect.element(item("Export everything (JSON)…")).toBeVisible();

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`home-file-menu-${theme}`);
    });
  });
});
