import { describe, expect, it } from "vitest";
import {
  archiveField,
  createField,
  listSearchableFields,
  listSearchChoices,
  type FieldChoice,
  type PriorityLevel,
  type Project,
} from "../../src/index.js";

function project(id: string, name: string, sortOrder: number): Project {
  return {
    id,
    name,
    description: null,
    iconKey: null,
    sortOrder,
    createdAtUtc: Temporal.Instant.from("2026-11-14T00:00:00Z"),
    updatedAtUtc: Temporal.Instant.from("2026-11-14T00:00:00Z"),
    deletedAtUtc: null,
    deletionBatchId: null,
  };
}

describe("listSearchableFields", () => {
  it("Lists built-in fields, then active global fields, then active project fields in order", () => {
    const first = project("P-1", "First", 0);
    const second = project("P-2", "Second", 1);
    const global = createField("F-1", "Global", "Text", null, []);
    const localFirst = createField("F-2", "Local", "Number", first.id, [global]);
    const localSecond = createField("F-3", "Other", "Date", second.id, [global, localFirst]);
    const archived = archiveField(
      createField("F-4", "Archived", "Text", null, [global, localFirst, localSecond]),
    );
    const definitions = [archived, localSecond, localFirst, global];

    const projectFields = listSearchableFields(
      { kind: "project", projectId: first.id },
      definitions,
      [second, first],
    );
    const allFields = listSearchableFields({ kind: "allProjects" }, definitions, [second, first]);

    expect(projectFields.map((field) => field.key)).toEqual([
      "title",
      "ticket",
      "type",
      "priority",
      "due",
      "scheduled",
      "status",
      "completed",
      "link",
      "repeats",
      "reminder",
      "global",
      "local",
    ]);
    expect(allFields.map((field) => field.key)).toEqual([
      "title",
      "ticket",
      "type",
      "priority",
      "due",
      "scheduled",
      "status",
      "completed",
      "link",
      "repeats",
      "reminder",
      "global",
      "local",
      "other",
    ]);
  });

  it("Excludes custom fields belonging to deleted projects", () => {
    const deleted: Project = {
      ...project("P-DEL", "Deleted", 0),
      deletedAtUtc: Temporal.Instant.from("2026-11-14T01:00:00Z"),
      deletionBatchId: "BATCH-1",
    };
    const local = createField("F-1", "Local", "Text", deleted.id, []);

    const fields = listSearchableFields({ kind: "allProjects" }, [local], [deleted]);

    expect(fields.map((field) => field.key)).not.toContain("local");
  });
});

describe("listSearchChoices", () => {
  it("Returns active priority levels in rank order with formatted labels and numbers", () => {
    const levels: ReadonlyArray<PriorityLevel> = [
      {
        id: "PRI-2",
        name: "Low",
        number: 2,
        colorKey: null,
        isBuiltIn: false,
        isArchived: false,
        sortOrder: 2,
      },
      {
        id: "PRI-1",
        name: "High",
        number: 7,
        colorKey: null,
        isBuiltIn: false,
        isArchived: false,
        sortOrder: 0,
      },
      {
        id: "PRI-ARC",
        name: "Old",
        number: null,
        colorKey: null,
        isBuiltIn: false,
        isArchived: true,
        sortOrder: 1,
      },
    ];
    const priorityField = listSearchableFields({ kind: "allProjects" }, [], []).find(
      (candidate) => candidate.key === "priority",
    )!;

    const choices = listSearchChoices(priorityField, {
      itemTypes: [],
      priorityLevels: levels,
      choices: [],
    });

    expect(choices).toEqual([
      { id: "PRI-1", label: "7 · High", sortOrder: 0, name: "High", number: 7 },
      { id: "PRI-2", label: "2 · Low", sortOrder: 2, name: "Low", number: 2 },
    ]);
  });

  it("Returns active choices for a custom choice field", () => {
    const definition = createField("F-1", "Severity", "Choice", null, []);
    const field = listSearchableFields({ kind: "allProjects" }, [definition], []).find(
      (candidate) => candidate.key === "severity",
    )!;
    const rawChoices: ReadonlyArray<FieldChoice> = [
      {
        id: "C-2",
        fieldDefinitionId: definition.id,
        label: "Minor",
        sortOrder: 1,
        isArchived: false,
      },
      {
        id: "C-1",
        fieldDefinitionId: definition.id,
        label: "Major",
        sortOrder: 0,
        isArchived: false,
      },
      {
        id: "C-3",
        fieldDefinitionId: definition.id,
        label: "Hidden",
        sortOrder: 2,
        isArchived: true,
      },
    ];

    const choices = listSearchChoices(field, {
      itemTypes: [],
      priorityLevels: [],
      choices: rawChoices,
    });

    expect(choices).toEqual([
      { id: "C-1", label: "Major", sortOrder: 0, name: null, number: null },
      { id: "C-2", label: "Minor", sortOrder: 1, name: null, number: null },
    ]);
  });
});
