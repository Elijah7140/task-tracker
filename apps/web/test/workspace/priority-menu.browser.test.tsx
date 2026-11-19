import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { FakeProjectStore } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const SEVEN_ID = "019A0000-0000-7000-8000-000000002907";
const RETIRED_ID = "019A0000-0000-7000-8000-000000002903";

const row = () => page.getByRole("treeitem", { name: "Deploy", exact: true });
const trigger = () => page.getByRole("menuitem", { name: "Set priority" });
const choice = (name: string) => page.getByRole("menuitemradio", { name, exact: true });
/** The Deploy card inside the card grid section for a priority (§7.17). */
const inSection = (title: string) =>
  page.getByRole("group", { name: title, exact: true }).getByRole("treeitem", { name: "Deploy" });

const level = (
  id: string,
  name: string,
  number: number,
  sortOrder: number,
  isArchived = false,
) => ({
  id,
  name,
  number,
  label: name === "" ? String(number) : `${number} · ${name}`,
  colorKey: null,
  isBuiltIn: false,
  isArchived,
  sortOrder,
});

function addNumberedLevels(store: FakeProjectStore) {
  store.extraLookups.priorityLevels.push(
    level(SEVEN_ID, "", 7, 4),
    level(RETIRED_ID, "Retired", 3, 5, true),
  );
}

async function openWorkspace(priority?: "High", extra?: (store: FakeProjectStore) => void) {
  const app = await renderApp({
    projects: [
      { name: "Project", items: [{ title: "Deploy", ...(priority ? { priority } : {}) }] },
    ],
    configure: (store) => {
      addNumberedLevels(store);
      extra?.(store);
    },
  });
  const projectId = app.store.summaries[0]!.project.id;
  app.history.push(`/projects/${projectId}`);
  await expect.element(row()).toBeVisible();
  return { ...app, projectId };
}

async function openWithMouse() {
  await row().getByTestId("item-title").first().click({ button: "right" });
  await trigger().click();
}

const storedPriority = (store: FakeProjectStore, projectId: string) =>
  store.findItemByTitle(projectId, null, "Deploy")?.item.priorityLevelId;

it("Assigns a number-only priority by mouse and shows the current choice as checked", async () => {
  const { store, projectId } = await openWorkspace();

  await openWithMouse();
  await expect.element(choice("None")).toBeChecked();
  await expect.element(choice("7")).not.toBeChecked();
  await expect.element(choice("3 · Retired")).not.toBeInTheDocument();
  await choice("7").click();

  await expect.element(inSection("7")).toBeVisible();
  expect(storedPriority(store, projectId)).toBe(SEVEN_ID);
  expect(store.calls.filter((call) => call === "SetItemPriority")).toHaveLength(1);
  await openWithMouse();
  await expect.element(choice("7")).toBeChecked();
  await expect.element(choice("None")).not.toBeChecked();
});

it("Opens the overflow submenu and clears the priority with the keyboard", async () => {
  const { store, projectId } = await openWorkspace("High");
  await row().getByTestId("item-title").click();

  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  await userEvent.keyboard("{Home}{ArrowDown}{ArrowRight}");
  await expect.element(choice("High")).toBeChecked();
  await expect.element(choice("None")).toHaveFocus();
  await userEvent.keyboard("{Enter}");

  await expect.element(inSection("No priority")).toBeVisible();
  expect(storedPriority(store, projectId)).toBeNull();
});

it("Keeps an item's archived priority listed and checked", async () => {
  await openWorkspace(undefined, (store) => {
    const id = store.findItemByTitle(store.summaries[0]!.project.id, null, "Deploy")?.item.id;
    store.patchItem(id ?? "", { priorityLevelId: RETIRED_ID });
  });
  await expect.element(inSection("3 · Retired")).toBeVisible();

  await openWithMouse();

  await expect.element(choice("3 · Retired")).toBeChecked();
  await expect.element(choice("None")).not.toBeChecked();
});

it("Records the change in history so Edit undo restores the previous priority", async () => {
  const { store, projectId } = await openWorkspace("High");

  await openWithMouse();
  await choice("7").click();
  await expect.element(inSection("7")).toBeVisible();
  await userEvent.keyboard("{Control>}z{/Control}");

  await expect.element(inSection("High")).toBeVisible();
  expect(storedPriority(store, projectId)).toBe("019A0000-0000-7000-8000-000000002001");
});

describe.each(THEMES)("in the %s theme", (theme) => {
  it("Matches the reviewed priority submenu baseline", async () => {
    await openWorkspace("High");
    await settleTheme(theme);

    await openWithMouse();

    await expect.element(choice("High")).toBeChecked();
    await expect.element(page.getByTestId("app-shell")).toMatchScreenshot(`priority-menu-${theme}`);
  });
});
