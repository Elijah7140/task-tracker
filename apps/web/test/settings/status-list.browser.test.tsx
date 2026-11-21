import { expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const card = () => page.getByTestId("lookup-list-statuses");

it("Adds a Done status, reorders it and archives and restores a status", async () => {
  await renderApp({ path: "/settings" });

  await card().getByRole("textbox", { name: "New status name" }).fill("Released");
  await card().getByRole("combobox", { name: "Status kind" }).click();
  await page.getByRole("option", { name: "Done", exact: true }).click();
  await card().getByRole("button", { name: "Add", exact: true }).click();
  const released = card().getByRole("listitem", { name: "Released" });
  await expect.element(released.getByTestId("lookup-row-detail")).toHaveTextContent("· Done");
  await released.getByRole("button", { name: "Move Released up" }).click();
  await expect.element(card().getByTestId("lookup-row").nth(3)).toHaveAccessibleName("Released");
  await card().getByRole("button", { name: "Archive Completed" }).click();
  await card().getByRole("button", { name: "Archive Released" }).click();

  await expect
    .element(page.getByRole("alertdialog", { name: "Status validation" }))
    .toHaveAccessibleDescription("At least one Done status must stay active.");
  await page.getByTestId("message-dialog-ok").click();
  await card().getByRole("button", { name: "Restore Completed" }).click();

  await expect.element(card().getByRole("button", { name: "Archive Completed" })).toBeVisible();
});

it("Marks Open statuses In progress with a click or Space, and Done statuses have no box", async () => {
  const { store } = await renderApp({ path: "/settings" });
  const testing = card().getByRole("checkbox", { name: "Testing is in progress" });
  const seeded = card().getByRole("checkbox", { name: "In progress is in progress" });
  await expect.element(seeded).toBeChecked();

  await testing.click();
  await expect.element(testing).toBeChecked();
  (seeded.element() as HTMLElement).focus();
  await userEvent.keyboard(" ");

  await expect.element(seeded).not.toBeChecked();
  const marked = store.statuses.rows.filter((row) => row.isInProgress).map((row) => row.name);
  expect(marked).toEqual(["Testing"]);
  await expect
    .element(card().getByRole("checkbox", { name: "Completed is in progress" }))
    .not.toBeInTheDocument();
});

it("Shows restore guidance when adding or renaming to an archived status name", async () => {
  await renderApp({ path: "/settings" });
  const input = card().getByRole("textbox", { name: "New status name" });
  const alert = page.getByRole("alertdialog", { name: "Status validation" });

  await input.fill("Blocked");
  await card().getByRole("button", { name: "Add", exact: true }).click();
  await expect.element(card().getByRole("listitem", { name: "Blocked" })).toBeVisible();
  await card().getByRole("button", { name: "Archive Blocked" }).click();

  await input.fill("blocked");
  await card().getByRole("button", { name: "Add", exact: true }).click();

  await expect
    .element(alert)
    .toHaveAccessibleDescription(
      "The name 'blocked' is used by an archived status. Restore it instead.",
    );
  await page.getByTestId("message-dialog-ok").click();
  await expect.element(input).toHaveValue("blocked");

  await card().getByRole("button", { name: "Rename Queued" }).click();
  await userEvent.keyboard("blocked{Enter}");

  await expect
    .element(alert)
    .toHaveAccessibleDescription(
      "The name 'blocked' is used by an archived status. Restore or rename that one first.",
    );
  await page.getByTestId("message-dialog-ok").click();
});

for (const theme of THEMES) {
  it(`Shows the status settings in ${theme} mode`, async () => {
    await renderApp({ path: "/settings" });
    await expect.element(card()).toBeVisible();
    await settleTheme(theme);

    await expect.element(card()).toMatchScreenshot(`status-settings-${theme}`);
  });
}
