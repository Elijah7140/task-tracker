import type { ItemLink, ItemLinkInput } from "@task-tracker/contracts";
import { linkProblem, MAX_LINKS_PER_ITEM, normalizeLinkTitle } from "./link-validation.js";

/** A link as the server stores it. */
export type StoredLink = typeof ItemLink.Type;

type LinkInput = typeof ItemLinkInput.Type;

/** One row of the draft list. `key` identifies the row on screen; `id` is null until saved. */
export interface LinkRow {
  readonly key: string;
  readonly id: string | null;
  readonly url: string;
  readonly title: string | null;
}

/** Which entry box a keystroke changed. */
export type LinkEntryField = "url" | "title";

/**
 * The Links section's part of the item draft, ported from the legacy
 * `ItemLinksViewModel`: the edited list and the address and title boxes.
 */
export interface LinkDraft {
  /** The edited list, or null while the stored links are untouched. */
  readonly rows: ReadonlyArray<LinkRow> | null;
  readonly url: string;
  readonly title: string;
  /** The row loaded into the boxes for Update link, or null while adding. */
  readonly editingKey: string | null;
  /** Why the last Add or Update was refused, shown under the boxes. */
  readonly error: string | null;
}

/** What the Links section adds to the editor's save. */
export interface LinkDraftStatus {
  readonly dirty: boolean;
  /** The whole replacement list when it differs from the stored one. */
  readonly links: ReadonlyArray<LinkInput> | undefined;
  /** Why text left in the boxes cannot be added, which refuses the save. */
  readonly entryProblem: string | null;
}

/** A draft that has not touched the stored links. */
export const EMPTY_LINK_DRAFT: LinkDraft = {
  rows: null,
  url: "",
  title: "",
  editingKey: null,
  error: null,
};

/** Shown when Save meets text in the link boxes that cannot be added. */
export const FIX_LINK_MESSAGE = "Fix the link marked in red first.";

const BUSY_ENTRY_MESSAGE = "Finish or cancel the link you're editing first.";

const rowOf = ({ id, url, title }: StoredLink): LinkRow => ({ key: id, id, url, title });

const inputOf = ({ id, url, title }: LinkRow | StoredLink): LinkInput => ({ id, url, title });

/** The rows the section lists: the edited list, or the stored links. */
export function currentLinkRows(stored: ReadonlyArray<StoredLink>, draft: LinkDraft) {
  return draft.rows ?? stored.map(rowOf);
}

function editingRow(rows: ReadonlyArray<LinkRow>, draft: LinkDraft) {
  return rows.find((row) => row.key === draft.editingKey);
}

/** True when the boxes hold something not yet added, or an edit not yet applied. */
export function hasPendingLinkEntry(rows: ReadonlyArray<LinkRow>, draft: LinkDraft): boolean {
  const row = editingRow(rows, draft);
  if (row !== undefined) {
    return draft.url.trim() !== row.url || normalizeLinkTitle(draft.title) !== row.title;
  }
  return draft.url.trim() !== "" || draft.title.trim() !== "";
}

/** Whether Cancel can clear typed text or stop an edit. */
export function canCancelLinkEntry(rows: ReadonlyArray<LinkRow>, draft: LinkDraft): boolean {
  return draft.editingKey !== null || hasPendingLinkEntry(rows, draft);
}

function entryProblem(rows: ReadonlyArray<LinkRow>, draft: LinkDraft): string | null {
  const problem = linkProblem(draft.url, draft.title);
  if (problem === null && draft.editingKey === null && rows.length >= MAX_LINKS_PER_ITEM) {
    return `An item may have at most ${MAX_LINKS_PER_ITEM} links.`;
  }
  return problem;
}

