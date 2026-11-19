import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SeedProject } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";

const billing: SeedProject = {
  name: "Billing DB",
  folders: [
    { name: "dbo" },
    { name: "Tables", parent: "dbo" },
    { name: "Views", parent: "dbo" },
    { name: "Archive" },
  ],
};

const tree = () => page.getByRole("tree", { name: "Folders in Billing DB" });

const folder = (name: string) => tree().getByRole("treeitem", { name, exact: true });

async function openProject(seed: ReadonlyArray<SeedProject> = [billing]) {
  const app = await renderApp({ projects: seed });
  const projectId = app.store.summaries[0]?.project.id ?? "";
  app.history.push(`/projects/${projectId}`);
  await expect.element(folder("dbo")).toBeVisible();
  return { ...app, projectId };
}

async function focusFolder(name: string) {
  folder(name).element().focus();
  await expect.element(folder(name)).toHaveFocus();
}

describe("SidebarFolderTree", () => {
  it("Shows the open project's folders as a nested tree", async () => {
    await openProject([billing, { name: "Website", folders: [{ name: "Pages" }] }]);

    await expect.element(folder("Tables")).toHaveAttribute("aria-level", "2");
    await expect.element(folder("dbo")).toHaveAttribute("aria-expanded", "true");
    await expect.element(folder("Archive")).not.toHaveAttribute("aria-expanded");
    await expect.element(page.getByRole("treeitem", { name: "Pages" })).not.toBeInTheDocument();
  });

  it("Opens a folder's area when its row is clicked", async () => {
    const { history, store } = await openProject();

    await folder("Tables").getByTestId("folder-row").first().click();

    await expect.element(page.getByRole("heading", { level: 1, name: "Tables" })).toBeVisible();
    await expect.element(folder("Tables")).toHaveAttribute("aria-current", "page");
    expect(history.location.pathname).toMatch(
      new RegExp(`/folders/${store.folderNamed("Tables").id}$`),
    );
  });

  it("Moves with the arrow keys and opens the focused folder with Enter", async () => {
    await openProject();
    await focusFolder("dbo");

    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await expect.element(folder("Views")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect.element(page.getByRole("heading", { level: 1, name: "Views" })).toBeVisible();
  });

  it("Collapses with Left, moves to the parent with Left and expands with Right", async () => {
    await openProject();
    await focusFolder("Tables");

    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(folder("dbo")).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(folder("Tables")).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");

    await expect.element(folder("Tables")).toBeVisible();
    await expect.element(folder("dbo")).toHaveAttribute("aria-expanded", "true");
  });

  it("Collapses a folder from its chevron without opening it", async () => {
    const { history } = await openProject();
    const path = history.location.pathname;

    await folder("dbo").getByTestId("folder-toggle").first().click();

    await expect.element(folder("Tables")).not.toBeInTheDocument();
    await expect.element(folder("dbo")).toHaveAttribute("aria-expanded", "false");
    expect(history.location.pathname).toBe(path);
  });

  it("Creates a top-level folder from the project's New folder button", async () => {
    const { store } = await openProject();

    await page.getByRole("button", { name: "New folder in Billing DB" }).click();
    await userEvent.keyboard("Reports{Enter}");

    await expect.element(folder("Reports")).toHaveAttribute("aria-level", "1");
    expect(store.folderTree()).toContain("root/Reports");
  });

  it("Creates a sub-folder from a folder's menu and expands its parent", async () => {
    const { store } = await openProject();
    await folder("dbo").getByTestId("folder-toggle").first().click();

    await folder("dbo").getByTestId("folder-menu").first().click();
    await page.getByTestId("folder-new-subfolder").click();
    await userEvent.keyboard("Procedures{Enter}");

    await expect.element(folder("Procedures")).toHaveAttribute("aria-level", "2");
    await expect.element(folder("Tables")).toBeVisible();
    expect(store.folderTree()).toContain("dbo/Procedures");
  });

  it("Renames the focused folder with F2", async () => {
    const { store } = await openProject();
    await focusFolder("Archive");

    await userEvent.keyboard("{F2}");
    await expect.element(page.getByRole("textbox", { name: "Folder name" })).toHaveValue("Archive");
    await userEvent.keyboard("Old work{Enter}");

    await expect.element(folder("Old work")).toBeVisible();
    expect(store.folderTree()).toContain("root/Old work");
  });

  it("Renames a folder from its context menu", async () => {
    const { store } = await openProject();

    await folder("Views").getByTestId("folder-row").first().click({ button: "right" });
    await page.getByTestId("folder-context-menu").getByRole("menuitem", { name: "Rename" }).click();
    await userEvent.keyboard("Reports{Enter}");

    await expect.element(folder("Reports")).toBeVisible();
    expect(store.folderTree()).toContain("dbo/Reports");
  });

  it("Opens the focused folder's actions with Shift+F10", async () => {
    await openProject();
    await focusFolder("Archive");

    await userEvent.keyboard("{Shift>}{F10}{/Shift}");

    await expect.element(page.getByTestId("folder-menu-popup")).toBeVisible();
    await expect.element(page.getByRole("menuitem", { name: "Move" })).toBeVisible();
  });

  it("Moves a folder to the project root through the destination dialog", async () => {
    const { store } = await openProject();
    await folder("Tables").getByTestId("folder-menu").first().click();
    await page.getByTestId("folder-move").click();
    const dialog = page.getByRole("dialog", { name: "Move Tables" });
    await expect.element(dialog.getByRole("radio", { name: "dbo" })).toBeChecked();

    await dialog.getByRole("radio", { name: "Billing DB" }).click();
    await dialog.getByRole("button", { name: "Move" }).click();

    await expect.element(folder("Tables")).toHaveAttribute("aria-level", "1");
    expect(store.folderTree()).toContain("root/Tables");
  });

  it("Chooses a destination with the arrow keys and confirms with Enter", async () => {
    const { store } = await openProject();
    await folder("Archive").getByTestId("folder-menu").first().click();
    await page.getByTestId("folder-move").click();
    await expect.element(page.getByRole("radio", { name: "Billing DB" })).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}{Enter}");

    await expect.element(folder("Archive")).toHaveAttribute("aria-level", "2");
    expect(store.folderTree()).toContain("dbo/Archive");
  });

  it("Shows the server's message and keeps the folder when a move would create a cycle", async () => {
    const { store } = await openProject();
    await folder("dbo").getByTestId("folder-menu").first().click();
    await page.getByTestId("folder-move").click();

    await page.getByRole("radio", { name: "Tables" }).click();
    await page.getByRole("button", { name: "Move" }).click();

    await expect
      .element(page.getByRole("alertdialog", { name: "Folder action failed" }))
      .toHaveAccessibleDescription("Folder move would create a cycle.");
    expect(store.folderTree()).toContain("root/dbo");
  });

  it("Deletes the open folder after confirmation and opens its parent", async () => {
    const { store, history } = await openProject();
    await folder("Tables").getByTestId("folder-row").first().click();
    await expect.element(page.getByRole("heading", { level: 1, name: "Tables" })).toBeVisible();
    await focusFolder("Tables");

    await userEvent.keyboard("{Delete}");
    await expect
      .element(page.getByRole("alertdialog", { name: "Delete folder" }))
      .toHaveAccessibleDescription("Delete Tables and its contents?");
    await page.getByTestId("confirm-dialog-confirm").click();

    await expect.element(page.getByRole("heading", { level: 1, name: "dbo" })).toBeVisible();
    await expect.element(folder("Tables")).not.toBeInTheDocument();
    expect(history.location.pathname).toMatch(
      new RegExp(`/folders/${store.folderNamed("dbo").id}$`),
    );
  });

  it("Keeps a folder when the delete is declined", async () => {
    const { store } = await openProject();
    await folder("Archive").getByTestId("folder-menu").first().click();
    await page.getByTestId("folder-delete").click();

    await userEvent.keyboard("{Escape}");

    await expect.element(page.getByTestId("confirm-dialog")).not.toBeInTheDocument();
    await expect.element(folder("Archive")).toBeVisible();
    expect(store.calls).not.toContain("DeleteFolder");
  });

  it("Keeps the new folder prompt open with Enter a name when the name is blank", async () => {
    const { store } = await openProject();

    await page.getByRole("button", { name: "New folder in Billing DB" }).click();
    await userEvent.keyboard("   {Enter}");

    await expect
      .element(page.getByTestId("prompt-dialog-error"))
      .toHaveTextContent("Enter a name.");
    await expect.element(page.getByTestId("prompt-dialog-submit")).toBeDisabled();
    expect(store.calls).not.toContain("CreateFolder");
    expect(store.folders).toHaveLength(4);
  });
});
