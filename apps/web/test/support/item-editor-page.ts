import { expect } from "vitest";
import { page } from "vitest/browser";
import type { SeedItem } from "./fake-area-items.js";
import type { FakeProjectStore, SeedProject } from "./fake-task-tracker-server.js";
import { renderApp, type RenderAppOptions } from "./render-app.js";

/** The item most editor tests open. */
export const EDITOR_ITEM = "Add index to Invoice.CustomerId";

/** A second top-level item, for checking that each item shows its own values. */
export const OTHER_ITEM = "Investigate nightly export failure";

/** Items with built-in metadata and one sub-item of each state. */
export const EDITOR_ITEMS: ReadonlyArray<SeedItem> = [
  {
    title: EDITOR_ITEM,
    type: "Change",
    ticketNumber: "JIRA-1234",
    priority: "High",
    dueDate: "2026-11-20",
    children: [
      { title: "Check query plan before/after", dueDate: "2026-11-12" },
      { title: "Draft migration script", completedAtUtc: "2026-11-12T16:00:00Z" },
    ],
  },
  { title: OTHER_ITEM, type: "Error", priority: "Critical", dueDate: "2026-11-14" },
];

/** The project the editor tests open. */
export const EDITOR_PROJECT: SeedProject = { name: "Billing DB", items: EDITOR_ITEMS };

/** IDs of one global custom field of each type, as created by {@link seedEveryFieldType}. */
export interface SeededFields {
  readonly summary: string;
  readonly effort: string;
  readonly review: string;
  readonly approved: string;
  readonly status: string;
  readonly ready: string;
  readonly blocked: string;
}

/** Adds the legacy tests' Summary, Effort, Review date, Approved and Status fields. */
export function seedEveryFieldType(store: FakeProjectStore): SeededFields {
  const fields = store.customFields;
  const status = fields.addFieldSeed("Status", "Choice");
  const ids = {
    summary: fields.addFieldSeed("Summary", "Text").id,
    effort: fields.addFieldSeed("Effort", "Number").id,
    review: fields.addFieldSeed("Review date", "Date").id,
    approved: fields.addFieldSeed("Approved", "Boolean").id,
    status: status.id,
    ready: fields.addChoiceSeed(status.id, "Ready").id,
    blocked: fields.addChoiceSeed(status.id, "Blocked").id,
  };
  // Status was created first only to own its choices; show it last, as in the legacy tests.
  fields.fields = fields.fields.map((field) =>
    field.id === status.id
      ? { ...field, sortOrder: 4 }
      : { ...field, sortOrder: field.sortOrder - 1 },
  );
  return ids;
}

/** Options for {@link openEditorWorkspace}. */
export interface EditorWorkspaceOptions {
  readonly projects?: ReadonlyArray<SeedProject>;
  readonly clock?: RenderAppOptions["clock"];
  readonly configure?: (store: FakeProjectStore, projectId: string) => void;
}

/** Mounts the app on the first project's root area and waits for its items. */
export async function openEditorWorkspace({
  projects = [EDITOR_PROJECT],
  clock,
  configure,
}: EditorWorkspaceOptions = {}) {
  const app = await renderApp({
    projects,
    ...(clock === undefined ? {} : { clock }),
    configure: (store) => configure?.(store, store.summaries[0]?.project.id ?? ""),
  });
  const projectId = app.store.summaries[0]?.project.id ?? "";
  app.history.push(`/projects/${projectId}`);
  await expect.element(page.getByTestId("quick-add-input")).toBeVisible();
  const itemId = (title: string) =>
    app.store.findItemByTitle(projectId, null, title)?.item.id ?? "";
  return { ...app, projectId, itemId };
}

/** The floating item editor. */
export const editor = () => page.getByRole("dialog", { name: "Edit item" });

/** A row of the root area's item tree. */
export const itemRow = (title: string) =>
  page
    .getByRole("tree", { name: "Items in Billing DB" })
    .getByRole("treeitem", { name: title, exact: true });

/** Opens the editor for an item with the row's context menu, as in §8. */
export async function openEditor(title = EDITOR_ITEM) {
  await itemRow(title).getByTestId("item-row").first().click({ button: "right" });
  await page.getByTestId("item-menu-edit").click();
  await expect.element(editor()).toBeVisible();
  await expect.element(editorTitle()).toHaveValue(title);
}

/** The editor's title input. */
export const editorTitle = () => editor().getByRole("textbox", { name: "Title" });

/** A custom-field control in the editor by its field name. */
export const customInput = (name: string) => editor().getByLabelText(name, { exact: true });

/** Picks an option from one of the editor's dropdowns. */
export async function pick(name: string, option: string) {
  await editor().getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect.element(page.getByRole("listbox")).not.toBeInTheDocument();
}

/** The unsaved changes question shown before the editor closes or changes item. */
export const draftDialog = () => page.getByRole("alertdialog", { name: "Unsaved changes" });
