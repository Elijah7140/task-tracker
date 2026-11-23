import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  draftDialog,
  editor,
  editorTitle,
  openEditor,
  openEditorWorkspace,
} from "../support/item-editor-page.js";
import { menuPopup, menuTrigger, openMenu } from "../support/menu-bar.js";
import { renderApp } from "../support/render-app.js";

const menuBar = () => page.getByRole("menubar", { name: "Main menu" });
const homeHeading = () => page.getByRole("heading", { name: "Projects", level: 1 });
const searchHeading = () => page.getByRole("heading", { name: "Search", level: 1 });
const newProject = () => page.getByTestId("new-project-button");
const row = (title: string) => page.getByRole("treeitem", { name: title, exact: true });

async function openHome() {
  const app = await renderApp({ projects: [{ name: "Billing", items: [{ title: "Report" }] }] });
  await expect.element(homeHeading()).toBeVisible();
  return app;
}

/** Focuses a control outside the menu bar, as the user would before reaching for it. */
async function focusNewProject() {
  newProject().element().focus();
  await expect.element(newProject()).toHaveFocus();
}

describe("MenuBar", () => {
  it("Shows File, Edit, Project and View in one bar on Home and in a workspace", async () => {
    await openHome();
    const bar = menuBar().element();

    await page.getByRole("article", { name: "Billing" }).click();
    await expect.element(row("Report")).toBeVisible();

    expect(menuBar().element()).toBe(bar);
    const names = menuBar().getByRole("menuitem");
    await expect.element(names.nth(0)).toHaveAccessibleName("File");
    await expect.element(names.nth(1)).toHaveAccessibleName("Edit");
    await expect.element(names.nth(2)).toHaveAccessibleName("Project");
    await expect.element(names.nth(3)).toHaveAccessibleName("View");
    expect(names.length).toBe(4);
  });

  it("Leaves the window title to the system title bar", async () => {
    await openHome();

    await expect.element(page.getByTestId("title-bar")).toBeVisible();

    expect(page.getByTestId("title-bar").element().textContent).not.toContain("Task Tracker");
    expect(page.getByTestId("sidebar").element().textContent).not.toContain("Task Tracker");
  });

  it("Focuses File with F10 and returns focus with F10 again", async () => {
    await openHome();
    await focusNewProject();

    await userEvent.keyboard("{F10}");
    await expect.element(menuTrigger("file")).toHaveFocus();
    await userEvent.keyboard("{F10}");

    await expect.element(newProject()).toHaveFocus();
  });

  it("Focuses File with Alt pressed and released alone, and Alt again returns", async () => {
    await openHome();
    await focusNewProject();

    await userEvent.keyboard("{Alt}");
    await expect.element(menuTrigger("file")).toHaveFocus();
    await userEvent.keyboard("{Alt}");

    await expect.element(newProject()).toHaveFocus();
  });

  it("Ignores Alt when it is part of a shortcut", async () => {
    await openHome();
    await focusNewProject();

    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");

    await expect.element(newProject()).toHaveFocus();
  });

  it("Moves between menus with the arrow keys and opens one with ArrowDown", async () => {
    await openHome();
    await focusNewProject();
    await userEvent.keyboard("{F10}");

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(menuTrigger("edit")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    await expect.element(menuTrigger("view")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(menuTrigger("file")).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(menuTrigger("view")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");

    await expect.element(menuPopup("view").getByTestId("menu-search")).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(menuPopup("view").getByTestId("menu-calendar")).toHaveFocus();
  });

  it("Closes a menu with Escape, then leaves the bar with Escape, without leaving Search", async () => {
    await openHome();
    await focusNewProject();
    await userEvent.keyboard("{Control>}f{/Control}");
    await expect.element(searchHeading()).toBeVisible();
    const input = page.getByTestId("search-input");
    await expect.element(input).toHaveFocus();

    await userEvent.keyboard("{Alt>}v{/Alt}");
    await expect.element(menuPopup("view").getByTestId("menu-search")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect.element(menuPopup("view")).not.toBeInTheDocument();
    await expect.element(menuTrigger("view")).toHaveFocus();
    await expect.element(searchHeading()).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(input).toHaveFocus();
    await expect.element(searchHeading()).toBeVisible();
  });

  it("Opens a menu with Alt and its access key, from a text box too", async () => {
    await openHome();
    await userEvent.keyboard("{Control>}f{/Control}");
    await expect.element(page.getByTestId("search-input")).toHaveFocus();

    await userEvent.keyboard("{Alt>}f{/Alt}");
    await expect.element(menuPopup("file").getByTestId("menu-app-settings")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect.element(menuTrigger("file")).toHaveFocus();
    await userEvent.keyboard("{Alt>}e{/Alt}");

    await expect.element(menuPopup("edit").getByTestId("history-undo")).toBeVisible();
    await expect.element(menuPopup("file")).not.toBeInTheDocument();
  });

  it("Does not trap focus: Tab leaves the bar for the page", async () => {
    await openHome();
    await userEvent.keyboard("{F10}");

    await userEvent.keyboard("{Tab}");

    const active = document.activeElement;
    expect(active).not.toBe(document.body);
    expect(menuBar().element().contains(active)).toBe(false);
    expect(page.getByTestId("sidebar").element().contains(active)).toBe(true);
  });

  it("Returns focus to the previously focused control after a menu command", async () => {
    await openHome();
    await focusNewProject();

    await openMenu("edit");
    await userEvent.keyboard("{Escape}");
    await expect.element(menuTrigger("edit")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await expect.element(newProject()).toHaveFocus();
    await userEvent.keyboard("{Alt>}v{/Alt}{ArrowUp}");
    await expect.element(menuPopup("view").getByTestId("menu-reminders")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect.element(page.getByRole("dialog", { name: "Reminders" })).toBeVisible();
    await userEvent.keyboard("{Escape}");

    await expect.element(newProject()).toHaveFocus();
  });

  it("Keeps focus off the body when a command opens a page and Back returns", async () => {
    await openHome();
    await focusNewProject();

    await userEvent.keyboard("{Alt>}v{/Alt}");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    await expect.element(page.getByRole("heading", { name: "Trash", exact: true })).toHaveFocus();
    await userEvent.keyboard("{Escape}");

    await expect.element(newProject()).toHaveFocus();
  });

  it("Ignores Alt, F10 and access keys while the item editor is open", async () => {
    await openEditorWorkspace();
    await openEditor();
    await expect.element(editorTitle()).toHaveFocus();

    await userEvent.keyboard("{F10}");
    await userEvent.keyboard("{Alt}");
    await userEvent.keyboard("{Alt>}f{/Alt}");

    await expect.element(editorTitle()).toHaveFocus();
    await expect.element(menuPopup("file")).not.toBeInTheDocument();
    await expect.element(draftDialog()).not.toBeInTheDocument();
    await expect.element(editor()).toBeVisible();
  });

  it("Ignores Alt, F10 and access keys while a message box is open", async () => {
    await openHome();
    await newProject().click();
    const name = page.getByRole("textbox", { name: "Project name" });
    await expect.element(name).toHaveFocus();

    await userEvent.keyboard("{F10}");
    await userEvent.keyboard("{Alt>}p{/Alt}");

    await expect.element(name).toHaveFocus();
    await expect.element(menuPopup("project")).not.toBeInTheDocument();
  });
});
