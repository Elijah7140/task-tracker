import { expect, it } from "vitest";
import { page } from "vitest/browser";
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

for (const theme of THEMES) {
  it(`Shows the status settings in ${theme} mode`, async () => {
    await renderApp({ path: "/settings" });
    await expect.element(card()).toBeVisible();
    await settleTheme(theme);

    await expect.element(card()).toMatchScreenshot(`status-settings-${theme}`);
  });
}
