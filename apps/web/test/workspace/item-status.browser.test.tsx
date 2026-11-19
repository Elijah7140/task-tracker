import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import {
  editor,
  itemRow,
  openEditor,
  openEditorWorkspace,
  pick,
} from "../support/item-editor-page.js";
import type { FakeProjectStore } from "../support/fake-task-tracker-server.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const TASK = "Review release notes";

const TESTING_ID = "019A0000-0000-7000-8000-000000000203";

const openWorkspace = (status?: "Testing", configure?: (store: FakeProjectStore) => void) =>
  openEditorWorkspace({
    ...(configure === undefined ? {} : { configure }),
    projects: [
      {
        name: "Billing DB",
        items: [
          {
            title: TASK,
            ...(status === undefined ? {} : { status }),
            children: [{ title: "Check wording" }],
          },
        ],
      },
    ],
  });

const choice = (name: string) => page.getByRole("menuitemradio", { name, exact: true });

async function openMenu() {
  await itemRow(TASK).getByTestId("item-row").first().click({ button: "right" });
  await page.getByTestId("item-menu-set-status").click();
  await expect.element(choice("Testing")).toBeVisible();
}

it("Selects a status by mouse and shows the stored value checked", async () => {
  await openWorkspace();
  await openMenu();
  await expect.element(choice("None")).toHaveAttribute("aria-checked", "true");

  await choice("Testing").click();

  await expect.element(itemRow(TASK).getByTestId("item-status-chip")).toHaveTextContent("Testing");
  await openMenu();
  await expect.element(choice("Testing")).toHaveAttribute("aria-checked", "true");
  await expect.element(choice("None")).toHaveAttribute("aria-checked", "false");
});

it("Lists an archived current status, checked, at its place in list order", async () => {
  await openWorkspace("Testing", (store) =>
    store.statuses.replace(TESTING_ID, { isArchived: true }),
  );
  await itemRow(TASK).getByTestId("item-row").first().click({ button: "right" });
  await page.getByTestId("item-menu-set-status").click();

  const archived = choice("Testing (archived)");
  await expect.element(archived).toHaveAttribute("aria-checked", "true");
  await expect
    .element(page.getByRole("menu").last())
    .toHaveTextContent("NoneQueuedIn progressTesting (archived)Completed");
});

it("Selects a status from the keyboard submenu", async () => {
  await openWorkspace();
  await itemRow(TASK).getByTestId("item-row").first().click();
  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
  await expect.element(page.getByTestId("item-menu-set-status")).toHaveFocus();

  await userEvent.keyboard("{ArrowRight}");
  await expect.element(choice("None")).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");

  await expect.element(itemRow(TASK).getByTestId("item-status-chip")).toHaveTextContent("Testing");
});

it("Keeps only the stored status checked after cancelling a Done cascade", async () => {
  await openWorkspace("Testing");
  await openMenu();

  await choice("Completed").click();
  await expect.element(page.getByRole("alertdialog", { name: "Complete sub-items" })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await openMenu();

  await expect.element(choice("Testing")).toHaveAttribute("aria-checked", "true");
  await expect.element(choice("Completed")).toHaveAttribute("aria-checked", "false");
});

it("Saves the status chosen in the editor", async () => {
  await openWorkspace();
  await openEditor(TASK);

  await pick("Workflow status", "In progress");
  await editor().getByTestId("item-editor-save").click();

  await expect
    .element(itemRow(TASK).getByTestId("item-status-chip"))
    .toHaveTextContent("In progress");
});

it("Confirms open sub-items before an editor save sets a Done status", async () => {
  const { store, projectId } = await openWorkspace("Testing");
  await openEditor(TASK);

  await pick("Workflow status", "Completed");
  await editor().getByTestId("item-editor-save").click();
  const prompt = page.getByRole("alertdialog", { name: "Complete sub-items" });
  await expect.element(prompt).toHaveAccessibleDescription("Also complete 1 open sub-item?");
  await prompt.getByRole("button", { name: "Complete" }).click();

  await expect.element(editor()).not.toBeInTheDocument();
  const stored = store.findItemByTitle(projectId, null, TASK)!.item;
  expect(stored.completedAtUtc).not.toBeNull();
  expect([stored.statusId, stored.reopenStatusId]).toEqual([
    "019A0000-0000-7000-8000-000000000204",
    TESTING_ID,
  ]);
});

it("Keeps the editor open with the draft after cancelling a Done cascade", async () => {
  const { store, projectId } = await openWorkspace("Testing");
  await openEditor(TASK);

  await pick("Workflow status", "Completed");
  await editor().getByTestId("item-editor-save").click();
  await page
    .getByRole("alertdialog", { name: "Complete sub-items" })
    .getByRole("button", { name: "Cancel" })
    .click();

  await expect
    .element(editor().getByRole("combobox", { name: "Workflow status" }))
    .toHaveTextContent("Completed");
  expect(store.findItemByTitle(projectId, null, TASK)!.item.completedAtUtc).toBeNull();
});

for (const theme of THEMES) {
  it(`Shows the editor status choices in ${theme} mode`, async () => {
    await openWorkspace("Testing");
    await openEditor(TASK);
    await settleTheme(theme);

    await editor().getByRole("combobox", { name: "Workflow status", exact: true }).click();
    await expect.element(page.getByRole("option", { name: "Testing", exact: true })).toBeVisible();

    await expect.element(page.getByTestId("app-shell")).toMatchScreenshot(`editor-status-${theme}`);
  });

  it(`Shows the checked status submenu in ${theme} mode`, async () => {
    await openWorkspace("Testing");
    await settleTheme(theme);
    await openMenu();

    await expect
      .element(page.getByTestId("app-shell"))
      .toMatchScreenshot(`workspace-status-menu-${theme}`);
  });
}
