import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { announceDataChanged } from "../../src/native/data-change-broadcast.js";
import { renderApp } from "../support/render-app.js";

const TASK = "Review release notes";
const item = () => page.getByRole("treeitem", { name: TASK, exact: true });

async function openWorkspace() {
  const app = await renderApp({ projects: [{ name: "Release", items: [{ title: TASK }] }] });
  await page.getByRole("article", { name: "Release" }).click();
  await expect.element(item()).toBeVisible();
  return app;
}

describe("data change broadcast", () => {
  it("Another window's announcement reloads item data and the current item", async () => {
    const { store } = await openWorkspace();
    const projectId = store.summaries[0]!.project.id;
    const { item: task } = store.findItemByTitle(projectId, null, TASK)!;
    store.currentItem.itemId = task.id;
    store.patchItem(task.id, { description: "Written from the tray card." });

    announceDataChanged();

    await expect
      .element(item().getByTestId("item-card-current").first())
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(item().getByTestId("item-card-description"))
      .toHaveTextContent("Written from the tray card.");
  });

  it("Choosing the current item tells the other windows", async () => {
    await openWorkspace();
    const channel = new BroadcastChannel("task-tracker:data-changed");
    const messages: Array<unknown> = [];
    channel.onmessage = (event) => messages.push(event.data);

    await item().getByTestId("item-title").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Set as current item" }).click();

    await expect.poll(() => messages).toEqual(["changed"]);
    channel.close();
  });
});
