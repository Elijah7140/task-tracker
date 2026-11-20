import { NotFound, TransferFailed } from "@task-tracker/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp, type RenderAppOptions } from "../support/render-app.js";
import { chooseTransferCommand, openTransferMenu } from "../support/menu-bar.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const TOKEN = "T".repeat(43);

const billing = { name: "Billing DB", openCount: 3, overdueCount: 1 };
const website = { name: "Web/Site: v2", openCount: 5 };

type MenuCommand =
  | "transfer-import-json"
  | "transfer-export-all"
  | "transfer-export-project"
  | "transfer-export-project-csv";

/** Stubs the desktop bridge so file dialogs answer in order; later dialogs are cancelled. */
function stubFileDialogs(...fileNames: ReadonlyArray<string | null>) {
  const answers = [...fileNames];
  const chooseTransferFile = vi.fn(async (_request: unknown) => {
    const fileName = answers.shift() ?? null;
    return fileName === null ? null : { token: TOKEN, fileName };
  });
  vi.stubGlobal("taskTrackerDesktop", { chooseTransferFile });
  return chooseTransferFile;
}

async function runCommand(command: MenuCommand) {
  await chooseTransferCommand(command);
}

async function renderHome(options: RenderAppOptions = {}) {
  const app = await renderApp({ projects: [billing, website], ...options });
  await expect.element(card("Billing DB").or(page.getByTestId("empty-home"))).toBeVisible();
  return app;
}

const card = (name: string) => page.getByRole("article", { name });
const notice = (title: string) => page.getByRole("alertdialog", { name: title });
const status = () => page.getByTestId("transfer-status");
const menuItem = (command: MenuCommand) => page.getByTestId(command);

