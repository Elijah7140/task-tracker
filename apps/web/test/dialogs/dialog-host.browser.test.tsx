import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { NAME_VALIDATION } from "../../src/dialogs/name-validation.js";
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

const newProject = {
  title: "New project",
  label: "Project name",
  confirmLabel: "Create",
  validation: NAME_VALIDATION,
};

const promptInput = () => page.getByRole("textbox", { name: "Project name" });
const promptSubmit = () => page.getByTestId("prompt-dialog-submit");
const promptError = () => page.getByTestId("prompt-dialog-error");

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

  it("Shows Enter a name and disables Save while a validated name is blank", async () => {
    await renderApp();
    const answer = prompt(newProject);
    await expect.element(promptInput()).toHaveFocus();

    await userEvent.keyboard("   {Enter}");

    await expect.element(promptError()).toHaveTextContent("Enter a name.");
    await expect.element(promptInput()).toHaveAccessibleDescription("Enter a name.");
    await expect.element(promptInput()).toHaveAttribute("aria-invalid", "true");
    await expect.element(promptSubmit()).toBeDisabled();
    await expect.element(page.getByTestId("prompt-dialog")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(answer).resolves.toBeNull();
  });

  it("Shows the length message once a validated name passes the limit", async () => {
    await renderApp();
    void prompt(newProject);
    await expect.element(promptInput()).toHaveFocus();

    await promptInput().fill(` ${"x".repeat(300)} `);
    await expect.element(promptError()).not.toBeInTheDocument();
    await expect.element(promptSubmit()).toBeEnabled();
    await promptInput().fill("x".repeat(301));

    await expect.element(promptError()).toHaveTextContent("Name must be 300 characters or fewer.");
    await expect.element(promptSubmit()).toBeDisabled();
  });

  it("Resolves a validated name trimmed once it becomes valid", async () => {
    await renderApp();
    const answer = prompt(newProject);
    await expect.element(promptError()).toHaveTextContent("Enter a name.");
    await expect.element(promptInput()).toHaveFocus();

    await userEvent.keyboard("  Data warehouse  {Enter}");

    await expect(answer).resolves.toBe("Data warehouse");
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
      await expect.element(promptInput()).toHaveFocus();
      await userEvent.keyboard("Data warehouse");

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`prompt-dialog-${theme}`);
    });

    it("Matches the reviewed invalid name prompt baseline", async () => {
      await renderApp({ projects: [{ name: "Billing DB", openCount: 3, overdueCount: 1 }] });
      void prompt(newProject);
      await expect.element(promptError()).toHaveTextContent("Enter a name.");

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`prompt-dialog-invalid-${theme}`);
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
