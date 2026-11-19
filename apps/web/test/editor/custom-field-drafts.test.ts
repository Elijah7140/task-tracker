import type {
  FieldDataType,
  FieldDefinitionProjection,
  ItemFieldValue,
} from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import {
  type CustomFieldDraft,
  draftError,
  draftInput,
  isDraftChanged,
  NUMBER_ERROR,
  storedDisplayValue,
  storedDraft,
} from "../../src/editor/custom-field-drafts.js";

type Definition = typeof FieldDefinitionProjection.Type;
type Stored = typeof ItemFieldValue.Type;

const ITEM_ID = "0190A1B2-0000-7000-8000-000000000001";
const FIELD_ID = "0190A1B2-0000-7000-8000-000000000002";
const READY_ID = "0190A1B2-0000-7000-8000-000000000003";
const RETIRED_ID = "0190A1B2-0000-7000-8000-000000000004";

function definition(dataType: typeof FieldDataType.Type): Definition {
  return {
    id: FIELD_ID,
    key: dataType.toLowerCase(),
    displayName: dataType,
    dataType,
    projectId: null,
    isArchived: false,
    sortOrder: 0,
  };
}

function stored(values: Partial<Stored>): Stored {
  return {
    itemId: ITEM_ID,
    fieldDefinitionId: FIELD_ID,
    textValue: null,
    numberValue: null,
    dateValue: null,
    boolValue: null,
    choiceId: null,
    ...values,
  };
}

const choices = [
  { id: READY_ID, fieldDefinitionId: FIELD_ID, label: "Ready", sortOrder: 0, isArchived: false },
  { id: RETIRED_ID, fieldDefinitionId: FIELD_ID, label: "Retired", sortOrder: 1, isArchived: true },
];

describe("Text field drafts", () => {
  const text = definition("Text");

  it("Starts empty and unchanged without a stored value", () => {
    const draft = storedDraft(text, undefined);

    expect(draft).toEqual({ kind: "Text", text: "" });
    expect(isDraftChanged(text, draft, undefined)).toBe(false);
    expect(draftError(draft)).toBeNull();
  });

  it("Shows the stored value without marking it changed", () => {
    const value = stored({ textValue: "Check cost" });

    const draft = storedDraft(text, value);

    expect(draft).toEqual({ kind: "Text", text: "Check cost" });
    expect(isDraftChanged(text, draft, value)).toBe(false);
  });

  it("Typing makes the field changed and sends the trimmed text", () => {
    const draft: CustomFieldDraft = { kind: "Text", text: "  New note  " };

    const changed = isDraftChanged(text, draft, undefined);

    expect(changed).toBe(true);
    expect(draftInput(text, draft)).toEqual({ fieldDefinitionId: FIELD_ID, textValue: "New note" });
  });

  it("Blank text removes a stored value", () => {
    const draft: CustomFieldDraft = { kind: "Text", text: "   " };

    const changed = isDraftChanged(text, draft, stored({ textValue: "Old" }));

    expect(changed).toBe(true);
    expect(draftInput(text, draft)).toEqual({ fieldDefinitionId: FIELD_ID, textValue: null });
  });

  it("Blank text over no stored value is not a change", () => {
    const draft: CustomFieldDraft = { kind: "Text", text: "   " };

    const changed = isDraftChanged(text, draft, undefined);

    expect(changed).toBe(false);
  });

  it("Displays the stored text", () => {
    const shown = storedDisplayValue(text, stored({ textValue: "Shown" }), []);

    expect(shown).toBe("Shown");
  });
});

describe("Number field drafts", () => {
  const number = definition("Number");

  it("Starts empty and unchanged without a stored value", () => {
    const draft = storedDraft(number, undefined, "en-US");

    expect(draft).toEqual({ kind: "Number", text: "" });
    expect(isDraftChanged(number, draft, undefined, "en-US")).toBe(false);
    expect(draftError(draft, "en-US")).toBeNull();
  });

  it("Shows the stored number as text", () => {
    const value = stored({ numberValue: 3.5 });

    const draft = storedDraft(number, value, "en-US");

    expect(draft).toEqual({ kind: "Number", text: "3.5" });
    expect(isDraftChanged(number, draft, value, "en-US")).toBe(false);
  });

  it("A valid number is parsed and sent", () => {
    const draft: CustomFieldDraft = { kind: "Number", text: "12.5" };

    const input = draftInput(number, draft, "en-US");

    expect(draftError(draft, "en-US")).toBeNull();
    expect(isDraftChanged(number, draft, undefined, "en-US")).toBe(true);
    expect(input).toEqual({ fieldDefinitionId: FIELD_ID, numberValue: 12.5 });
  });

  it.each(["twelve", "1.2.3", "Infinity", "NaN"])(
    "Text %s that is not a finite number shows an inline error",
    (text) => {
      const draft: CustomFieldDraft = { kind: "Number", text };

      const error = draftError(draft, "en-US");

      expect(error).toBe(NUMBER_ERROR);
      expect(NUMBER_ERROR).toBe("Enter a valid number.");
    },
  );

  it("An invalid number counts as a change so the draft cannot be forgotten", () => {
    const draft: CustomFieldDraft = { kind: "Number", text: "twelve" };

    const changed = isDraftChanged(number, draft, undefined, "en-US");

    expect(changed).toBe(true);
    expect(draftInput(number, draft, "en-US").numberValue).toBeNull();
  });

  it("Blank text removes a stored number", () => {
    const draft: CustomFieldDraft = { kind: "Number", text: " " };

    const changed = isDraftChanged(number, draft, stored({ numberValue: 7 }), "en-US");

    expect(draftError(draft, "en-US")).toBeNull();
    expect(changed).toBe(true);
    expect(draftInput(number, draft, "en-US").numberValue).toBeNull();
  });

  it("The same number written differently is not a change", () => {
    const draft: CustomFieldDraft = { kind: "Number", text: "12.0" };

    const changed = isDraftChanged(number, draft, stored({ numberValue: 12 }), "en-US");

    expect(changed).toBe(false);
  });

  it("Numbers use the given locale", () => {
    const value = stored({ numberValue: 1.5 });
    const typed: CustomFieldDraft = { kind: "Number", text: "12,5" };

    const shown = storedDraft(number, value, "fr-FR");

    expect(shown).toEqual({ kind: "Number", text: "1,5" });
    expect(draftError(typed, "fr-FR")).toBeNull();
    expect(draftInput(number, typed, "fr-FR").numberValue).toBe(12.5);
  });
});

