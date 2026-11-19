import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Page } from "playwright";
import { expect } from "vitest";
import {
  desktopTest,
  phase3Fixture,
  usePhase3Fixture,
  withDesktop,
} from "./support/desktop-app.js";
import {
  expandCompleted,
  expectFocused,
  folderRow,
  isCompleted,
  itemRow,
  itemTree,
  openProject,
  projectCard,
} from "./support/workflows.js";

const PROJECT = "Sample project";
const AREA = "Nested folder";

async function fixtureHash() {
  return createHash("sha256")
    .update(await readFile(phase3Fixture))
    .digest("hex");
}

/** Opens the fixture's nested folder and shows its completed parent and sub-items. */
async function openFixtureItems(page: Page, parentTitle: string) {
  await openProject(page, PROJECT);
  await folderRow(page, PROJECT, AREA).getByTestId("folder-row").first().click();
  await expandCompleted(itemTree(page, AREA), "Completed (1)");
  const parent = itemRow(page, AREA, parentTitle);
  await parent.getByTestId("item-toggle").first().click();
  await expandCompleted(parent, "1 completed");
  return parent;
}

desktopTest(
  "Reads and edits a disposable copy of the Phase 3 EF fixture across relaunch",
  async ({ desktop }) => {
    const originalHash = await fixtureHash();
    await usePhase3Fixture(desktop);

    await withDesktop(desktop, async (page) => {
      await projectCard(page, PROJECT).waitFor();
      const parent = await openFixtureItems(page, "Sample parent");

      expect(await folderRow(page, PROJECT, AREA).getAttribute("aria-level")).toBe("2");
      expect(await isCompleted(parent)).toBe("true");
      expect(await isCompleted(itemRow(page, AREA, "Sample child"))).toBe("true");
      expect(await itemRow(page, AREA, "Deleted child").count()).toBe(0);

      await parent.getByTestId("item-row").first().click({ button: "right" });
      await page.getByTestId("item-context-menu").getByRole("menuitem", { name: "Rename" }).click();
      await expectFocused(page.getByRole("textbox", { name: "Title" }));
      await page.getByRole("textbox", { name: "Title" }).fill("Renamed parent");
      await page.keyboard.press("Enter");
      await itemRow(page, AREA, "Renamed parent").waitFor();
    });

    await withDesktop(desktop, async (page) => {
      const parent = await openFixtureItems(page, "Renamed parent");

      expect(await isCompleted(parent)).toBe("true");
      expect(await isCompleted(itemRow(page, AREA, "Sample child"))).toBe("true");
      expect(await itemRow(page, AREA, "Sample parent").count()).toBe(0);
    });
    expect(await fixtureHash()).toBe(originalHash);
    expect(existsSync(`${phase3Fixture}-wal`)).toBe(false);
    expect(existsSync(`${phase3Fixture}-shm`)).toBe(false);
  },
);
