import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { Locator, Page } from "playwright";
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
  openItemEditor,
  openProject,
  projectCard,
  saveItemEditor,
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

/** Reads all five legacy values, including the archived field and choice. */
async function expectFixtureValues(editor: Locator, estimate: string) {
  await editor.getByTestId("archived-fields").getByText("Notes", { exact: true }).waitFor();
  await editor.getByTestId("archived-field").getByText("Example text", { exact: true }).waitFor();
  expect(await editor.getByLabel("Estimate", { exact: true }).inputValue()).toBe(estimate);
  expect(await editor.getByLabel("Review date", { exact: true }).inputValue()).toBe("2026-12-08");
  expect(await editor.getByRole("combobox", { name: "Reviewed" }).innerText()).toBe("No");
  await expect
    .poll(() => editor.getByRole("combobox", { name: "Status" }).innerText())
    .toBe("Retired option (archived)");
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

      const editor = await openItemEditor(page, itemRow(page, AREA, "Sample child"));
      await expectFixtureValues(editor, "12.5");
      await editor.getByLabel("Estimate", { exact: true }).fill("17.25");
      await saveItemEditor(editor);

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
      const editor = await openItemEditor(page, itemRow(page, AREA, "Sample child"));
      await expectFixtureValues(editor, "17.25");
    });
    expect(await fixtureHash()).toBe(originalHash);
    expect(existsSync(`${phase3Fixture}-wal`)).toBe(false);
    expect(existsSync(`${phase3Fixture}-shm`)).toBe(false);
  },
);
