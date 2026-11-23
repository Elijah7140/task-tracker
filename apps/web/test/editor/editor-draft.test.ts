import type { FieldDataType, FieldDefinitionProjection, Item } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import { editorDraftStatus } from "../../src/editor/editor-draft.js";
import { EMPTY_LINK_DRAFT } from "../../src/editor/link-draft.js";

type Definition = typeof FieldDefinitionProjection.Type;

const ITEM: typeof Item.Type = {
  id: "0190A1B2-0000-7000-8000-000000000001",
  projectId: "0190A1B2-0000-7000-8000-000000000002",
  folderId: null,
  parentItemId: null,
  title: "Task",
  description: null,
  notes: null,
  ticketNumber: null,
  itemTypeId: null,
  priorityLevelId: null,
  dueDate: null,
  dueTime: null,
  sortOrder: 0,
  createdAtUtc: "2026-11-13T12:00:00Z",
  updatedAtUtc: "2026-11-13T12:00:00Z",
  statusId: null,
  reopenStatusId: null,
  completedAtUtc: null,
  deletedAtUtc: null,
  deletionBatchId: null,
};

const field = (id: string, displayName: string, dataType: typeof FieldDataType.Type) => ({
  definition: {
    id,
    key: displayName.toLowerCase(),
    displayName,
    dataType,
    projectId: null,
    isArchived: false,
    sortOrder: 0,
  } satisfies Definition,
  stored: undefined,
});

const SUMMARY = field("0190A1B2-0000-7000-8000-000000000010", "Summary", "Text");
const EFFORT = field("0190A1B2-0000-7000-8000-000000000011", "Effort", "Number");

describe("editorDraftStatus", () => {
  it("Untouched custom fields leave the draft clean", () => {
    const status = editorDraftStatus({
      item: ITEM,
      builtIn: {},
      custom: {},
      activeFields: [SUMMARY, EFFORT],
    });

    expect(status.dirty).toBe(false);
    expect(status.valid).toBe(true);
    expect(status.customValues).toEqual([]);
  });

  it("A changed custom field makes the draft dirty", () => {
    const status = editorDraftStatus({
      item: ITEM,
      builtIn: {},
      custom: { [EFFORT.definition.id]: { kind: "Number", text: "12" } },
      activeFields: [SUMMARY, EFFORT],
    });

    expect(status.dirty).toBe(true);
  });

  it("An invalid custom number is dirty and blocks saving", () => {
    const status = editorDraftStatus({
      item: ITEM,
      builtIn: {},
      custom: { [EFFORT.definition.id]: { kind: "Number", text: "twelve" } },
      activeFields: [EFFORT],
    });

    expect(status.dirty).toBe(true);
    expect(status.valid).toBe(false);
  });

  it("Reports only active fields with a changed value", () => {
    const status = editorDraftStatus({
      item: ITEM,
      builtIn: {},
      custom: {
        [SUMMARY.definition.id]: { kind: "Text", text: "  " },
        [EFFORT.definition.id]: { kind: "Number", text: "4" },
      },
      activeFields: [SUMMARY, EFFORT],
    });

    expect(status.customValues).toEqual([
      { fieldDefinitionId: EFFORT.definition.id, numberValue: 4 },
    ]);
  });

  it("Sends built-in edits while custom fields are still loading", () => {
    const status = editorDraftStatus({
      item: ITEM,
      builtIn: { title: "Renamed" },
      custom: {},
      activeFields: null,
    });

    expect(status.dirty).toBe(true);
    expect(status.fields.title).toBe("Renamed");
    expect(status.customValues).toEqual([]);
  });
});

describe("editorDraftStatus with links", () => {
  const STORED = [
    {
      id: "0190A1B2-0000-7000-8000-000000000020",
      url: "https://a.example",
      title: null,
      sortOrder: 0,
    },
  ];

  it("Untouched links leave the draft clean and send nothing", () => {
    const status = editorDraftStatus({
      item: ITEM,
      builtIn: {},
      custom: {},
      activeFields: [],
      storedLinks: STORED,
    });

    expect([status.dirty, status.links, status.linkEntryProblem]).toEqual([false, undefined, null]);
  });

  it("Text left in the link boxes makes the draft dirty and is sent with the stored links", () => {
    const status = editorDraftStatus({
      item: ITEM,
      builtIn: {},
      custom: {},
      activeFields: [],
      storedLinks: STORED,
      links: { ...EMPTY_LINK_DRAFT, url: "https://b.example" },
    });

    expect(status.dirty).toBe(true);
    expect(status.links).toEqual([
      { id: STORED[0]!.id, url: "https://a.example", title: null },
      { id: null, url: "https://b.example", title: null },
    ]);
  });

  it("An invalid link entry keeps the draft valid but reports the problem for Save", () => {
    const status = editorDraftStatus({
      item: ITEM,
      builtIn: {},
      custom: {},
      activeFields: [],
      storedLinks: STORED,
      links: { ...EMPTY_LINK_DRAFT, url: "ftp://example.com" },
    });

    expect([status.dirty, status.valid, status.links]).toEqual([true, true, undefined]);
    expect(status.linkEntryProblem).toBe("A link must be a full http, https or mailto address.");
  });
});
