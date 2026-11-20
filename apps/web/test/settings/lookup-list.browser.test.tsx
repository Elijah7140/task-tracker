import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { openMenu } from "../support/menu-bar.js";
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
    // Keep the first move saving until both clicks land, however slowly they arrive.
    const release = store.hold("ReorderPriorityLevels");

    await moveUp().dblClick();
    release();

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

  it("Shows restore guidance when adding or renaming to an archived lookup name", async () => {
    const { store } = await openLookups({
      configure: (appStore) => {
        appStore.settingsAndLookups.addItemTypeSeed("Review", { isArchived: true });
        appStore.settingsAndLookups.addPriorityLevelSeed("Later", { isArchived: true });
      },
    });
    const alert = page.getByRole("alertdialog", { name: "Lookup validation" });
    const typeInput = itemTypesCard().getByTestId("lookup-new-name");

    await typeInput.fill("review");
    await itemTypesCard().getByTestId("lookup-add").click();

    await expect
      .element(alert)
      .toHaveAccessibleDescription(
        "The name 'review' is used by an archived item type. Restore it instead.",
      );
    await page.getByTestId("message-dialog-ok").click();
    await expect.element(typeInput).toHaveValue("review");
    expect(store.settingsAndLookups.itemTypeNames()).toEqual(["Change", "Error", "Discussion"]);

    await rowIn(priorityLevelsCard(), "Low").getByTestId("lookup-rename").click();
    await userEvent.keyboard("LATER{Enter}");

    await expect
      .element(alert)
      .toHaveAccessibleDescription(
        "The name 'LATER' is used by an archived priority level. Restore or rename that one first.",
      );
    await page.getByTestId("message-dialog-ok").click();
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual([
      "Critical",
      "High",
      "Medium",
      "Low",
    ]);
  });

  it("Reorders active priority levels cleanly when archived levels come first or between them", async () => {
    const { store } = await openLookups();

    await rowIn(priorityLevelsCard(), "High").getByTestId("lookup-archive").click();
    await rowIn(priorityLevelsCard(), "Critical").getByTestId("lookup-move-down").click();

    await expect.element(activeRows(priorityLevelsCard()).nth(0)).toHaveAccessibleName("Medium");
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual(["Medium", "Critical", "Low"]);

    await rowIn(priorityLevelsCard(), "Medium").getByTestId("lookup-archive").click();
    await rowIn(priorityLevelsCard(), "Low").getByTestId("lookup-move-up").click();

    await expect.element(activeRows(priorityLevelsCard()).nth(0)).toHaveAccessibleName("Low");
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual(["Low", "Critical"]);
    await expect
      .element(page.getByRole("alertdialog", { name: "Lookup validation" }))
      .not.toBeInTheDocument();
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed lookup list baseline", async () => {
      await openLookups({
        configure: (appStore) => {
          appStore.settingsAndLookups.addPriorityLevelSeed("", { number: 7 });
          appStore.settingsAndLookups.addPriorityLevelSeed("Hotfix", { number: 2 });
          appStore.settingsAndLookups.addPriorityLevelSeed("Deferred", { isArchived: true });
        },
      });

      await settleTheme(theme);

      await expect.element(priorityLevelsCard()).toMatchScreenshot(`lookup-list-${theme}`);
    });
  });
});

