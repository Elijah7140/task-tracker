import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { renderApp } from "../support/render-app.js";

const panel = () => page.getByRole("dialog", { name: "Reminders" });
const editor = () => page.getByRole("dialog", { name: "Edit item" });

/** Stands in for the preload bridge and lets the test click a notification. */
function stubNotificationBridge() {
  const listeners = new Set<(activation: unknown) => void>();
  vi.stubGlobal("taskTrackerDesktop", {
    openExternalLink: async () => false,
    onReminderActivated: (listener: (activation: unknown) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return {
    activate: (activation: unknown) => listeners.forEach((listener) => listener(activation)),
    listenerCount: () => listeners.size,
  };
}

async function openApp() {
  const app = await renderApp({
    projects: [
      { name: "Operations", items: [{ title: "Call the supplier", dueDate: "2026-11-13" }] },
    ],
  });
  await expect.element(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  return app;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useReminderActivation", () => {
  it("Opens the item a clicked single-reminder notification names", async () => {
    const bridge = stubNotificationBridge();
    const { store, history } = await openApp();
    const projectId = store.summaries[0]!.project.id;
    const { item } = store.findItemByTitle(projectId, null, "Call the supplier")!;

    bridge.activate({ itemId: item.id.toLowerCase() });

    await expect.element(editor()).toBeVisible();
    await expect
      .element(editor().getByRole("textbox", { name: "Title" }))
      .toHaveValue("Call the supplier");
    expect(history.location.pathname).toBe(`/projects/${projectId}`);
  });

  it("Opens the reminders panel for a grouped notification", async () => {
    const bridge = stubNotificationBridge();
    await openApp();

    bridge.activate({ itemId: null });

    await expect.element(panel()).toBeVisible();
  });

  it("Ignores an activation that is not a reminder", async () => {
    const bridge = stubNotificationBridge();
    await openApp();

    bridge.activate({ itemId: "not-a-guid" });
    bridge.activate("open everything");

    await expect.element(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
    expect(panel().query()).toBeNull();
    expect(editor().query()).toBeNull();
    expect(bridge.listenerCount()).toBe(1);
  });
});
