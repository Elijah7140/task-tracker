import type { FieldDataType, FieldDefinitionProjection } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import { editorFields } from "../../src/editor/editor-fields.js";

type Definition = typeof FieldDefinitionProjection.Type;

const ITEM_ID = "0190A1B2-0000-7000-8000-000000000001";
const PROJECT_ID = "0190A1B2-0000-7000-8000-000000000002";

function field(
  id: string,
  displayName: string,
  options: { dataType?: typeof FieldDataType.Type; project?: boolean; archived?: boolean } = {},
  sortOrder = 0,
): Definition {
  return {
    id,
    key: displayName.toLowerCase(),
    displayName,
    dataType: options.dataType ?? "Text",
    projectId: options.project === true ? PROJECT_ID : null,
    isArchived: options.archived ?? false,
    sortOrder,
  };
}

const value = (fieldDefinitionId: string, textValue: string) => ({
  itemId: ITEM_ID,
  fieldDefinitionId,
  textValue,
  numberValue: null,
  dateValue: null,
  boolValue: null,
  choiceId: null,
});

describe("editorFields", () => {
  it("Keeps the server's effective order of active fields with their stored values", () => {
    const effort = field("A", "Effort", { dataType: "Number" });
    const note = field("B", "Project note", { project: true });
    const values = [value("B", "kept")];

    const { active } = editorFields([effort, note], [note, effort], values);

    expect(active.map((entry) => entry.definition.displayName)).toEqual(["Effort", "Project note"]);
    expect(active.map((entry) => entry.stored?.textValue ?? null)).toEqual([null, "kept"]);
  });

  it("Lists an archived field only when the item still has a value for it", () => {
    const kept = field("K", "Kept", { archived: true }, 1);
    const unused = field("U", "Unused", { archived: true }, 0);

    const { active, archived } = editorFields([], [unused, kept], [value("K", "value")]);

    expect(active).toEqual([]);
    expect(archived.map((entry) => entry.definition.displayName)).toEqual(["Kept"]);
    expect(archived[0]?.stored?.textValue).toBe("value");
  });

  it("Orders archived fields by sort order", () => {
    const second = field("S", "Second", { archived: true }, 2);
    const first = field("F", "First", { archived: true }, 1);
    const values = [value("S", "two"), value("F", "one")];

    const { archived } = editorFields([], [second, first], values);

    expect(archived.map((entry) => entry.definition.displayName)).toEqual(["First", "Second"]);
  });
});
