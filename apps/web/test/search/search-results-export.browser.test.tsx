import { TransferFailed } from "@task-tracker/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderApp, type RenderAppOptions } from "../support/render-app.js";

const TOKEN = "S".repeat(43);
const exportButton = () => page.getByRole("button", { name: "Export results (CSV)…" });
const searchInput = () => page.getByRole("searchbox", { name: "Search text" });

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

async function openSearch(configure?: RenderAppOptions["configure"]) {
  const app = await renderApp({
    projects: [{ name: "Billing", items: [{ title: "Pay invoice" }, { title: "Audit invoice" }] }],
    ...(configure === undefined ? {} : { configure }),
  });
  await expect.element(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await userEvent.keyboard("{Control>}f{/Control}");
  await expect.element(searchInput()).toHaveFocus();
  return app;
}

async function search(text: string) {
  await userEvent.keyboard(text);
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByTestId("search-result-row").first()).toBeVisible();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("Is unavailable until a search has results", async () => {
  await openSearch();

  await expect.element(exportButton()).not.toBeInTheDocument();
  await search("invoice");

  await expect.element(exportButton()).toBeEnabled();
});

it("Exports every match of the shown search, not only the first page, and says where", async () => {
  const dialogs = stubFileDialogs("search-results.csv");
  const { store } = await openSearch((fake) => {
    fake.transfer.searchExportCount = 250;
  });
  await search("invoice");

  await exportButton().click();

  await expect
    .element(page.getByTestId("search-export-status"))
    .toHaveTextContent("Exported 250 results to /home/owner/Documents/search-results.csv.");
  expect(dialogs.mock.calls).toEqual([
    [{ purpose: "export-csv", suggestedName: "search-results.csv" }],
  ]);
  const request = store.transfer.requests[0]!;
  expect(request).toMatchObject({ tag: "ExportSearchResultsCsv", fileToken: TOKEN });
  expect("query" in request && request.query).toMatchObject({
    text: "invoice",
    scope: { kind: "allProjects" },
  });
});

it("Runs from the keyboard and writes nothing when the save dialog is cancelled", async () => {
  const dialogs = stubFileDialogs(null);
  const { store } = await openSearch();
  await search("invoice");
  exportButton().element().focus();

  await userEvent.keyboard("{Enter}");

  await expect.poll(() => dialogs.mock.calls.length).toBe(1);
  expect(store.transfer.requests).toEqual([]);
  await expect.element(page.getByTestId("search-export-status")).toHaveTextContent("");
  await expect.element(exportButton()).toBeEnabled();
});

it("Reports a file that can't be written in a notice", async () => {
  stubFileDialogs("results.csv");
  await openSearch((fake) => {
    const message = "Could not find a part of the path '/missing/results.csv'.";
    fake.transfer.failure = {
      tag: "ExportSearchResultsCsv",
      error: new TransferFailed({ message }),
    };
  });
  await search("invoice");

  await exportButton().click();

  await expect
    .element(page.getByRole("alertdialog", { name: "Export search results" }))
    .toMatchTextContent(/Could not find a part of the path/);
  await expect.element(page.getByTestId("search-export-status")).toHaveTextContent("");
});
