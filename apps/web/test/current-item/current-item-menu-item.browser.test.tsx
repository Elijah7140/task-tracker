import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { FakeProjectStore, SeedProject } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";

const REVIEW = "Review release notes";
const CHECK = "Check links";

const PROJECT: SeedProject = {
  name: "Release",
  items: [
    {
      title: REVIEW,
      ticketNumber: "REL-1",
      dueDate: "2026-11-20",
      children: [
        { title: CHECK },
        { title: "Write summary", completedAtUtc: "2026-11-13T10:00:00Z" },
      ],
    },
    { title: "Plan retro" },
  ],
};

const shortcut = (key: string) => userEvent.keyboard(`{Control>}{Shift>}${key}{/Shift}{/Control}`);
const home = () => page.getByRole("heading", { name: "Projects", exact: true, level: 1 });
const item = (title: string) => page.getByRole("treeitem", { name: title, exact: true });
const setItem = () => page.getByRole("menuitem", { name: "Set as current item" });
const clearItem = () => page.getByRole("menuitem", { name: "Clear current item" });
const stored = (store: FakeProjectStore) => store.currentItem.itemId;
const idOf = (store: FakeProjectStore, title: string) =>
  store.findItemByTitle(store.summaries[0]!.project.id, null, title)!.item.id;

async function openWorkspace() {
  const app = await renderApp({ projects: [PROJECT] });
  await page.getByRole("article", { name: "Release" }).click();
  await expect.element(item(REVIEW)).toBeVisible();
  return app;
}

async function rightClickItem(title: string) {
  await item(title).getByTestId("item-title").first().click({ button: "right" });
}

describe("workspace cards and rows", () => {
  it("The card menu sets and then clears the current item, and the star follows", async () => {
    const { store } = await openWorkspace();
    const star = item(REVIEW).getByTestId("item-card-current").first();

    await rightClickItem(REVIEW);
    await setItem().click();

    await expect.element(star).toHaveAttribute("aria-pressed", "true");
    expect(stored(store)).toBe(idOf(store, REVIEW));
    await rightClickItem(REVIEW);
    await clearItem().click();
    await expect.element(star).toHaveAttribute("aria-pressed", "false");
    expect(stored(store)).toBeNull();
  });

  it("A sub-item row menu sets the current item and marks the row with a star", async () => {
    const { store } = await openWorkspace();

    await rightClickItem(CHECK);
    await setItem().click();

    await expect.element(item(CHECK).getByTestId("item-current-marker")).toBeVisible();
    expect(page.getByTestId("item-current-marker").elements()).toHaveLength(1);
    expect(stored(store)).toBe(
      store.findItemByTitle(store.summaries[0]!.project.id, null, CHECK)?.item.id,
    );
  });

  it("The overflow menu offers the same choice", async () => {
    const { store } = await openWorkspace();

    await item("Plan retro").getByTestId("item-title").first().hover();
    await item("Plan retro").getByTestId("item-menu").first().click();
    await setItem().click();

    expect(stored(store)).toBe(idOf(store, "Plan retro"));
    await expect
      .element(item("Plan retro").getByTestId("item-card-current").first())
      .toHaveAttribute("aria-pressed", "true");
  });

  it("A refused choice is explained in a Current item message", async () => {
    const { store } = await openWorkspace();
    store.currentItem.setFailure = "This item is no longer available.";

    await rightClickItem(REVIEW);
    await setItem().click();

    const message = page.getByRole("alertdialog", { name: "Current item" });
    await expect.element(message).toMatchTextContent("This item is no longer available.");
    expect(stored(store)).toBeNull();
  });
});

describe("transient pages", () => {
  async function openFromHome(key: string) {
    const app = await renderApp({ projects: [PROJECT] });
    await expect.element(home()).toBeVisible();
    await shortcut(key);
    return app;
  }

  it("A Today row menu sets the current item", async () => {
    const { store } = await openFromHome("d");
    const row = page
      .getByTestId("today-item-row")
      .filter({ has: page.getByRole("button", { name: REVIEW, exact: true }) });

    await row.click({ button: "right" });
    await setItem().click();

    expect(stored(store)).toBe(idOf(store, REVIEW));
  });

  it("A ticket row menu sets the current item", async () => {
    const { store } = await openFromHome("k");

    await page.getByRole("listitem", { name: REVIEW, exact: true }).click({ button: "right" });
    await setItem().click();

    expect(stored(store)).toBe(idOf(store, REVIEW));
  });

  it("A calendar entry menu sets the current item", async () => {
    const { store } = await openFromHome("c");

    await page.getByRole("button", { name: new RegExp(`^${REVIEW}(,|$)`) }).click({
      button: "right",
    });
    await setItem().click();

    expect(stored(store)).toBe(idOf(store, REVIEW));
  });

  it("A search result menu sets the current item, even when it is already current", async () => {
    const { store } = await renderApp({ projects: [PROJECT] });
    store.currentItem.itemId = idOf(store, REVIEW);
    await expect.element(home()).toBeVisible();
    await userEvent.keyboard("{Control>}f{/Control}");
    await page.getByRole("searchbox", { name: "Search text" }).fill("release");
    await userEvent.keyboard("{Enter}");

    await page.getByTestId("search-result-row").filter({ hasText: REVIEW }).click({
      button: "right",
    });

    await expect.element(clearItem()).not.toBeInTheDocument();
    await setItem().click();
    expect(store.calls.filter((call) => call === "SetCurrentItem")).toHaveLength(1);
    expect(stored(store)).toBe(idOf(store, REVIEW));
  });
});
