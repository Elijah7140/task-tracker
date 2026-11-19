import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { resolveDraft } from "../../src/state/dialog-store.js";
import { renderApp } from "../support/render-app.js";

const unsaved = {
  title: "Unsaved changes",
  message: "Save changes to Task before closing?",
} as const;

const draftDialog = () => page.getByRole("alertdialog", { name: "Unsaved changes" });

describe("DraftDialog", () => {
  it("Saves with Enter because focus starts on the Save button", async () => {
    await renderApp();
    const answer = resolveDraft(unsaved);
    await expect.element(page.getByTestId("draft-dialog-save")).toHaveFocus();

    await userEvent.keyboard("{Enter}");

    await expect(answer).resolves.toBe("save");
  });

  it("Describes what will be saved", async () => {
    await renderApp();

    void resolveDraft(unsaved);

    await expect.element(draftDialog()).toHaveAccessibleDescription(unsaved.message);
  });

  it("Discards when Discard is clicked", async () => {
    await renderApp();
    const answer = resolveDraft(unsaved);

    await page.getByTestId("draft-dialog-discard").click();

    await expect(answer).resolves.toBe("discard");
  });

  it("Cancels when Cancel is clicked", async () => {
    await renderApp();
    const answer = resolveDraft(unsaved);

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(answer).resolves.toBe("cancel");
  });

  it("Cancels when Escape closes it", async () => {
    await renderApp();
    const answer = resolveDraft(unsaved);
    await expect.element(draftDialog()).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect(answer).resolves.toBe("cancel");
  });
});
