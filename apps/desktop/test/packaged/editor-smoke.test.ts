import type { Locator, Page } from "playwright";
import { expect } from "vitest";
import { desktopTest, withDesktop } from "../support/desktop-app.js";
import {
  SMOKE_PROJECT,
  addItem,
  createProject,
  expectGone,
  itemRow,
  openAppSettingsFromMenu,
  openItemEditor,
  openProject,
  saveItemEditor,
} from "../support/workflows.js";

const METADATA_ITEM = "Metadata item";
const fields = [
  { name: "Summary", type: "Text" },
  { name: "Effort", type: "Number" },
  { name: "Review date", type: "Date" },
  { name: "Approved", type: "Boolean" },
  { name: "Stage", type: "Choice" },
] as const;

async function pick(page: Page, control: Locator, option: string) {
  await control.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function createCustomFields(page: Page) {
  await openAppSettingsFromMenu(page);
  for (const { name, type } of fields) {
    await pick(page, page.getByTestId("field-new-type"), type);
    await page.getByTestId("field-new-name").fill(name);
    await page.getByTestId("field-add").click();
    await page.getByRole("listitem", { name, exact: true }).waitFor();
  }
  const status = page.getByRole("listitem", { name: "Stage", exact: true });
  const choices = status.getByTestId("field-choices-toggle");
  if ((await choices.getAttribute("aria-expanded")) === "false") {
    await choices.click();
  }
  await status.getByTestId("choice-new-label").fill("Ready");
  await status.getByTestId("choice-add").click();
  await status.getByRole("listitem", { name: "Ready", exact: true }).waitFor();
  await page.getByTestId("app-settings-back").click();
}

async function fillCustomFields(page: Page, editor: Locator) {
  await editor.getByLabel("Summary", { exact: true }).fill("Review database");
  await editor.getByLabel("Effort", { exact: true }).fill("12.5");
  await editor.getByLabel("Review date", { exact: true }).fill("2026-11-20");
  await pick(page, editor.getByRole("combobox", { name: "Approved" }), "Yes");
  await pick(page, editor.getByRole("combobox", { name: "Stage", exact: true }), "Ready");
}

desktopTest(
  "Creates all five custom field types and keeps their saved item values after relaunch",
  async ({ desktop }) => {
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await createCustomFields(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, METADATA_ITEM);

      const editor = await openItemEditor(page, itemRow(page, SMOKE_PROJECT, METADATA_ITEM));
      await fillCustomFields(page, editor);
      await saveItemEditor(editor);
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);
      const editor = await openItemEditor(page, itemRow(page, SMOKE_PROJECT, METADATA_ITEM));

      expect(await editor.getByLabel("Summary", { exact: true }).inputValue()).toBe(
        "Review database",
      );
      expect(await editor.getByLabel("Effort", { exact: true }).inputValue()).toBe("12.5");
      expect(await editor.getByLabel("Review date", { exact: true }).inputValue()).toBe(
        "2026-11-20",
      );
      expect(await editor.getByRole("combobox", { name: "Approved" }).innerText()).toBe("Yes");
      await expect
        .poll(() => editor.getByRole("combobox", { name: "Stage", exact: true }).innerText())
        .toBe("Ready");
    });
  },
  // Two launches and five field types take most of the default budget on a loaded runner.
  60_000,
);

desktopTest(
  "Saving an edited title updates the item row and the new title persists after relaunch",
  async ({ desktop }) => {
    const original = (page: Page) => itemRow(page, SMOKE_PROJECT, "Original title");
    const updated = (page: Page) => itemRow(page, SMOKE_PROJECT, "Updated title");
    await withDesktop(desktop, async (page) => {
      await createProject(page);
      await openProject(page);
      await addItem(page, SMOKE_PROJECT, "Original title");

      const editor = await openItemEditor(page, original(page));
      await editor.getByRole("textbox", { name: "Title", exact: true }).fill("Updated title");
      await saveItemEditor(editor);

      await updated(page).waitFor();
      await expectGone(original(page));
    });

    await withDesktop(desktop, async (page) => {
      await openProject(page);

      await updated(page).waitFor();
      expect(await original(page).count()).toBe(0);
    });
  },
);
