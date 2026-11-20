import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";
import { matchShellAtBothSizes, settleTheme, THEMES } from "../support/screenshots.js";

const billing = { name: "Billing DB", openCount: 3, overdueCount: 1 };

const card = (name: string) => page.getByRole("article", { name });

async function openCardAction(name: string, action: "project-rename" | "project-delete") {
  await card(name).getByTestId("project-card-menu").click();
  await page.getByTestId(action).click();
}

describe("HomePage", () => {
  it("Shows each project's open and overdue counts", async () => {
    await renderApp({ projects: [billing, { name: "Website" }] });

    await expect
      .element(card("Billing DB").getByTestId("project-open-count"))
      .toHaveTextContent("3 open");
    await expect
      .element(card("Billing DB").getByTestId("project-overdue-count"))
      .toHaveTextContent("1 overdue");
    await expect
      .element(card("Website").getByTestId("project-overdue-count"))
      .toHaveAttribute("data-overdue", "false");
  });

  it("Shows an empty state that creates the first project", async () => {
    const { store } = await renderApp();
    await page.getByTestId("empty-home-create").click();

    await userEvent.keyboard("Website{Enter}");

    await expect.element(card("Website")).toBeVisible();
    expect(store.names()).toEqual(["Website"]);
  });

  it("Creates a project when Enter submits the New project dialog", async () => {
    const { store } = await renderApp();
    await page.getByRole("button", { name: "New project" }).first().click();

    await userEvent.keyboard("Billing DB{Enter}");

    await expect.element(card("Billing DB")).toBeVisible();
    expect(store.names()).toEqual(["Billing DB"]);
  });

  it("Cancels project creation with Escape without calling the server", async () => {
    const { store } = await renderApp();
    await page.getByTestId("new-project-button").click();
    await userEvent.keyboard("Billing DB");

    await userEvent.keyboard("{Escape}");

    await expect.element(page.getByTestId("prompt-dialog")).not.toBeInTheDocument();
    expect(store.calls).not.toContain("CreateProject");
    expect(store.names()).toEqual([]);
  });

  it("Keeps the new project prompt open with Enter a name when the name is blank", async () => {
    const { store } = await renderApp();
    await page.getByTestId("new-project-button").click();

    await userEvent.keyboard("   {Enter}");

    await expect
      .element(page.getByTestId("prompt-dialog-error"))
      .toHaveTextContent("Enter a name.");
    await expect.element(page.getByTestId("prompt-dialog-submit")).toBeDisabled();
    expect(store.calls).not.toContain("CreateProject");
    expect(store.names()).toEqual([]);
  });

  it("Blocks renaming a project to a name longer than 300 characters", async () => {
    const { store } = await renderApp({ projects: [billing] });
    await openCardAction("Billing DB", "project-rename");

    await page.getByTestId("prompt-dialog-input").fill("x".repeat(301));
    await userEvent.keyboard("{Enter}");

    await expect
      .element(page.getByTestId("prompt-dialog-error"))
      .toHaveTextContent("Name must be 300 characters or fewer.");
    expect(store.calls).not.toContain("RenameProject");
  });

  it("Renames a project from its card menu", async () => {
    const { store } = await renderApp({ projects: [billing] });
    await openCardAction("Billing DB", "project-rename");
    await expect.element(page.getByTestId("prompt-dialog-input")).toHaveValue("Billing DB");

    await userEvent.keyboard("Accounting{Enter}");

    await expect.element(card("Accounting")).toBeVisible();
    expect(store.names()).toEqual(["Accounting"]);
  });

  it("Keeps the project name when a rename is cancelled", async () => {
    const { store } = await renderApp({ projects: [billing] });
    await openCardAction("Billing DB", "project-rename");

    await page.getByTestId("prompt-dialog-cancel").click();

    await expect.element(page.getByTestId("prompt-dialog")).not.toBeInTheDocument();
    expect(store.calls).not.toContain("RenameProject");
    await expect.element(card("Billing DB")).toBeVisible();
  });

  it("Shows a project action failure when a project disappears during rename", async () => {
    const { store } = await renderApp({ projects: [billing] });
    await openCardAction("Billing DB", "project-rename");
    store.remove(store.summaries[0]?.project.id ?? "");

    await userEvent.keyboard("Accounting{Enter}");

    await expect
      .element(page.getByRole("alertdialog", { name: "Project action failed" }))
      .toHaveAccessibleDescription("Project is missing or deleted.");
    expect(store.names()).toEqual([]);
  });

  it("Deletes a project after the user confirms", async () => {
    const { store } = await renderApp({ projects: [billing, { name: "Website" }] });
    await openCardAction("Billing DB", "project-delete");
    await expect
      .element(page.getByRole("alertdialog", { name: "Delete project" }))
      .toHaveAccessibleDescription("Delete Billing DB and its contents?");

    await page.getByTestId("confirm-dialog-confirm").click();

    await expect.element(card("Billing DB")).not.toBeInTheDocument();
    expect(store.names()).toEqual(["Website"]);
  });

  it("Keeps a project when the delete is declined with Escape", async () => {
    const { store } = await renderApp({ projects: [billing] });
    await openCardAction("Billing DB", "project-delete");

    await userEvent.keyboard("{Escape}");

    await expect.element(page.getByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(store.calls).not.toContain("DeleteProject");
    await expect.element(card("Billing DB")).toBeVisible();
  });

  it("Opens a project when its card is clicked", async () => {
    const { store, history } = await renderApp({ projects: [billing] });
    const projectId = store.summaries[0]?.project.id;

    await card("Billing DB").click();

    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();
    expect(history.location.pathname).toBe(`/projects/${projectId}`);
  });

  it("Opens a focused project card with Enter", async () => {
    const { history } = await renderApp({ projects: [billing] });
    const link = card("Billing DB").getByTestId("project-card-link");
    await expect.element(link).toBeVisible();
    link.element().focus();

    await userEvent.keyboard("{Enter}");

    await expect.element(page.getByRole("heading", { level: 1, name: "Billing DB" })).toBeVisible();
    expect(history.location.pathname).toMatch(/^\/projects\//);
  });

  it("Returns focus to the card menu after a dialog closes", async () => {
    await renderApp({ projects: [billing] });
    await openCardAction("Billing DB", "project-rename");

    await userEvent.keyboard("{Escape}");

    await expect.element(card("Billing DB").getByTestId("project-card-menu")).toHaveFocus();
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed home baseline", async () => {
      await renderApp({
        projects: [
          billing,
          { name: "Website", openCount: 12 },
          { name: "Data warehouse", openCount: 5, overdueCount: 4 },
        ],
      });
      await expect.element(card("Data warehouse")).toBeVisible();

      await matchShellAtBothSizes("home", theme);
    });

    it("Matches the reviewed empty home baseline", async () => {
      await renderApp();
      await expect.element(page.getByTestId("empty-home")).toBeVisible();

      await settleTheme(theme);

      await expect.element(page.getByTestId("app-shell")).toMatchScreenshot(`home-empty-${theme}`);
    });
  });
});