describe("Date field drafts", () => {
  const date = definition("Date");

  it("Starts empty and unchanged without a stored value", () => {
    const draft = storedDraft(date, undefined);

    expect(draft).toEqual({ kind: "Date", date: "" });
    expect(isDraftChanged(date, draft, undefined)).toBe(false);
    expect(storedDisplayValue(date, undefined, [])).toBe("(none)");
  });

  it("Shows the stored date in the picker", () => {
    const value = stored({ dateValue: "2026-11-20" });

    const draft = storedDraft(date, value);

    expect(draft).toEqual({ kind: "Date", date: "2026-11-20" });
    expect(isDraftChanged(date, draft, value)).toBe(false);
  });

  it("Picking a date sends it as a date-only value", () => {
    const draft: CustomFieldDraft = { kind: "Date", date: "2026-12-01" };

    const input = draftInput(date, draft);

    expect(isDraftChanged(date, draft, undefined)).toBe(true);
    expect(input).toEqual({ fieldDefinitionId: FIELD_ID, dateValue: "2026-12-01" });
  });

  it("Clearing removes a stored date", () => {
    const draft: CustomFieldDraft = { kind: "Date", date: "" };

    const changed = isDraftChanged(date, draft, stored({ dateValue: "2026-11-20" }));

    expect(changed).toBe(true);
    expect(draftInput(date, draft).dateValue).toBeNull();
  });

  it("Displays the stored date as a calendar date", () => {
    const shown = storedDisplayValue(date, stored({ dateValue: "2026-11-20" }), []);

    expect(shown).toBe("Nov 20, 2026");
  });
});

describe("Boolean field drafts", () => {
  const boolean = definition("Boolean");

  it("Has none selected and is unchanged by default", () => {
    const draft = storedDraft(boolean, undefined);

    expect(draft).toEqual({ kind: "Boolean", selection: "none" });
    expect(isDraftChanged(boolean, draft, undefined)).toBe(false);
  });

  it.each([
    [true, "yes", "Yes"],
    [false, "no", "No"],
  ] as const)("Selects the stored value %s", (value, selection, label) => {
    const row = stored({ boolValue: value });

    const draft = storedDraft(boolean, row);

    expect(draft).toEqual({ kind: "Boolean", selection });
    expect(isDraftChanged(boolean, draft, row)).toBe(false);
    expect(storedDisplayValue(boolean, row, [])).toBe(label);
  });

  it("Choosing yes sends true", () => {
    const draft: CustomFieldDraft = { kind: "Boolean", selection: "yes" };

    const input = draftInput(boolean, draft);

    expect(isDraftChanged(boolean, draft, undefined)).toBe(true);
    expect(input).toEqual({ fieldDefinitionId: FIELD_ID, boolValue: true });
  });

  it("Choosing no sends false rather than removing the value", () => {
    const draft: CustomFieldDraft = { kind: "Boolean", selection: "no" };

    const input = draftInput(boolean, draft);

    expect(input).toEqual({ fieldDefinitionId: FIELD_ID, boolValue: false });
  });

  it("Choosing none removes a stored value", () => {
    const draft: CustomFieldDraft = { kind: "Boolean", selection: "none" };

    const changed = isDraftChanged(boolean, draft, stored({ boolValue: true }));

    expect(changed).toBe(true);
    expect(draftInput(boolean, draft).boolValue).toBeNull();
  });
});

describe("Choice field drafts", () => {
  const choice = definition("Choice");

  it("Has none selected and is unchanged by default", () => {
    const draft = storedDraft(choice, undefined);

    expect(draft).toEqual({ kind: "Choice", choiceId: null });
    expect(isDraftChanged(choice, draft, undefined)).toBe(false);
  });

  it("The archived choice the item already uses stays selected and unchanged", () => {
    const row = stored({ choiceId: RETIRED_ID });

    const draft = storedDraft(choice, row);

    expect(draft).toEqual({ kind: "Choice", choiceId: RETIRED_ID });
    expect(isDraftChanged(choice, draft, row)).toBe(false);
    expect(storedDisplayValue(choice, row, choices)).toBe("Retired (archived)");
  });

  it("Picking a choice sends its ID", () => {
    const draft: CustomFieldDraft = { kind: "Choice", choiceId: READY_ID };

    const input = draftInput(choice, draft);

    expect(isDraftChanged(choice, draft, undefined)).toBe(true);
    expect(input).toEqual({ fieldDefinitionId: FIELD_ID, choiceId: READY_ID });
  });

  it("Picking none removes the stored choice", () => {
    const draft: CustomFieldDraft = { kind: "Choice", choiceId: null };

    const changed = isDraftChanged(choice, draft, stored({ choiceId: READY_ID }));

    expect(changed).toBe(true);
    expect(draftInput(choice, draft).choiceId).toBeNull();
  });
});
