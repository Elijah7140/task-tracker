import { describe, expect, it } from "vitest";
import { createDialogStore } from "../../src/state/dialog-store.js";

const deleteOptions = {
  title: "Delete project",
  message: "Delete Billing and its contents?",
  confirmLabel: "Delete",
  tone: "danger",
} as const;

describe("createDialogStore", () => {
  it("Resolves a confirmation with the user's answer and closes it", async () => {
    const store = createDialogStore();
    const answer = store.getState().confirm(deleteOptions);
    const request = store.getState().queue[0];

    store.getState().settle(request?.id ?? -1, true);

    await expect(answer).resolves.toBe(true);
    expect(store.getState().queue).toEqual([]);
  });

  it("Resolves a cancelled prompt with null", async () => {
    const store = createDialogStore();
    const answer = store.getState().prompt({ title: "New project", label: "Project name" });
    const request = store.getState().queue[0];

    store.getState().settle(request?.id ?? -1, null);

    await expect(answer).resolves.toBeNull();
  });

  it("Shows queued dialogs one at a time in request order", async () => {
    const store = createDialogStore();
    void store.getState().notify({ title: "First", message: "One" });
    void store.getState().notify({ title: "Second", message: "Two" });
    const first = store.getState().queue[0];

    store.getState().settle(first?.id ?? -1, undefined);

    expect(store.getState().queue.map((request) => request.title)).toEqual(["Second"]);
  });

  it("Ignores a settle for a dialog that already closed", async () => {
    const store = createDialogStore();
    void store.getState().confirm(deleteOptions);
    const request = store.getState().queue[0];
    store.getState().settle(request?.id ?? -1, false);

    store.getState().settle(request?.id ?? -1, true);

    expect(store.getState().queue).toEqual([]);
  });
});
