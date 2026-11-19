import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { choose, confirm, notify, prompt } from "../../src/state/dialog-store.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const deleteProject = {
  title: "Delete project",
  message: "Delete Billing DB and its contents?",
  confirmLabel: "Delete",
  tone: "danger",
} as const;

const moveFolder = {
  title: "Move Tables",
  label: "Destination",
  options: [
    { value: "root", label: "Billing DB" },
    { value: "dbo", label: "dbo", depth: 1 },
    { value: "tables", label: "Tables", depth: 2 },
    { value: "views", label: "Views", depth: 2 },
    { value: "reporting", label: "Reporting", depth: 1 },
  ],
  initialValue: "dbo",
  confirmLabel: "Move",
};

const projectUnavailable = {
  title: "Project unavailable",
  message: "Project is missing or deleted.",
};

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

  it("Starts a choice on the initial option and confirms the clicked one", async () => {
    await renderApp();
    const answer = choose(moveFolder);
    await expect.element(page.getByRole("radio", { name: "dbo" })).toHaveFocus();

    await page.getByRole("radio", { name: "Reporting" }).click();
    await page.getByTestId("choice-dialog-submit").click();

    await expect(answer).resolves.toBe("reporting");
  });

  it("Indents choices by depth", async () => {
    await renderApp();
    void choose(moveFolder);

    const root = page.getByRole("radio", { name: "Billing DB" });
    const nested = page.getByRole("radio", { name: "Tables" });

    await expect.element(nested).toBeVisible();
    expect(nested.element().getBoundingClientRect().left).toBeGreaterThan(
      root.element().getBoundingClientRect().left,
    );
  });

  it("Resolves a choice with null when Escape cancels it", async () => {
    await renderApp();
    const answer = choose(moveFolder);
    await expect.element(page.getByRole("radio", { name: "dbo" })).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}{Escape}");

    await expect(answer).resolves.toBeNull();
  });

  it.each(["Enter", "Escape"])("Dismisses a message with %s", async (key) => {
    await renderApp();
    const dismissed = notify(projectUnavailable);
    await expect.element(page.getByTestId("message-dialog-ok")).toHaveFocus();

    await userEvent.keyboard(`{${key}}`);

    await expect(dismissed).resolves.toBeUndefined();
    await expect.element(page.getByTestId("message-dialog")).not.toBeInTheDocument();
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

    it("Matches the reviewed choice dialog baseline", async () => {
      await renderApp({ projects: [{ name: "Billing DB", openCount: 3, overdueCount: 1 }] });
      void choose(moveFolder);
      await expect.element(page.getByRole("radio", { name: "dbo" })).toHaveFocus();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`choice-dialog-${theme}`);
    });

    it("Matches the reviewed message baseline", async () => {
      await renderApp({ projects: [{ name: "Billing DB", openCount: 3, overdueCount: 1 }] });
      void notify(projectUnavailable);
      await expect.element(page.getByTestId("message-dialog-ok")).toHaveFocus();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`message-dialog-${theme}`);
    });
  });
});
