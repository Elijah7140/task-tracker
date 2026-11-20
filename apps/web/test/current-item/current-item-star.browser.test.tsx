import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import type { FakeProjectStore, SeedProject } from "../support/fake-task-tracker-server.js";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const REVIEW = "Review release notes";
const CHECK = "Check links";

const PROJECT: SeedProject = {
  name: "Release",
  items: [
    {
      title: REVIEW,
      priority: "High",
      dueDate: "2026-11-20",
      description: "Check the migration steps and the rollback plan before Friday.",
      children: [{ title: CHECK }, { title: "Update changelog" }],
    },
    { title: "Plan retro", priority: "Medium" },
  ],
};

const item = (title: string) => page.getByRole("treeitem", { name: title, exact: true });
const star = (title: string) => item(title).getByTestId("item-card-current").first();
const idOf = (store: FakeProjectStore, title: string) =>
  store.findItemByTitle(store.summaries[0]!.project.id, null, title)!.item.id;

async function openWorkspace(configure?: (store: FakeProjectStore) => void) {
  const app = await renderApp({ projects: [PROJECT], ...(configure ? { configure } : {}) });
  await page.getByRole("article", { name: "Release" }).click();
  await expect.element(item(REVIEW)).toBeVisible();
  return app;
}

describe("card star", () => {
  it("Clicking the star makes the item current and clicking it again clears it", async () => {
    const { store } = await openWorkspace();
    await item(REVIEW).getByTestId("item-title").first().hover();

    await star(REVIEW).click();

    await expect.element(star(REVIEW)).toHaveAttribute("aria-pressed", "true");
    await expect.element(star(REVIEW)).toHaveAccessibleName(`Clear current item ${REVIEW}`);
    expect(store.currentItem.itemId).toBe(idOf(store, REVIEW));
    await star(REVIEW).click();
    await expect.element(star(REVIEW)).toHaveAttribute("aria-pressed", "false");
    expect(store.currentItem.itemId).toBeNull();
  });

  it("Choosing another card moves the star and does not select or open the card", async () => {
    const { store } = await openWorkspace((fake) => {
      fake.currentItem.itemId = idOf(fake, REVIEW);
    });
    await expect.element(star(REVIEW)).toHaveAttribute("aria-pressed", "true");
    await item("Plan retro").getByTestId("item-title").first().hover();

    await star("Plan retro").click();

    await expect.element(star("Plan retro")).toHaveAttribute("aria-pressed", "true");
    await expect.element(star(REVIEW)).toHaveAttribute("aria-pressed", "false");
    await expect.element(page.getByTestId("item-editor-title")).not.toBeInTheDocument();
    expect(store.currentItem.itemId).toBe(idOf(store, "Plan retro"));
  });

  it("A deleted current item loses its star and gets it back when it is restored", async () => {
    const { store } = await openWorkspace((fake) => {
      fake.currentItem.itemId = idOf(fake, REVIEW);
    });
    await expect.element(star(REVIEW)).toHaveAttribute("aria-pressed", "true");

    await item(REVIEW).getByTestId("item-title").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByTestId("confirm-dialog-confirm").click();
    await expect.element(item(REVIEW)).not.toBeInTheDocument();
    await page.getByTestId("item-undo-button").click();

    await expect.element(star(REVIEW)).toHaveAttribute("aria-pressed", "true");
    expect(store.currentItem.itemId).toBe(idOf(store, REVIEW));
  });
});

describe("sub-item marker", () => {
  it("Only the current sub-item row shows the star marker", async () => {
    await openWorkspace((fake) => {
      const parent = fake.findItemByTitle(fake.summaries[0]!.project.id, null, REVIEW)!;
      fake.currentItem.itemId = parent.children.find(
        (child) => child.item.title === CHECK,
      )!.item.id;
    });

    await expect.element(item(CHECK).getByTestId("item-current-marker")).toBeVisible();

    await expect.element(item(CHECK).getByRole("img", { name: "Current item" })).toBeVisible();
    expect(page.getByTestId("item-current-marker").elements()).toHaveLength(1);
    await expect.element(star(REVIEW)).toHaveAttribute("aria-pressed", "false");
  });
});

describe.each(THEMES)("%s theme", (theme) => {
  it("The current card's star matches the baseline", async () => {
    await openWorkspace((fake) => {
      const parent = fake.findItemByTitle(fake.summaries[0]!.project.id, null, REVIEW)!;
      fake.currentItem.itemId = parent.item.id;
    });
    await expect.element(star(REVIEW)).toHaveAttribute("aria-pressed", "true");

    await settleTheme(theme);

    await expect
      .element(page.getByTestId("app-shell"))
      .toMatchScreenshot(`workspace-current-item-${theme}`);
  });

  it("A current sub-item's marker matches the baseline", async () => {
    await openWorkspace((fake) => {
      const parent = fake.findItemByTitle(fake.summaries[0]!.project.id, null, REVIEW)!;
      fake.currentItem.itemId = parent.children.find(
        (child) => child.item.title === CHECK,
      )!.item.id;
    });
    await expect.element(item(CHECK).getByTestId("item-current-marker")).toBeVisible();

    await settleTheme(theme);

    await expect
      .element(item(REVIEW).getByTestId("item-row").first())
      .toMatchScreenshot(`workspace-current-sub-item-${theme}`);
  });
});
