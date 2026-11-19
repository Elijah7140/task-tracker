import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const itemTypesCard = () => page.getByTestId("lookup-list-item-types");
const priorityLevelsCard = () => page.getByTestId("lookup-list-priority-levels");

const activeRows = (card: ReturnType<typeof itemTypesCard>) => card.getByTestId("lookup-row");

const rowIn = (card: ReturnType<typeof itemTypesCard>, name: string) =>
  card.getByRole("listitem", { name, exact: true });

async function openLookups(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({ path: "/settings", ...options });
  await expect.element(itemTypesCard()).toBeVisible();
  await expect.element(priorityLevelsCard()).toBeVisible();
  return app;
}

describe("LookupListCard", () => {
  it("Adds an item type with Enter and a priority level with Add, clearing each input", async () => {
    const { store } = await openLookups();

    await itemTypesCard().getByTestId("lookup-new-name").fill("Review");
    await userEvent.keyboard("{Enter}");

    await expect.element(rowIn(itemTypesCard(), "Review")).toBeVisible();
    await expect.element(itemTypesCard().getByTestId("lookup-new-name")).toHaveValue("");
    expect(store.settingsAndLookups.itemTypeNames()).toEqual([
      "Change",
      "Error",
      "Discussion",
      "Review",
    ]);

    await priorityLevelsCard().getByTestId("lookup-new-name").fill("Urgent");
    await priorityLevelsCard().getByTestId("lookup-add").click();

    await expect.element(rowIn(priorityLevelsCard(), "Urgent")).toBeVisible();
    await expect.element(priorityLevelsCard().getByTestId("lookup-new-name")).toHaveValue("");
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual([
      "Critical",
      "High",
      "Medium",
      "Low",
      "Urgent",
    ]);
  });

  it("Rejects duplicate and blank names with a dialog while keeping the typed text", async () => {
    const { store } = await openLookups();
    const input = itemTypesCard().getByTestId("lookup-new-name");

    await input.fill("change");
    await userEvent.keyboard("{Enter}");

    const alert = page.getByRole("alertdialog", { name: "Lookup validation" });
    await expect
      .element(alert)
      .toHaveAccessibleDescription("The name 'change' is already used by another item type.");
    await page.getByTestId("message-dialog-ok").click();
    await expect.element(input).toHaveValue("change");
    expect(store.settingsAndLookups.itemTypeNames()).toEqual(["Change", "Error", "Discussion"]);

    await input.fill("   ");
    await itemTypesCard().getByTestId("lookup-add").click();

    await expect
      .element(page.getByRole("alertdialog", { name: "Lookup validation" }))
      .toHaveAccessibleDescription("Name must be 1 to 300 characters.");
    await page.getByTestId("message-dialog-ok").click();
    await expect.element(input).toHaveValue("   ");
  });

  it("Renames a lookup through the prompt dialog and ignores Escape cancel", async () => {
    const { store } = await openLookups({
      configure: (appStore) => {
        appStore.settingsAndLookups.addItemTypeSeed("Review");
      },
    });

    await rowIn(itemTypesCard(), "Review").getByTestId("lookup-rename").click();
    await expect.element(page.getByRole("dialog", { name: "Rename item type" })).toBeVisible();
    await userEvent.keyboard("{Escape}");

    expect(store.calls).not.toContain("RenameItemType");
    await expect.element(rowIn(itemTypesCard(), "Review")).toBeVisible();

    await rowIn(itemTypesCard(), "Review").getByTestId("lookup-rename").click();
    await userEvent.keyboard("Approval{Enter}");

    await expect.element(rowIn(itemTypesCard(), "Approval")).toBeVisible();
    expect(store.settingsAndLookups.itemTypeNames()).toContain("Approval");
    expect(store.settingsAndLookups.itemTypeNames()).not.toContain("Review");
  });

  it("Keeps the rename prompt open with Enter a name when the new name is blank", async () => {
    const { store } = await openLookups();

    await rowIn(itemTypesCard(), "Error").getByTestId("lookup-rename").click();
    await userEvent.keyboard("{Backspace}{Enter}");

    await expect
      .element(page.getByTestId("prompt-dialog-error"))
      .toHaveTextContent("Enter a name.");
    await expect.element(page.getByTestId("prompt-dialog-submit")).toBeDisabled();
    expect(store.calls).not.toContain("RenameItemType");
  });

  it("Ignores a second Move up click while the first move is still saving", async () => {
    const { store } = await openLookups();
    const moveUp = () => rowIn(priorityLevelsCard(), "Low").getByTestId("lookup-move-up");

    await moveUp().dblClick();

    await expect.element(activeRows(priorityLevelsCard()).nth(2)).toHaveAccessibleName("Low");
    await expect.element(moveUp()).not.toHaveAttribute("aria-disabled", "true");
    expect(store.calls.filter((call) => call === "ReorderPriorityLevels")).toHaveLength(1);
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual([
      "Critical",
      "High",
      "Low",
      "Medium",
    ]);

    await moveUp().click();

    await expect.element(activeRows(priorityLevelsCard()).nth(1)).toHaveAccessibleName("Low");
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual([
      "Critical",
      "Low",
      "High",
      "Medium",
    ]);
  });

  it("Disables boundary move buttons and reorders priorities while preserving archived IDs", async () => {
    const { store } = await openLookups({
      configure: (appStore) => {
        appStore.settingsAndLookups.addPriorityLevelSeed("Retired", { isArchived: true });
      },
    });

    await expect
      .element(rowIn(priorityLevelsCard(), "Critical").getByTestId("lookup-move-up"))
      .toBeDisabled();
    await expect
      .element(rowIn(priorityLevelsCard(), "Low").getByTestId("lookup-move-down"))
      .toBeDisabled();

    await rowIn(priorityLevelsCard(), "High").getByTestId("lookup-move-up").click();

    await expect.element(activeRows(priorityLevelsCard()).nth(0)).toHaveAccessibleName("High");
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual([
      "High",
      "Critical",
      "Medium",
      "Low",
    ]);
    expect(store.settingsAndLookups.priorityLevelNames(true)).toContain("Retired");

    await rowIn(priorityLevelsCard(), "High").getByTestId("lookup-move-down").click();

    await expect.element(activeRows(priorityLevelsCard()).nth(0)).toHaveAccessibleName("Critical");
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual([
      "Critical",
      "High",
      "Medium",
      "Low",
    ]);
  });

  it("Reorders a focused lookup row with Alt+ArrowUp and Alt+ArrowDown", async () => {
    const { store } = await openLookups();
    const row = rowIn(priorityLevelsCard(), "Medium");
    row.element().focus();
    await expect.element(row).toHaveFocus();

    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");

    await expect.element(activeRows(priorityLevelsCard()).nth(1)).toHaveAccessibleName("Medium");
    await expect.element(rowIn(priorityLevelsCard(), "Medium")).toHaveFocus();
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual([
      "Critical",
      "Medium",
      "High",
      "Low",
    ]);

    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");

    await expect.element(activeRows(priorityLevelsCard()).nth(2)).toHaveAccessibleName("Medium");
    await expect.element(rowIn(priorityLevelsCard(), "Medium")).toHaveFocus();
  });

  it("Reorders rows by dragging the drag handle to another row", async () => {
    const { store } = await openLookups({
      configure: (appStore) => {
        appStore.settingsAndLookups.addPriorityLevelSeed("Retired", { isArchived: true });
      },
    });
    const sourceHandle = rowIn(priorityLevelsCard(), "Low").getByTestId("lookup-drag-handle");
    const targetRow = rowIn(priorityLevelsCard(), "Critical");

    await userEvent.dragAndDrop(sourceHandle, targetRow);

    await expect.element(activeRows(priorityLevelsCard()).nth(0)).toHaveAccessibleName("Low");
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual([
      "Low",
      "Critical",
      "High",
      "Medium",
    ]);
    expect(store.settingsAndLookups.priorityLevelNames(true)).toContain("Retired");
  });

  it("Archives and restores custom types and priority levels", async () => {
    const { store } = await openLookups({
      configure: (appStore) => {
        appStore.settingsAndLookups.addItemTypeSeed("Review");
      },
    });

    await rowIn(itemTypesCard(), "Review").getByTestId("lookup-archive").click();

    const archived = itemTypesCard().getByTestId("lookup-archived-section");
    await expect.element(archived).toBeVisible();
    await expect
      .element(archived.getByTestId("lookup-archived-row"))
      .toHaveAccessibleName("Review");
    expect(store.settingsAndLookups.itemTypeNames()).toEqual(["Change", "Error", "Discussion"]);

    await archived.getByTestId("lookup-restore").click();

    await expect.element(archived).not.toBeInTheDocument();
    await expect.element(rowIn(itemTypesCard(), "Review")).toBeVisible();
    expect(store.settingsAndLookups.itemTypeNames()).toContain("Review");

    await rowIn(priorityLevelsCard(), "Low").getByTestId("lookup-archive").click();

    await expect
      .element(priorityLevelsCard().getByTestId("lookup-archived-row"))
      .toHaveAccessibleName("Low");
    await priorityLevelsCard()
      .getByTestId("lookup-archived-section")
      .getByTestId("lookup-restore")
      .click();
    await expect.element(rowIn(priorityLevelsCard(), "Low")).toBeVisible();
  });

  it("Disables archiving built-in item types with an explanatory tooltip", async () => {
    const { store } = await openLookups();
    const archiveButton = rowIn(itemTypesCard(), "Change").getByTestId("lookup-archive");

    await expect.element(archiveButton).toHaveAttribute("aria-disabled", "true");
    await userEvent.hover(archiveButton);

    await expect
      .element(page.getByTestId("lookup-archive-tooltip"))
      .toHaveTextContent("Built-in types can't be archived");

    await archiveButton.click({ force: true });
    expect(store.calls).not.toContain("ArchiveItemType");
    await expect
      .element(itemTypesCard().getByTestId("lookup-archived-section"))
      .not.toBeInTheDocument();
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed lookup list baseline", async () => {
      await openLookups({
        configure: (appStore) => {
          appStore.settingsAndLookups.addPriorityLevelSeed("Deferred", { isArchived: true });
        },
      });

      await settleTheme(theme);

      await expect.element(priorityLevelsCard()).toMatchScreenshot(`lookup-list-${theme}`);
    });
  });
});
