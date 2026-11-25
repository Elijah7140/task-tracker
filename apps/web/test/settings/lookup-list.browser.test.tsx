import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const priorityLevelsCard = () => page.getByTestId("lookup-list-priority-levels");

const activeRows = (card: ReturnType<typeof priorityLevelsCard>) => card.getByTestId("lookup-row");

const rowIn = (card: ReturnType<typeof priorityLevelsCard>, name: string) =>
  card.getByRole("listitem", { name, exact: true });

async function openLookups(options: Parameters<typeof renderApp>[0] = {}) {
  const app = await renderApp({ path: "/settings", ...options });
  await expect.element(priorityLevelsCard()).toBeVisible();
  return app;
}

describe("LookupListCard", () => {
  it("Has no item types list, which were removed (§12)", async () => {
    await openLookups();

    await expect.element(page.getByTestId("lookup-list-item-types")).not.toBeInTheDocument();
  });

  it("Adds a priority level with Enter and with Add, clearing the input", async () => {
    const { store } = await openLookups();
    const input = priorityLevelsCard().getByTestId("lookup-new-name");

    await input.fill("Review");
    await userEvent.keyboard("{Enter}");
    await expect.element(rowIn(priorityLevelsCard(), "Review")).toBeVisible();
    await expect.element(input).toHaveValue("");
    await input.fill("Urgent");
    await priorityLevelsCard().getByTestId("lookup-add").click();

    await expect.element(rowIn(priorityLevelsCard(), "Urgent")).toBeVisible();
    await expect.element(input).toHaveValue("");
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual([
      "Critical",
      "High",
      "Medium",
      "Low",
      "Review",
      "Urgent",
    ]);
  });

  it("Rejects duplicate and blank names with a dialog while keeping the typed text", async () => {
    const { store } = await openLookups();
    const input = priorityLevelsCard().getByTestId("lookup-new-name");

    await input.fill("high");
    await userEvent.keyboard("{Enter}");

    const alert = page.getByRole("alertdialog", { name: "Lookup validation" });
    await expect
      .element(alert)
      .toHaveAccessibleDescription("The name 'high' is already used by another priority level.");
    await page.getByTestId("message-dialog-ok").click();
    await expect.element(input).toHaveValue("high");
    expect(store.settingsAndLookups.priorityLevelNames()).toEqual([
      "Critical",
      "High",
      "Medium",
      "Low",
    ]);

    await input.fill("   ");
    await priorityLevelsCard().getByTestId("lookup-add").click();

    await expect
      .element(page.getByRole("alertdialog", { name: "Lookup validation" }))
      .toHaveAccessibleDescription("Name must be 1 to 300 characters.");
    await page.getByTestId("message-dialog-ok").click();
    await expect.element(input).toHaveValue("   ");
  });

  it("Renames a lookup through the prompt dialog and ignores Escape cancel", async () => {
    const { store } = await openLookups({
      configure: (appStore) => {
        appStore.settingsAndLookups.addPriorityLevelSeed("Review");
      },
    });

    await rowIn(priorityLevelsCard(), "Review").getByTestId("lookup-rename").click();
    await expect.element(page.getByRole("dialog", { name: "Rename priority level" })).toBeVisible();
    await userEvent.keyboard("{Escape}");

    expect(store.calls).not.toContain("RenamePriorityLevel");
    await expect.element(rowIn(priorityLevelsCard(), "Review")).toBeVisible();

    await rowIn(priorityLevelsCard(), "Review").getByTestId("lookup-rename").click();
    await userEvent.keyboard("Approval{Enter}");

    await expect.element(rowIn(priorityLevelsCard(), "Approval")).toBeVisible();
    expect(store.settingsAndLookups.priorityLevelNames()).toContain("Approval");
    expect(store.settingsAndLookups.priorityLevelNames()).not.toContain("Review");
  });

  it("Keeps the rename prompt open with Enter a name when the new name is blank", async () => {
    const { store } = await openLookups();

    await rowIn(priorityLevelsCard(), "High").getByTestId("lookup-rename").click();
    await userEvent.keyboard("{Backspace}{Enter}");

    await expect
      .element(page.getByTestId("prompt-dialog-error"))
      .toHaveTextContent("Enter a name.");
    await expect.element(page.getByTestId("prompt-dialog-submit")).toBeDisabled();
    expect(store.calls).not.toContain("RenamePriorityLevel");
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

  it("Archives and restores priority levels, built-in ones too", async () => {
    const { store } = await openLookups({
      configure: (appStore) => {
        appStore.settingsAndLookups.addPriorityLevelSeed("Review");
      },
    });

    await rowIn(priorityLevelsCard(), "Review").getByTestId("lookup-archive").click();

    const archived = priorityLevelsCard().getByTestId("lookup-archived-section");
    await expect.element(archived).toBeVisible();
    await expect
      .element(archived.getByTestId("lookup-archived-row"))
      .toHaveAccessibleName("Review");
    await archived.getByTestId("lookup-restore").click();
    await expect.element(archived).not.toBeInTheDocument();
    await expect.element(rowIn(priorityLevelsCard(), "Review")).toBeVisible();

    await rowIn(priorityLevelsCard(), "Low").getByTestId("lookup-archive").click();

    await expect
      .element(priorityLevelsCard().getByTestId("lookup-archived-row"))
      .toHaveAccessibleName("Low");
    await priorityLevelsCard()
      .getByTestId("lookup-archived-section")
      .getByTestId("lookup-restore")
      .click();
    await expect.element(rowIn(priorityLevelsCard(), "Low")).toBeVisible();
    expect(store.settingsAndLookups.priorityLevelNames()).toContain("Review");
  });

  it("Shows restore guidance when renaming to an archived lookup name", async () => {
    const { store } = await openLookups({
      configure: (appStore) => {
        appStore.settingsAndLookups.addPriorityLevelSeed("Later", { isArchived: true });
      },
    });
    const alert = page.getByRole("alertdialog", { name: "Lookup validation" });

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
