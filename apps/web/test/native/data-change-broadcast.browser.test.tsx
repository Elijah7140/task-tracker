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

/** Collects what other windows would hear on the shared channel. */
function listen() {
  const channel = new BroadcastChannel("task-tracker:data-changed");
  const messages: Array<unknown> = [];
  channel.onmessage = (event) => messages.push(event.data);
  return { messages, close: () => channel.close() };
}

describe("data change broadcast", () => {
  it("Another window's announcement reloads item data", async () => {
    const { store } = await openWorkspace();
    const projectId = store.summaries[0]!.project.id;
    const { item: task } = store.findItemByTitle(projectId, null, TASK)!;
    store.patchItem(task.id, { description: "Written from the tray card." });

    announceDataChanged();

    await expect
      .element(item().getByTestId("item-card-description"))
      .toHaveTextContent("Written from the tray card.");
  });

  it("A recorded write in the main window tells the other windows", async () => {
    await openWorkspace();
    const channel = listen();

    await item().getByTestId("item-completion").first().click();

    await expect.poll(() => channel.messages).toEqual(["changed"]);
    channel.close();
  });

  it("Opening the main window announces nothing", async () => {
    const channel = listen();

    await openWorkspace();

    expect(channel.messages).toEqual([]);
    channel.close();
  });
});
