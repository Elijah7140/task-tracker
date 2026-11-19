import { describe, expect, it } from "vitest";
import {
  BOOLEAN_OPTIONS,
  choiceOptions,
  lookupOptions,
  NONE_VALUE,
} from "../../src/editor/editor-options.js";

const FIELD_ID = "0190A1B2-0000-7000-8000-000000000010";

const choice = (id: string, label: string, sortOrder: number, isArchived = false) => ({
  id,
  fieldDefinitionId: FIELD_ID,
  label,
  sortOrder,
  isArchived,
});

const lookup = (id: string, name: string, sortOrder: number, isArchived = false) => ({
  id,
  name,
  colorKey: null,
  isBuiltIn: false,
  isArchived,
  sortOrder,
  number: null,
  label: name,
});

describe("BOOLEAN_OPTIONS", () => {
  it("Offers none, yes and no", () => {
    const labels = BOOLEAN_OPTIONS.map((option) => option.label);

    expect(labels).toEqual(["(none)", "Yes", "No"]);
  });
});

describe("choiceOptions", () => {
  it("Offers none then the active choices in order", () => {
    const choices = [choice("B", "Blocked", 1), choice("R", "Ready", 0)];

    const options = choiceOptions(choices, null);

    expect(options).toEqual([
      { value: NONE_VALUE, label: "(none)" },
      { value: "R", label: "Ready" },
      { value: "B", label: "Blocked" },
    ]);
  });

  it("Does not offer archived choices unless the item uses them", () => {
    const choices = [choice("X", "Retired", 0, true), choice("R", "Ready", 1)];

    const offered = choiceOptions(choices, null).map((option) => option.label);
    const kept = choiceOptions(choices, "X").map((option) => option.label);

    expect(offered).toEqual(["(none)", "Ready"]);
    expect(kept).toEqual(["(none)", "Retired (archived)", "Ready"]);
  });
});

describe("lookupOptions", () => {
  it("Offers None then the active lookups in order", () => {
    const lookups = [lookup("H", "High", 1), lookup("C", "Critical", 0)];

    const options = lookupOptions(lookups, null);

    expect(options).toEqual([
      { value: NONE_VALUE, label: "None" },
      { value: "C", label: "Critical" },
      { value: "H", label: "High" },
    ]);
  });

  it("Keeps only the archived lookup the item uses, labelled as archived", () => {
    const lookups = [lookup("L", "Legacy", 0, true), lookup("O", "Old", 1, true)];

    const options = lookupOptions(lookups, "L").map((option) => option.label);

    expect(options).toEqual(["None", "Legacy (archived)"]);
  });

  it("Shows a priority's number label rather than its bare name", () => {
    const levels = [
      { ...lookup("N", "", 0), number: 7, label: "7" },
      { ...lookup("H", "Hotfix", 1), number: 2, label: "2 · Hotfix" },
    ];

    const options = lookupOptions(levels, null).map((option) => option.label);

    expect(options).toEqual(["None", "7", "2 · Hotfix"]);
  });
});
