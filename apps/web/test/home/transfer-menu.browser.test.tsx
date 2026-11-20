import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const projects = [
  { name: "Billing DB", openCount: 3, overdueCount: 1 },
  { name: "Website", openCount: 12 },
  { name: "Data warehouse", openCount: 5, overdueCount: 4 },
];

const trigger = () => page.getByRole("button", { name: "Import and export" });
const item = (name: string) => page.getByRole("menuitem", { name });

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TransferMenu", () => {
  it("Lists the JSON import and export commands", async () => {
    await renderApp({ projects });

    await trigger().click();

    await expect
      .element(item("Import JSON…"))
      .toHaveAttribute("data-testid", "transfer-import-json");
    await expect
      .element(item("Export everything (JSON)…"))
      .toHaveAttribute("data-testid", "transfer-export-all");
    await expect
      .element(item("Export project (JSON)…"))
      .toHaveAttribute("data-testid", "transfer-export-project");
  });

  it("Disables its commands and ignores a second request while a save dialog is open", async () => {
    const dialog = stubPendingFileDialog();
    await renderApp({ projects });
    await trigger().click();
    await page.getByTestId("transfer-export-all").click();
    await expect.poll(() => dialog.chooseTransferFile.mock.calls.length).toBe(1);

    await trigger().click();
    await page.getByTestId("transfer-export-project").click({ force: true });

    for (const testId of [
      "transfer-import-json",
      "transfer-export-all",
      "transfer-export-project",
    ]) {
      await expect.element(page.getByTestId(testId)).toHaveAttribute("aria-disabled", "true");
    }
    expect(dialog.chooseTransferFile).toHaveBeenCalledTimes(1);
    await expect.element(page.getByTestId("choice-dialog")).not.toBeInTheDocument();
  });

  it("Enables its commands again once the save dialog is cancelled", async () => {
    const dialog = stubPendingFileDialog();
    await renderApp({ projects });
    await trigger().click();
    await page.getByTestId("transfer-export-all").click();
    await expect.poll(() => dialog.chooseTransferFile.mock.calls.length).toBe(1);

    dialog.cancel();
    await trigger().click();

    await expect
      .element(page.getByTestId("transfer-export-all"))
      .not.toHaveAttribute("aria-disabled");
  });

  it("Opens with ArrowDown and runs the highlighted command with Enter", async () => {
    const dialog = stubPendingFileDialog();
    await renderApp({ projects });
    trigger().element().focus();

    await userEvent.keyboard("{ArrowDown}");
    await expect.element(item("Import JSON…")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(item("Export everything (JSON)…")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect
      .poll(() => dialog.chooseTransferFile.mock.calls)
      .toEqual([[{ purpose: "export-json", suggestedName: "task-tracker-export.json" }]]);
  });

  it("Opens with Enter and closes with Escape, returning focus to the button", async () => {
    await renderApp({ projects });
    trigger().element().focus();

    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByTestId("transfer-menu-popup")).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(page.getByTestId("transfer-menu-popup")).not.toBeInTheDocument();
    await expect.element(trigger()).toHaveFocus();
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed baseline of Home with the menu open", async () => {
      await renderApp({ projects });
      await expect.element(page.getByRole("article", { name: "Data warehouse" })).toBeVisible();
      await settleTheme(theme);

      await trigger().click();
      await expect.element(item("Export project (JSON)…")).toBeVisible();

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`home-transfer-menu-${theme}`);
    });
  });
});
