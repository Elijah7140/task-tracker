import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SeedProject } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";

const PROJECT: SeedProject = {
  name: "Outline",
  items: [
    {
      title: "Release",
      children: [{ title: "Write notes" }, { title: "Tag build" }],
    },
  ],
};

const treeItem = (title: string) => page.getByRole("treeitem", { name: title, exact: true });
const rowSurface = (title: string) => treeItem(title).getByTestId("item-row").first();
const input = () => page.getByTestId("item-inline-add-input");

async function openProject() {
  const app = await renderApp({ projects: [PROJECT] });
  const projectId = app.store.summaries[0]!.project.id;
  app.history.push(`/projects/${projectId}`);
  await expect.element(treeItem("Write notes")).toBeVisible();
  const childTitles = (parentTitle: string) => {
    const parentId = app.store.findItemByTitle(projectId, null, parentTitle)?.item.id ?? null;
    return app.store.areaSiblingTitles(projectId, null, parentId);
  };
  return { ...app, projectId, childTitles };
}

async function openInlineAdd(title: string) {
  await userEvent.hover(rowSurface(title));
  await treeItem(title)
    .getByRole("button", { name: `Add a ToDo after ${title}` })
    .click();
  await expect.element(input()).toHaveFocus();
}

describe("InlineAddLine", () => {
  it("Opens under the row at its level from the row's hover +", async () => {
    await openProject();

    await openInlineAdd("Write notes");

    const row = rowSurface("Write notes").element() as HTMLElement;
    const line = input().element().closest<HTMLElement>("[data-no-item-drag]");
    expect(line?.style.paddingLeft).toBe(row.style.paddingLeft);
    expect(treeItem("Write notes").element().contains(input().element())).toBe(true);
  });

  it("Adds the next sibling right after the row with Enter and keeps typing after it", async () => {
    const { store, childTitles } = await openProject();
    await openInlineAdd("Write notes");

    await userEvent.keyboard("Review notes{Enter}");
    await expect.element(treeItem("Review notes")).toBeVisible();
    await expect
      .poll(() => treeItem("Review notes").element().contains(input().element()))
      .toBe(true);
    await expect.element(input()).toHaveFocus();
    await userEvent.keyboard("Send notes{Enter}");

    await expect.element(treeItem("Send notes")).toBeVisible();
    expect(childTitles("Release")).toEqual([
      "Write notes",
      "Review notes",
      "Send notes",
      "Tag build",
    ]);
    expect(store.calls.filter((call) => call === "CreateItem")).toHaveLength(2);
    expect(store.calls).not.toContain("DropItem");
  });

  it("Adds a child of the row with Shift+Enter and shows it nested under that row", async () => {
    const { childTitles } = await openProject();
    await openInlineAdd("Tag build");

    await userEvent.keyboard("Pick version{Shift>}{Enter}{/Shift}");

    await expect.element(treeItem("Pick version")).toHaveAttribute("aria-level", "3");
    expect(childTitles("Tag build")).toEqual(["Pick version"]);
    await expect
      .poll(() => treeItem("Pick version").element().contains(input().element()))
      .toBe(true);
    await expect.element(input()).toHaveFocus();
  });

  it("Closes with Escape and returns focus to the row", async () => {
    const { store } = await openProject();
    await openInlineAdd("Write notes");

    await userEvent.keyboard("{Escape}");

    await expect.element(input()).not.toBeInTheDocument();
    await expect.element(treeItem("Write notes")).toHaveFocus();
    expect(store.calls).not.toContain("CreateItem");
  });

  it("Closes when it loses focus while empty", async () => {
    await openProject();
    await openInlineAdd("Write notes");

    await page.getByRole("heading", { level: 1 }).click();

    await expect.element(input()).not.toBeInTheDocument();
  });

  it("Keeps typing out of the tree and workspace shortcuts", async () => {
    const { store } = await openProject();
    await openInlineAdd("Write notes");

    await userEvent.keyboard(" {Delete}{ArrowDown}x");

    await expect.element(input()).toHaveFocus();
    await expect.element(input()).toHaveValue(" x");
    expect(store.calls).not.toContain("SetItemCompleted");
    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
  });
});