describe("Priority numbers", () => {
  const numberInput = (name: string) =>
    rowIn(priorityLevelsCard(), name).getByTestId("priority-number");
  const alert = () => page.getByRole("alertdialog", { name: "Lookup validation" });

  async function saveNumber(name: string, number: string) {
    await numberInput(name).fill(number);
    await userEvent.keyboard("{Enter}");
  }

  it("Saves numbers 1, 7 and 2 on ranks 1 to 3 without changing the order", async () => {
    const { store } = await openLookups();

    await saveNumber("Critical", "1");
    await expect.element(rowIn(priorityLevelsCard(), "1 · Critical")).toBeVisible();
    await saveNumber("High", "7");
    await expect.element(rowIn(priorityLevelsCard(), "7 · High")).toBeVisible();
    await saveNumber("Medium", "2");

    await expect.element(rowIn(priorityLevelsCard(), "2 · Medium")).toBeVisible();
    await expect
      .element(activeRows(priorityLevelsCard()).first())
      .toHaveAccessibleName("1 · Critical");
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual([
      "Critical",
      "High",
      "Medium",
      "Low",
    ]);
    expect(store.settingsAndLookups.priorityLevels.map(({ number }) => number)).toEqual([
      1,
      7,
      2,
      null,
    ]);
  });

  it("Adds a number-only level and clears a numbered level's name through rename", async () => {
    const { store } = await openLookups();
    const card = priorityLevelsCard();

    await card.getByTestId("priority-new-number").fill("9");
    await card.getByTestId("lookup-add").click();
    await expect.element(rowIn(card, "9")).toBeVisible();
    await card.getByTestId("lookup-new-name").fill("Hotfix");
    await card.getByTestId("priority-new-number").fill("8");
    await userEvent.keyboard("{Enter}");
    await rowIn(card, "8 · Hotfix").getByTestId("lookup-rename").click();
    await page.getByRole("textbox", { name: "Name" }).fill("");
    await userEvent.keyboard("{Enter}");

    await expect.element(rowIn(card, "8")).toBeVisible();
    await expect.element(card.getByTestId("lookup-new-name")).toHaveValue("");
    await expect.element(card.getByTestId("priority-new-number")).toHaveValue("");
    expect(store.settingsAndLookups.priorityLevels.slice(-2)).toMatchObject([
      { name: "", number: 9, label: "9" },
      { name: "", number: 8, label: "8" },
    ]);
  });

  it("Shows invalid and duplicate number messages and keeps the draft", async () => {
    await openLookups({
      configure: (store) => {
        store.settingsAndLookups.addPriorityLevelSeed("Hotfix", { number: 7 });
      },
    });

    await saveNumber("High", "1.5");
    await expect
      .element(alert())
      .toHaveAccessibleDescription(
        "Enter a whole priority number of at least 1, or leave it blank.",
      );
    await alert().getByRole("button", { name: "OK" }).click();
    await numberInput("High").fill("7");
    await rowIn(priorityLevelsCard(), "High").getByTestId("priority-save-number").click();

    await expect
      .element(alert())
      .toHaveAccessibleDescription("Priority number 7 is already in use.");
    await alert().getByRole("button", { name: "OK" }).click();
    await expect.element(numberInput("High")).toHaveValue("7");
  });

  it("Says to restore an archived priority when adding or renaming to its name", async () => {
    await openLookups({
      configure: (store) => {
        store.settingsAndLookups.addPriorityLevelSeed("Retired", { isArchived: true });
      },
    });
    const card = priorityLevelsCard();

    await card.getByTestId("lookup-new-name").fill("retired");
    await card.getByTestId("lookup-add").click();
    await expect
      .element(alert())
      .toHaveAccessibleDescription(
        "The name 'retired' is used by an archived priority level. Restore it instead.",
      );
    await alert().getByRole("button", { name: "OK" }).click();
    await rowIn(card, "High").getByTestId("lookup-rename").click();
    await page.getByRole("textbox", { name: "Name" }).fill("RETIRED");
    await userEvent.keyboard("{Enter}");

    await expect
      .element(alert())
      .toHaveAccessibleDescription(
        "The name 'RETIRED' is used by an archived priority level. Restore or rename that one first.",
      );
    await expect.element(card.getByTestId("lookup-new-name")).toHaveValue("retired");
  });

  it("Discards a number draft with Escape without saving", async () => {
    const { store } = await openLookups();

    await numberInput("High").fill("5");
    await userEvent.keyboard("{Escape}");

    await expect.element(numberInput("High")).toHaveValue("");
    await expect
      .element(rowIn(priorityLevelsCard(), "High").getByTestId("priority-save-number"))
      .toBeDisabled();
    expect(store.calls).not.toContain("SetPriorityNumber");
  });

  it("Blocks application undo while an unsaved number remains after leaving the input", async () => {
    const { store } = await openLookups();
    await saveNumber("High", "7");
    await expect.element(rowIn(priorityLevelsCard(), "7 · High")).toBeVisible();
    await numberInput("7 · High").fill("42");
    await userEvent.keyboard("{Tab}");

    await userEvent.keyboard("{Control>}z{/Control}");

    const message = page.getByRole("alertdialog", { name: "Undo and redo" });
    await expect
      .element(message)
      .toHaveAccessibleDescription("Save or discard your settings before undoing or redoing.");
    await message.getByRole("button", { name: "OK" }).click();
    await expect.element(numberInput("7 · High")).toHaveValue("42");
    expect(store.calls).not.toContain("ApplyHistory");
  });
});

describe("Priority list history", () => {
  it("Ctrl+Z restores a priority after archiving it in App Settings", async () => {
    const { store } = await openLookups();
    await rowIn(priorityLevelsCard(), "Low").getByTestId("lookup-archive").click();
    await expect
      .element(priorityLevelsCard().getByRole("listitem", { name: "Low", exact: true }))
      .toHaveAttribute("data-testid", "lookup-archived-row");

    await userEvent.keyboard("{Control>}z{/Control}");

    await expect
      .element(rowIn(priorityLevelsCard(), "Low"))
      .toHaveAttribute("data-testid", "lookup-row");
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual([
      "Critical",
      "High",
      "Medium",
      "Low",
    ]);
  });
});

describe("Item type list history", () => {
  it("Names an item type rename in the Edit menu and Ctrl+Z restores the old name", async () => {
    const { store } = await openLookups({
      configure: (appStore) => {
        appStore.settingsAndLookups.addItemTypeSeed("Review");
      },
    });
    await rowIn(itemTypesCard(), "Review").getByTestId("lookup-rename").click();
    await userEvent.keyboard("{Control>}a{/Control}Approval{Enter}");
    await expect.element(rowIn(itemTypesCard(), "Approval")).toBeVisible();

    await openMenu("edit");

    await expect
      .element(page.getByRole("menuitem", { name: "Undo: Rename item type 'Approval'" }))
      .toBeEnabled();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Control>}z{/Control}");
    await expect.element(rowIn(itemTypesCard(), "Review")).toBeVisible();
    expect(store.settingsAndLookups.itemTypeNames()).toContain("Review");
    await openMenu("edit");
    await expect
      .element(page.getByRole("menuitem", { name: "Redo: Rename item type 'Approval'" }))
      .toBeEnabled();
  });

  it("Redoes an item type archive from the Edit menu and shows it archived again", async () => {
    await openLookups({
      configure: (appStore) => {
        appStore.settingsAndLookups.addItemTypeSeed("Review");
      },
    });
    await rowIn(itemTypesCard(), "Review").getByTestId("lookup-archive").click();
    await expect
      .element(rowIn(itemTypesCard(), "Review"))
      .toHaveAttribute("data-testid", "lookup-archived-row");
    await userEvent.keyboard("{Control>}z{/Control}");
    await expect
      .element(rowIn(itemTypesCard(), "Review"))
      .toHaveAttribute("data-testid", "lookup-row");

    await openMenu("edit");
    await page.getByRole("menuitem", { name: "Redo: Archive item type 'Review'" }).click();

    await expect
      .element(rowIn(itemTypesCard(), "Review"))
      .toHaveAttribute("data-testid", "lookup-archived-row");
  });
});
