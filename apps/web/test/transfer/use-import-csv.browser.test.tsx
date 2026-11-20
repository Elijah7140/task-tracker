import { TransferFailed } from "@task-tracker/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { FakeProjectStore } from "../support/fake-task-tracker-server.js";
import { renderApp, type RenderAppOptions } from "../support/render-app.js";
import { settleTheme, THEMES } from "../support/screenshots.js";

const TOKEN = "C".repeat(43);

const billing = {
  name: "Billing DB",
  openCount: 3,
  folders: [{ name: "dbo" }, { name: "Tables", parent: "dbo" }],
};
const website = { name: "Website", openCount: 5 };

const invalidPreview = {
  fileName: "broken.csv",
  rowCount: 3,
  recognizedColumns: ["Title", "Type", "Priority", "Due date"],
  unknownColumns: ["Mystery"],
  ignoredColumns: ["Project", "Folder path"],
  sampleRows: [
    {
      rowNumber: 2,
      title: "Good",
      type: "Change",
      priority: "High",
      dueDate: "2026-12-01",
      hasError: false,
    },
    {
      rowNumber: 3,
      title: "Bad type",
      type: "Bug",
      priority: "High",
      dueDate: "2026-12-01",
      hasError: true,
    },
    {
      rowNumber: 4,
      title: "",
      type: "Change",
      priority: "Urgent",
      dueDate: "13/01/2026",
      hasError: true,
    },
  ],
  issues: [
    {
      path: "Row 3, Type",
      message: "There is no type named 'Bug'. Use one of: Change, Error, Discussion, Spike.",
    },
    { path: "Row 4, Title", message: "A title of 1 to 300 characters is required." },
    { path: "Row 4, Due date", message: "Expected a date such as 2026-11-13." },
  ],
  canImport: false,
};

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

async function renderHome(options: RenderAppOptions = {}) {
  const app = await renderApp({ projects: [billing, website], ...options });
  await expect.element(page.getByRole("article", { name: "Billing DB" })).toBeVisible();
  return app;
}

async function startImport() {
  await page.getByTestId("transfer-menu-button").click();
  await page.getByTestId("transfer-import-csv").click();
}

/** Chooses a project, then (for Billing DB) a folder, with simulated clicks. */
async function chooseTarget(project: string, folder?: string) {
  const choice = page.getByTestId("choice-dialog");
  await expect
    .element(choice.getByRole("heading", { name: "Import CSV into project" }))
    .toBeVisible();
  await choice.getByRole("radio", { name: project }).click();
  await page.getByRole("button", { name: "Next" }).click();
  if (folder !== undefined) {
    await expect
      .element(choice.getByRole("heading", { name: `Import into ${project}` }))
      .toBeVisible();
    await choice.getByRole("radio", { name: folder }).click();
    await page.getByRole("button", { name: "Next" }).click();
  }
}

