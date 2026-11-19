import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { confirm, notify, prompt } from "../../src/state/dialog-store.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const deleteProject = {
  title: "Delete project",
  message: "Delete Billing DB and its contents?",
  confirmLabel: "Delete",
  tone: "danger",
} as const;

const renameProject = {
  title: "Rename project",
  label: "Project name",
  initialValue: "Billing DB",
  confirmLabel: "Rename",
};

describe("DialogHost", () => {
  it("Confirms with Enter because focus starts on the confirm button", async () => {
    await renderApp();
    const answer = confirm(deleteProject);
    await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();

    await userEvent.keyboard("{Enter}");

    await expect(answer).resolves.toBe(true);
  });

  it("Answers no when Escape closes a confirmation", async () => {
    await renderApp();
    const answer = confirm(deleteProject);
    await expect.element(page.getByRole("alertdialog", { name: "Delete project" })).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect(answer).resolves.toBe(false);
  });

  it("Answers no when Cancel is clicked", async () => {
    await renderApp();
    const answer = confirm(deleteProject);

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(answer).resolves.toBe(false);
  });

  it("Replaces the selected initial text with what the user types", async () => {
    await renderApp();
    const answer = prompt(renameProject);
    await expect.element(page.getByRole("textbox", { name: "Project name" })).toHaveFocus();

    await userEvent.keyboard("Accounting{Enter}");

    await expect(answer).resolves.toBe("Accounting");
  });

  it("Resolves a prompt with null when Escape cancels it", async () => {
    await renderApp();
    const answer = prompt(renameProject);
    await expect.element(page.getByRole("textbox", { name: "Project name" })).toHaveFocus();

    await userEvent.keyboard("Accounting{Escape}");

    await expect(answer).resolves.toBeNull();
  });

  it("Shows queued dialogs one after another", async () => {
    await renderApp();
    const first = notify({ title: "First notice", message: "One" });
    void notify({ title: "Second notice", message: "Two" });

    await page.getByRole("button", { name: "OK" }).click();

    await expect(first).resolves.toBeUndefined();
    await expect.element(page.getByRole("alertdialog", { name: "Second notice" })).toBeVisible();
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed delete confirmation baseline", async () => {
      await renderApp({ projects: [{ name: "Billing DB", openCount: 3, overdueCount: 1 }] });
      void confirm(deleteProject);
      await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`confirm-dialog-${theme}`);
    });

    it("Matches the reviewed name prompt baseline", async () => {
      await renderApp({ projects: [{ name: "Billing DB", openCount: 3, overdueCount: 1 }] });
      void prompt({ title: "New project", label: "Project name", confirmLabel: "Create" });
      await userEvent.keyboard("Data warehouse");

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`prompt-dialog-${theme}`);
    });
  });
});
