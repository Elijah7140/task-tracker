import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { SeedProject } from "../support/fake-task-tracker-server.js";
import { type RenderAppOptions, renderApp } from "../support/render-app.js";

const PROJECT: SeedProject = {
  name: "Outline",
  items: [
    {
      title: "Release",
      children: [
        {
          title: "Prepare",
          children: [{ title: "Draft notes", children: [{ title: "Collect changes" }] }],
        },
        { title: "Typed step" },
        { title: "Shipped", completedAtUtc: "2026-11-12T10:00:00Z" },
      ],
    },
    { title: "Lonely card" },
  ],
};

const treeItem = (title: string) => page.getByRole("treeitem", { name: title, exact: true });
const rowSurface = (title: string) => treeItem(title).getByTestId("item-row").first();
const addLine = (title: string) => treeItem(title).getByTestId("card-add-input");

async function openProject(configure?: RenderAppOptions["configure"]) {
  const app = await renderApp(
    configure === undefined ? { projects: [PROJECT] } : { projects: [PROJECT], configure },
  );
  const projectId = app.store.summaries[0]!.project.id;
  app.history.push(`/projects/${projectId}`);
  await expect.element(treeItem("Release")).toBeVisible();
  const childTitles = (parentTitle: string) => {
    const parentId = app.store.findItemByTitle(projectId, null, parentTitle)?.item.id ?? null;
    return app.store.areaSiblingTitles(projectId, null, parentId);
  };
  return { ...app, projectId, childTitles };
}

describe("ItemCard", () => {
  it("Shows every descendant nested under its parent without expanding anything", async () => {
    await openProject();

    await expect.element(treeItem("Prepare")).toHaveAttribute("aria-level", "2");
    await expect.element(treeItem("Draft notes")).toHaveAttribute("aria-level", "3");
    await expect.element(treeItem("Collect changes")).toHaveAttribute("aria-level", "4");
    await expect.element(treeItem("Draft notes")).toHaveAttribute("aria-expanded", "true");
    expect(treeItem("Prepare").element().contains(treeItem("Collect changes").element())).toBe(
      true,
    );
    await expect.element(treeItem("Release").getByTestId("item-toggle")).not.toBeInTheDocument();
    await expect
      .element(treeItem("Release").getByRole("treeitem", { name: "1 completed" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("Indents nested rows instead of marking them with a second dot", async () => {
    await openProject();

    const indent = (title: string) =>
      Number.parseFloat((rowSurface(title).element() as HTMLElement).style.paddingLeft);

    expect(indent("Draft notes")).toBeGreaterThan(indent("Prepare"));
    expect(indent("Collect changes")).toBeGreaterThan(indent("Draft notes"));
    expect(rowSurface("Prepare").getByTestId("item-completion").elements()).toHaveLength(1);
    // Item types were removed (§12), so no row shows a type glyph.
    expect(page.getByTestId("item-type").elements()).toHaveLength(0);
  });

  it("Moves to the parent row with Left because sub-item rows never collapse", async () => {
    await openProject();
    treeItem("Collect changes").element().focus();

    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(treeItem("Draft notes")).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");

    await expect.element(treeItem("Prepare")).toHaveFocus();
    await expect.element(treeItem("Collect changes")).toBeVisible();
  });

  it("Adds a direct child at the end of the card with Enter on the add line", async () => {
    const { childTitles } = await openProject();
    await addLine("Release").click();

    await userEvent.keyboard("Announce{Enter}");

    await expect.element(treeItem("Announce")).toHaveAttribute("aria-level", "2");
    await expect.element(addLine("Release")).toHaveValue("");
    await expect.element(addLine("Release")).toHaveFocus();
    expect(childTitles("Release")).toEqual(["Prepare", "Typed step", "Shipped", "Announce"]);
  });

  it("Adds a child of the last open top-level child with Shift+Enter on the add line", async () => {
    const { childTitles } = await openProject();
    await addLine("Release").click();

    await userEvent.keyboard("Check logs{Shift>}{Enter}{/Shift}");

    await expect.element(treeItem("Check logs")).toHaveAttribute("aria-level", "3");
    expect(childTitles("Typed step")).toEqual(["Check logs"]);
  });

  it("Adds a direct child with Shift+Enter when the card has no open children", async () => {
    const { childTitles } = await openProject();
    await addLine("Lonely card").click();

    await userEvent.keyboard("First step{Shift>}{Enter}{/Shift}");

    await expect.element(treeItem("First step")).toHaveAttribute("aria-level", "2");
    expect(childTitles("Lonely card")).toEqual(["First step"]);
  });

  it("Never opens or drags the card from a double-click on the add line", async () => {
    const { history } = await openProject();
    const path = history.location.pathname;

    await addLine("Lonely card").dblClick();

    await expect.element(addLine("Lonely card")).toHaveFocus();
    expect(history.location.pathname).toBe(path);
  });

  it("Puts the add line at the top of the card by default and keeps it focused there", async () => {
    const { childTitles } = await openProject();
    const follows = (first: Element, second: Element) =>
      (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(addLine("Release").element(), treeItem("Prepare").element())).toBe(true);
    await addLine("Release").click();

    await userEvent.keyboard("One{Enter}");
    await expect.element(treeItem("One")).toBeVisible();
    await userEvent.keyboard("Two{Enter}");

    await expect.element(treeItem("Two")).toBeVisible();
    await expect.element(addLine("Release")).toHaveFocus();
    expect(follows(addLine("Release").element(), treeItem("Two").element())).toBe(true);
    expect(childTitles("Release")).toEqual(["Prepare", "Typed step", "Shipped", "One", "Two"]);
  });

  it("Puts the add line below the outline when the setting is Bottom", async () => {
    await openProject((store) => {
      const settings = store.settingsAndLookups.globalSettings;
      const layout = { ...settings.workspaceLayout!, addLinePosition: "Bottom" as const };
      store.settingsAndLookups.globalSettings = { ...settings, workspaceLayout: layout };
    });

    const line = addLine("Release").element();

    expect(
      treeItem("Collect changes").element().compareDocumentPosition(line) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });
});
