import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp } from "../support/render-app.js";

const card = () => page.getByRole("article", { name: "Billing DB" });
const sidebarIcon = () =>
  page.getByTestId("sidebar").getByRole("link", { name: "Billing DB" }).getByTestId("project-icon");

async function openIconDialog() {
  await userEvent.hover(card());
  await card().getByTestId("project-card-menu").click();
  await page.getByTestId("project-change-icon").click();
  await expect.element(page.getByTestId("project-icon-dialog")).toBeVisible();
}

describe("ProjectIconDialog", () => {
  it("Shows a chosen icon on the Home card and in the sidebar", async () => {
    await renderApp({ projects: [{ name: "Billing DB" }] });
    await openIconDialog();

    await page.getByTestId("project-icon-database").click();

    await expect.element(page.getByTestId("project-icon-dialog")).not.toBeInTheDocument();
    await expect
      .element(card().getByTestId("project-icon"))
      .toHaveAttribute("data-icon", "database");
    await expect.element(sidebarIcon()).toHaveAttribute("data-icon", "database");
  });

  it("Goes back to the initial when Initial is chosen", async () => {
    await renderApp({ projects: [{ name: "Billing DB" }] });
    await openIconDialog();
    await page.getByTestId("project-icon-database").click();
    await expect
      .element(card().getByTestId("project-icon"))
      .toHaveAttribute("data-icon", "database");
    await openIconDialog();

    await page.getByTestId("project-icon-initial").click();

    await expect
      .element(card().getByTestId("project-icon"))
      .toHaveAttribute("data-icon", "initial");
    await expect.element(card().getByTestId("project-icon")).toHaveTextContent("B");
  });
});