function placeEntry(rows: ReadonlyArray<LinkRow>, draft: LinkDraft, key: string) {
  const fields = { url: draft.url.trim(), title: normalizeLinkTitle(draft.title) };
  const editing = editingRow(rows, draft);
  if (editing === undefined) {
    return [...rows, { key, id: null, ...fields }];
  }
  return rows.map((row) => (row === editing ? { ...row, ...fields } : row));
}

function clearEntry(draft: LinkDraft): LinkDraft {
  return { ...draft, url: "", title: "", editingKey: null, error: null };
}

/** Records a keystroke in the address or title box. */
export function setLinkEntry(draft: LinkDraft, field: LinkEntryField, value: string): LinkDraft {
  return { ...draft, [field]: value };
}

/** Adds the typed link, or applies the edit, unless the entry is invalid. */
export function submitLinkEntry(
  stored: ReadonlyArray<StoredLink>,
  draft: LinkDraft,
  newKey: () => string,
): LinkDraft {
  const rows = currentLinkRows(stored, draft);
  const problem = entryProblem(rows, draft);
  if (problem !== null) {
    return { ...draft, error: problem };
  }
  return { ...clearEntry(draft), rows: placeEntry(rows, draft, newKey()) };
}

/** Loads a link into the boxes, unless other typed text would be lost. */
export function beginLinkEdit(
  stored: ReadonlyArray<StoredLink>,
  draft: LinkDraft,
  key: string,
): LinkDraft {
  const rows = currentLinkRows(stored, draft);
  const row = rows.find((candidate) => candidate.key === key);
  if (row === undefined || key === draft.editingKey) {
    return draft;
  }
  if (canCancelLinkEntry(rows, draft)) {
    return { ...draft, error: BUSY_ENTRY_MESSAGE };
  }
  return { ...draft, editingKey: key, url: row.url, title: row.title ?? "", error: null };
}

/** Clears the boxes and stops any edit. */
export function cancelLinkEntry(draft: LinkDraft): LinkDraft {
  return clearEntry(draft);
}

/** Removes a row, also stopping its edit. */
export function removeLink(
  stored: ReadonlyArray<StoredLink>,
  draft: LinkDraft,
  key: string,
): LinkDraft {
  const rows = currentLinkRows(stored, draft).filter((row) => row.key !== key);
  const next = { ...draft, rows };
  return key === draft.editingKey ? clearEntry(next) : next;
}

/** Moves a row one place up (-1) or down (1). The ends of the list do nothing. */
export function moveLink(
  stored: ReadonlyArray<StoredLink>,
  draft: LinkDraft,
  key: string,
  offset: -1 | 1,
): LinkDraft {
  const rows = [...currentLinkRows(stored, draft)];
  const from = rows.findIndex((row) => row.key === key);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= rows.length) {
    return draft;
  }
  const [moved] = rows.splice(from, 1);
  rows.splice(to, 0, moved!);
  return { ...draft, rows };
}

const sameInputs = (left: ReadonlyArray<LinkInput>, right: ReadonlyArray<LinkInput>) =>
  left.length === right.length &&
  left.every(
    (input, index) =>
      input.id === right[index]?.id &&
      input.url === right[index]?.url &&
      input.title === right[index]?.title,
  );

/**
 * Compares the draft with the stored links. Text still in the boxes counts as
 * a change and is saved as if added; while the stored links load, nothing is.
 */
export function linkDraftStatus(
  stored: ReadonlyArray<StoredLink> | null,
  draft: LinkDraft,
): LinkDraftStatus {
  if (stored === null) {
    return { dirty: false, links: undefined, entryProblem: null };
  }
  const rows = currentLinkRows(stored, draft);
  const pending = hasPendingLinkEntry(rows, draft);
  const problem = pending ? entryProblem(rows, draft) : null;
  const saved = pending && problem === null ? placeEntry(rows, draft, "pending") : rows;
  const inputs = saved.map(inputOf);
  const changed = !sameInputs(inputs, stored.map(inputOf));
  return { dirty: pending || changed, links: changed ? inputs : undefined, entryProblem: problem };
}