const issue = (index: number) => ({
  path: `$.projects[0].items[${index}].dueDate`,
  message: "must be a date like 2026-11-20",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useDataTransfer", () => {
  it("Exports everything to the chosen file and shows where it was written", async () => {
    const dialogs = stubFileDialogs("task-tracker-export.json");
    const { store } = await renderHome();

    await runCommand("transfer-export-all");

    await expect
      .element(status())
      .toHaveTextContent("Exported everything to /home/owner/Documents/task-tracker-export.json.");
    expect(dialogs.mock.calls).toEqual([
      [{ purpose: "export-json", suggestedName: "task-tracker-export.json" }],
    ]);
    expect(store.transfer.requests).toEqual([
      { tag: "ExportJson", scope: { kind: "all" }, fileToken: TOKEN },
    ]);
  });

  it("Says nothing when the save dialog for Export everything is cancelled", async () => {
    const dialogs = stubFileDialogs(null);
    const { store } = await renderHome();

    await runCommand("transfer-export-all");

    await expect.poll(() => dialogs.mock.calls.length).toBe(1);
    await expect.element(menuItem("transfer-export-all")).not.toBeInTheDocument();
    expect(store.transfer.requests).toEqual([]);
    await expect.element(status()).toHaveTextContent("");
    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("Exports the chosen project with a file name suggested from its name", async () => {
    const dialogs = stubFileDialogs("Web-Site- v2.json");
    const { store } = await renderHome({
      configure: (fake) => {
        fake.transfer.exportPath = "/home/owner/Web-Site- v2.json";
      },
    });
    await runCommand("transfer-export-project");
    const choice = page.getByTestId("choice-dialog");
    await expect.element(choice.getByRole("radiogroup", { name: "Project" })).toBeVisible();
    await expect.element(choice.getByRole("heading", { name: "Export project" })).toBeVisible();
    expect(
      choice
        .getByTestId("choice-dialog-option")
        .elements()
        .map((option) => option.closest("label")?.textContent),
    ).toEqual(["Billing DB", "Web/Site: v2"]);

    await choice.getByRole("radio", { name: "Web/Site: v2" }).click();
    await page.getByRole("button", { name: "Export" }).click();

    await expect
      .element(status())
      .toHaveTextContent("Exported Web/Site: v2 to /home/owner/Web-Site- v2.json.");
    expect(dialogs.mock.calls).toEqual([
      [{ purpose: "export-json", suggestedName: "Web-Site- v2.json" }],
    ]);
    const projectId = store.summaries[1]?.project.id;
    expect(store.transfer.requests).toEqual([
      { tag: "ExportJson", scope: { kind: "project", projectId }, fileToken: TOKEN },
    ]);
  });

  it("Exports the chosen project as CSV with a .csv file name suggested from its name", async () => {
    const dialogs = stubFileDialogs("Web-Site- v2.csv");
    const { store } = await renderHome();
    await runCommand("transfer-export-project-csv");
    const choice = page.getByTestId("choice-dialog");
    await expect.element(choice.getByRole("heading", { name: "Export project" })).toBeVisible();

    await choice.getByRole("radio", { name: "Web/Site: v2" }).click();
    await userEvent.keyboard("{Enter}");

    await expect
      .element(status())
      .toHaveTextContent("Exported Web/Site: v2 to /home/owner/Documents/task-tracker-export.csv.");
    expect(dialogs.mock.calls).toEqual([
      [{ purpose: "export-csv", suggestedName: "Web-Site- v2.csv" }],
    ]);
    const projectId = store.summaries[1]?.project.id;
    expect(store.transfer.requests).toEqual([
      { tag: "ExportProjectCsv", projectId, fileToken: TOKEN },
    ]);
  });

  it("Never opens the file dialog when the project choice is cancelled", async () => {
    const dialogs = stubFileDialogs("Billing DB.json");
    const { store } = await renderHome();
    await runCommand("transfer-export-project");
    await expect.element(page.getByTestId("choice-dialog")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(page.getByTestId("choice-dialog")).not.toBeInTheDocument();
    expect(dialogs).not.toHaveBeenCalled();
    expect(store.transfer.requests).toEqual([]);
    await expect.element(status()).toHaveTextContent("");
  });

  it("Explains that there is nothing to export when there are no projects", async () => {
    const dialogs = stubFileDialogs("project.json");
    await renderHome({ projects: [] });

    await runCommand("transfer-export-project");

    await expect
      .element(notice("Export project"))
      .toHaveAccessibleDescription("There are no projects yet.");
    expect(dialogs).not.toHaveBeenCalled();
  });

  it("Imports a checked file after confirmation, reports the backup and reloads the project cards", async () => {
    const dialogs = stubFileDialogs("backup.json");
    const { store } = await renderHome();
    await runCommand("transfer-import-json");
    await expect
      .element(notice("Import data"))
      .toHaveAccessibleDescription(
        "Import 1 project, 2 items from backup.json? " +
          "Everything is added as new data; nothing you have is changed or overwritten. " +
          "An import can't be undone with Undo, so a backup of your database is saved first.",
      );

    await page.getByRole("button", { name: "Import", exact: true }).click();

    await expect
      .element(status())
      .toHaveTextContent(
        "Imported 1 project, 2 items. A backup was saved to " +
          "/home/owner/.local/share/task-tracker/tasktracker-import-20261119.db.bak.",
      );
    await expect.element(card("Home Lab")).toBeVisible();
    expect(dialogs.mock.calls).toEqual([[{ purpose: "import-json" }]]);
    expect(store.transfer.requests).toEqual([
      { tag: "PreviewJsonImport", fileToken: TOKEN },
      { tag: "ImportJson", fileToken: TOKEN },
    ]);
  });

  it("Imports nothing when the open dialog is cancelled", async () => {
    const dialogs = stubFileDialogs(null);
    const { store } = await renderHome();

    await runCommand("transfer-import-json");

    await expect.poll(() => dialogs.mock.calls.length).toBe(1);
    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
    expect(store.transfer.requests).toEqual([]);
    await expect.element(status()).toHaveTextContent("");
  });

  it("Imports nothing when the confirmation is cancelled with its button", async () => {
    stubFileDialogs("backup.json");
    const { store } = await renderHome();
    await runCommand("transfer-import-json");
    await expect.element(notice("Import data")).toBeVisible();

    await page.getByTestId("confirm-dialog-cancel").click();

    await expect.element(notice("Import data")).not.toBeInTheDocument();
    expect(store.transfer.requests.map(({ tag }) => tag)).toEqual(["PreviewJsonImport"]);
    expect(store.names()).toEqual(["Billing DB", "Web/Site: v2"]);
    await expect.element(status()).toHaveTextContent("");
  });

  it("Imports nothing when the confirmation is dismissed with Escape", async () => {
    stubFileDialogs("backup.json");
    const { store } = await renderHome();
    await runCommand("transfer-import-json");
    await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();

    await userEvent.keyboard("{Escape}");

    await expect.element(notice("Import data")).not.toBeInTheDocument();
    expect(store.transfer.requests.map(({ tag }) => tag)).toEqual(["PreviewJsonImport"]);
    await expect.element(status()).toHaveTextContent("");
  });

  it("Lists the first fifteen problems of an invalid file and asks nothing else", async () => {
    stubFileDialogs("broken.json");
    const { store } = await renderHome({
      configure: (fake) => {
        fake.transfer.preview = {
          ...fake.transfer.preview,
          issues: Array.from({ length: 17 }, (_, index) => issue(index)),
        };
      },
    });

    await runCommand("transfer-import-json");

    const listed = Array.from({ length: 15 }, (_, index) => {
      const { path, message } = issue(index);
      return `${path}: ${message}`;
    });
    await expect
      .element(notice("This file can't be imported"))
      .toHaveAccessibleDescription([...listed, "...and 2 more."].join(" "));
    await page.getByTestId("message-dialog-ok").click();
    await expect.element(page.getByRole("alertdialog")).not.toBeInTheDocument();
    expect(store.transfer.requests.map(({ tag }) => tag)).toEqual(["PreviewJsonImport"]);
  });

  it("Shows the stopped message when the server refuses a checked import", async () => {
    stubFileDialogs("backup.json");
    const { store } = await renderHome({
      configure: (fake) => {
        fake.transfer.importResult = {
          kind: "refused",
          issues: [{ path: "$.projects[0].settings", message: "thresholds are out of order" }],
        };
      },
    });
    await runCommand("transfer-import-json");

    await page.getByRole("button", { name: "Import", exact: true }).click();

    await expect
      .element(notice("The import was stopped; nothing was changed"))
      .toHaveAccessibleDescription("$.projects[0].settings: thresholds are out of order");
    expect(store.names()).toEqual(["Billing DB", "Web/Site: v2"]);
    await expect.element(status()).toHaveTextContent("");
  });

  it("Shows a failed export as an Import and export notice and ends the busy state", async () => {
    stubFileDialogs("task-tracker-export.json");
    await renderHome({
      configure: (fake) => {
        fake.transfer.failure = {
          tag: "ExportJson",
          error: new TransferFailed({ message: "The file could not be written: access denied." }),
        };
      },
    });

    await runCommand("transfer-export-all");

    await expect
      .element(notice("Import and export"))
      .toHaveAccessibleDescription("The file could not be written: access denied.");
    await page.getByTestId("message-dialog-ok").click();
    await openTransferMenu("transfer-export-all");
    await expect.element(menuItem("transfer-export-all")).not.toHaveAttribute("aria-disabled");
    await expect.element(status()).toHaveTextContent("");
    await expect.element(page.getByTestId("transfer-progress")).not.toBeInTheDocument();
  });

  it("Shows the server's message when an export's project has disappeared", async () => {
    stubFileDialogs("Billing DB.json");
    await renderHome({
      configure: (fake) => {
        fake.transfer.failure = {
          tag: "ExportJson",
          error: new NotFound({ entity: "Project", message: "Project is missing or deleted." }),
        };
      },
    });
    await runCommand("transfer-export-project");

    await page.getByRole("button", { name: "Export" }).click();

    await expect
      .element(notice("Import and export"))
      .toHaveAccessibleDescription("Project is missing or deleted.");
  });

  it("Shows a progress bar only while a transfer request runs", async () => {
    stubFileDialogs("task-tracker-export.json");
    const { store } = await renderHome();
    const release = store.hold("ExportJson");

    await runCommand("transfer-export-all");

    await expect
      .element(page.getByRole("progressbar", { name: "Import and export in progress" }))
      .toBeVisible();
    release();
    await expect.element(status()).toMatchTextContent(/^Exported everything to /);
    await expect.element(page.getByTestId("transfer-progress")).not.toBeInTheDocument();
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed import confirmation baseline", async () => {
      stubFileDialogs("backup.json");
      await renderHome();
      await runCommand("transfer-import-json");
      await expect.element(page.getByTestId("confirm-dialog-confirm")).toHaveFocus();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`transfer-import-confirm-${theme}`);
    });

    it("Matches the reviewed invalid import file baseline", async () => {
      stubFileDialogs("broken.json");
      await renderHome({
        configure: (fake) => {
          fake.transfer.preview = {
            ...fake.transfer.preview,
            issues: [
              { path: "$.version", message: "This file was written by a newer version." },
              issue(3),
              { path: "$.projects[1]", message: "must be an object" },
            ],
          };
        },
      });
      await runCommand("transfer-import-json");
      await expect.element(notice("This file can't be imported")).toBeVisible();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`transfer-import-issues-${theme}`);
    });
  });
});