const preview = () => page.getByRole("dialog", { name: /^Import .*\.csv$/ });
const status = () => page.getByTestId("transfer-status");
const csvRequests = (store: FakeProjectStore) =>
  store.transfer.requests.filter(
    (request) => request.tag === "PreviewCsvImport" || request.tag === "ImportCsv",
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useImportCsv", () => {
  it("Previews the file for the chosen folder and imports it after Import", async () => {
    const dialogs = stubFileDialogs("items.csv");
    const { store } = await renderHome();
    await startImport();
    await chooseTarget("Billing DB", "Tables");

    await expect.element(preview()).toBeVisible();
    await expect.element(preview().getByText("Into Billing DB / Tables")).toBeVisible();
    await expect.element(page.getByTestId("csv-preview-row-count")).toHaveTextContent("2 rows");
    await expect
      .element(page.getByTestId("csv-preview-status"))
      .toHaveTextContent("Ready to import 2 rows as new items.");
    await expect.element(page.getByTestId("csv-preview-import")).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await expect
      .element(status())
      .toHaveTextContent(
        "Imported 2 items. A backup was saved to /home/owner/.local/share/task-tracker/tasktracker-import-20261119.db.bak.",
      );
    expect(dialogs.mock.calls).toEqual([[{ purpose: "import-csv" }]]);
    const tables = store.folders.find((folder) => folder.name === "Tables")!;
    const target = { projectId: store.summaries[0]!.project.id, folderId: tables.id };
    expect(csvRequests(store)).toEqual([
      { tag: "PreviewCsvImport", fileToken: TOKEN, target },
      { tag: "ImportCsv", fileToken: TOKEN, target },
    ]);
  });

  it("Lists the project root first and folders indented in tree order", async () => {
    stubFileDialogs(null);
    await renderHome();
    await startImport();
    await chooseTarget("Billing DB");

    const options = page.getByRole("radiogroup", { name: "Import into" }).getByRole("radio");

    await expect.element(options.first()).toHaveAccessibleName("Project root");
    expect(options.elements().map((option) => option.closest("label")?.textContent)).toEqual([
      "Project root",
      "dbo",
      "Tables",
    ]);
  });

  it("Imports into the root of a project without folders without asking for one", async () => {
    stubFileDialogs("items.csv");
    const { store } = await renderHome();
    await startImport();
    await chooseTarget("Website");

    await expect.element(preview().getByText("Into Website")).toBeVisible();
    await page.getByTestId("csv-preview-import").click();

    await expect.element(status()).toMatchTextContent(/^Imported 2 items\./);
    const target = { projectId: store.summaries[1]!.project.id, folderId: null };
    expect(csvRequests(store).map((request) => "target" in request && request.target)).toEqual([
      target,
      target,
    ]);
  });

  it("Never opens the file dialog when the project or folder choice is cancelled", async () => {
    const dialogs = stubFileDialogs("items.csv");
    await renderHome();
    await startImport();
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByTestId("choice-dialog")).not.toBeInTheDocument();
    await startImport();
    await chooseTarget("Billing DB");

    await page.getByTestId("choice-dialog-cancel").click();

    await expect.element(page.getByTestId("choice-dialog")).not.toBeInTheDocument();
    expect(dialogs).not.toHaveBeenCalled();
  });

  it("Imports nothing when the preview is cancelled with Escape", async () => {
    stubFileDialogs("items.csv");
    const { store } = await renderHome();
    await startImport();
    await chooseTarget("Website");
    await expect.element(preview()).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(preview()).not.toBeInTheDocument();
    expect(csvRequests(store).map((request) => request.tag)).toEqual(["PreviewCsvImport"]);
    await expect.element(status()).toHaveTextContent("");
  });

  it("Marks rows with errors, lists every problem and offers only Close", async () => {
    stubFileDialogs("broken.csv");
    const { store } = await renderHome({
      configure: (fake) => {
        fake.transfer.csvPreview = invalidPreview;
      },
    });
    await startImport();
    await chooseTarget("Website");

    await expect.element(page.getByTestId("csv-preview-import")).not.toBeInTheDocument();
    await expect.element(page.getByTestId("csv-preview-cancel")).toHaveTextContent("Close");
    expect(page.getByTestId("csv-preview-row-error").elements()).toHaveLength(2);
    await expect
      .element(page.getByRole("list", { name: "Problems" }))
      .toMatchTextContent(/Row 3, Type: There is no type named 'Bug'/);
    await expect
      .element(page.getByTestId("csv-preview-unknown-columns"))
      .toHaveTextContent("Not recognised and ignored: Mystery");
    await userEvent.keyboard("{Enter}");

    await expect.element(preview()).not.toBeInTheDocument();
    expect(csvRequests(store).map((request) => request.tag)).toEqual(["PreviewCsvImport"]);
  });

  it("Shows the stopped message when the server refuses the file on import", async () => {
    stubFileDialogs("items.csv");
    await renderHome({
      configure: (fake) => {
        fake.transfer.csvImportResult = {
          kind: "refused",
          issues: [{ path: "Row 2, Type", message: "The type 'Spike' is archived." }],
        };
      },
    });
    await startImport();
    await chooseTarget("Website");
    await page.getByTestId("csv-preview-import").click();

    const notice = page.getByRole("alertdialog", {
      name: "The import was stopped; nothing was changed",
    });

    await expect.element(notice).toMatchTextContent(/Row 2, Type: The type 'Spike' is archived\./);
  });

  it("Explains a file the server can't read", async () => {
    stubFileDialogs("latin1.csv");
    await renderHome({
      configure: (fake) => {
        const message = "This file isn't UTF-8. Re-save it as 'CSV UTF-8' and try again.";
        fake.transfer.failure = { tag: "PreviewCsvImport", error: new TransferFailed({ message }) };
      },
    });
    await startImport();
    await chooseTarget("Website");

    await expect
      .element(page.getByRole("alertdialog", { name: "Import and export" }))
      .toMatchTextContent(/Re-save it as 'CSV UTF-8'/);
    await expect.element(preview()).not.toBeInTheDocument();
  });

  describe.each(THEMES)("in the %s theme", (theme) => {
    it("Matches the reviewed ready preview baseline", async () => {
      stubFileDialogs("items.csv");
      await renderHome();
      await startImport();
      await chooseTarget("Billing DB", "Tables");
      await expect.element(page.getByTestId("csv-preview-import")).toHaveFocus();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`csv-import-preview-ready-${theme}`);
    });

    it("Matches the reviewed preview with problems baseline", async () => {
      stubFileDialogs("broken.csv");
      await renderHome({
        configure: (fake) => {
          fake.transfer.csvPreview = invalidPreview;
        },
      });
      await startImport();
      await chooseTarget("Website");
      await expect.element(page.getByTestId("csv-preview-cancel")).toHaveFocus();

      await settleTheme(theme);

      await expect
        .element(page.getByTestId("app-shell"))
        .toMatchScreenshot(`csv-import-preview-${theme}`);
    });
  });
});
