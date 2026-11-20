import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";

const card = () => page.getByTestId("ticket-lists-card");
const row = (name: string) => card().getByTestId("ticket-list-row").filter({ hasText: name });

async function add(testId: string, name: string) {
  await card().getByTestId(testId).fill(name);
  await userEvent.keyboard("{Enter}");
  await expect.element(row(name)).toBeVisible();
}

describe("TicketListsCard", () => {
  it("Adds a person and nests a module and interface under an application", async () => {
    await renderApp({ path: "/settings" });
    await expect.element(card()).toBeVisible();

    await add("ticket-list-new-person", "Elijah Harris");
    await add("ticket-list-new-application", "ClockTower");
    await add("ticket-list-new-module", "Train");
    await add("ticket-list-new-interface", "Conversion");

    await expect
      .element(card().getByTestId("ticket-list-person").getByText("Elijah Harris"))
      .toBeVisible();
    const modules = card().getByTestId("ticket-list-application").getByTestId("ticket-list-module");
    await expect.element(modules.getByText("Train", { exact: true })).toBeVisible();
    await expect
      .element(
        modules.getByTestId("ticket-list-interface").getByText("Conversion", { exact: true }),
      )
      .toBeVisible();
  });

  it("Renames an entry through the prompt and archives it with a Restore button", async () => {
    await renderApp({
      path: "/settings",
      configure: (store) => store.ticketFields.seed("TicketType", "D"),
    });
    await expect.element(row("D")).toBeVisible();

    await row("D").getByRole("button", { name: "Rename D" }).click();
    const name = page.getByRole("dialog").getByRole("textbox");
    await name.fill("Data change");
    await userEvent.keyboard("{Enter}");
    await row("Data change").getByRole("button", { name: "Archive Data change" }).click();

    await expect
      .element(row("Data change").getByRole("button", { name: "Restore Data change" }))
      .toBeVisible();
  });

  it("Saves the Adding items choices with the global defaults", async () => {
    const { store } = await renderApp({ path: "/settings" });
    await expect.element(page.getByTestId("global-ticket-add-details")).toBeVisible();

    await page.getByTestId("global-ticket-add-details").click();
    await page.getByTestId("save-global-settings").click();

    await expect.element(page.getByTestId("save-global-settings")).toBeDisabled();
    expect(store.settingsAndLookups.globalSettings.addOpensDetails).toEqual({
      todo: false,
      ticket: true,
    });
  });
});
