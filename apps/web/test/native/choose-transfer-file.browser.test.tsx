import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { chooseTransferFile } from "../../src/native/choose-transfer-file.js";
import { renderApp } from "../support/render-app.js";

const TOKEN = "k".repeat(43);

const notice = () => page.getByRole("alertdialog", { name: "Import and export" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chooseTransferFile", () => {
  it("Resolves with the chosen file's token and name", async () => {
    const choose = vi.fn(async () => ({ token: TOKEN, fileName: "backup.json" }));
    vi.stubGlobal("taskTrackerDesktop", { chooseTransferFile: choose });

    const choice = await chooseTransferFile({ purpose: "import-json" });

    expect(choice).toEqual({ token: TOKEN, fileName: "backup.json" });
    expect(choose).toHaveBeenCalledWith({ purpose: "import-json" });
  });

  it("Resolves with null when the user cancels the file dialog", async () => {
    vi.stubGlobal("taskTrackerDesktop", { chooseTransferFile: async () => null });

    const choice = await chooseTransferFile({ purpose: "export-json" });

    expect(choice).toBeNull();
  });

  it("Explains that import and export needs the desktop app in a browser", async () => {
    vi.stubGlobal("taskTrackerDesktop", undefined);
    await renderApp();

    const choice = chooseTransferFile({ purpose: "import-json" });

    await expect
      .element(notice())
      .toHaveAccessibleDescription("Import and export needs the desktop app.");
    await page.getByTestId("message-dialog-ok").click();
    await expect(choice).resolves.toBeNull();
  });

  it("Explains that import and export needs the desktop app when the bridge has no file dialog", async () => {
    vi.stubGlobal("taskTrackerDesktop", { openExternalLink: async () => true });
    await renderApp();

    const choice = chooseTransferFile({ purpose: "export-json" });

    await expect
      .element(notice())
      .toHaveAccessibleDescription("Import and export needs the desktop app.");
    await page.getByTestId("message-dialog-ok").click();
    await expect(choice).resolves.toBeNull();
  });

  it("Shows the message of a file dialog that fails", async () => {
    vi.stubGlobal("taskTrackerDesktop", {
      chooseTransferFile: async () => {
        throw new Error("The file dialog is already open.");
      },
    });
    await renderApp();

    const choice = chooseTransferFile({ purpose: "export-json" });

    await expect.element(notice()).toHaveAccessibleDescription("The file dialog is already open.");
    await page.getByTestId("message-dialog-ok").click();
    await expect(choice).resolves.toBeNull();
  });

  it("Treats a malformed answer from the desktop shell as a failed dialog", async () => {
    vi.stubGlobal("taskTrackerDesktop", {
      chooseTransferFile: async () => ({ token: "short", fileName: "backup.json" }),
    });
    await renderApp();

    const choice = chooseTransferFile({ purpose: "import-json" });

    await expect
      .element(notice())
      .toHaveAccessibleDescription("The file dialog could not be opened.");
    await page.getByTestId("message-dialog-ok").click();
    await expect(choice).resolves.toBeNull();
  });
});
