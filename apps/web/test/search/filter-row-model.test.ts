import type { SearchableField } from "@task-tracker/contracts";
import { describe, expect, it } from "vitest";
import {
  createFilterRowDraft,
  evaluateFilterRow,
  type FilterRowDraft,
  isSameField,
  operatorLabelFor,
} from "../../src/search/filter-row-model.js";

type Field = typeof SearchableField.Type;

const ORDERED = [
  "equals",
  "notEquals",
  "greaterThan",
  "lessThan",
  "between",
  "isEmpty",
  "isNotEmpty",
] as const;

const field = (
  key: string,
  dataType: Field["dataType"],
  fieldDefinitionId: string | null = null,
): Field => ({
  key,
  displayName: key,
  dataType,
  fieldDefinitionId,
  operators:
    dataType === "Text" ? ["equals", "notEquals", "contains", "isEmpty", "isNotEmpty"] : ORDERED,
});

const priority = field("priority", "Choice");
const estimate = field("estimate", "Number", "0190A1B2-0000-7000-8000-000000000001");
const due = field("due", "Date");
const title = field("title", "Text");
const approved = field("approved", "Boolean", "0190A1B2-0000-7000-8000-000000000002");

const row = (on: Field, patch: Partial<FilterRowDraft>): FilterRowDraft => ({
  ...createFilterRowDraft("row", on),
  ...patch,
});

describe("operatorLabelFor", () => {
  it("Words ordered operators for priority, dates and numbers", () => {
    const labels = [priority, due, estimate].map((on) => [
      operatorLabelFor(on, "greaterThan"),
      operatorLabelFor(on, "lessThan"),
    ]);

    expect(labels).toEqual([
      ["more important than", "less important than"],
      ["after", "before"],
      ["greater than", "less than"],
    ]);
  });
});

describe("createFilterRowDraft", () => {
  it("Starts a chosen field on its first operator with every value cleared", () => {
    const draft = createFilterRowDraft("row", title);

    expect(draft).toEqual({
      id: "row",
      field: title,
      operator: "equals",
      first: "",
      second: "",
      booleanValue: false,
      firstChoice: null,
      secondChoice: null,
    });
  });
});

describe("isSameField", () => {
  it("Treats a field as the same only with the same key, type and definition", () => {
    const retyped = { ...estimate, dataType: "Text" as const };
    const renamed = { ...estimate, displayName: "Effort" };

    expect([isSameField(estimate, renamed), isSameField(estimate, retyped)]).toEqual([true, false]);
  });
});

describe("evaluateFilterRow", () => {
  it("Keeps a blank row or a row without its value incomplete", () => {
    const outcomes = [
      evaluateFilterRow(createFilterRowDraft("row"), undefined),
      evaluateFilterRow(row(title, { first: "   " }), title),
      evaluateFilterRow(row(due, { operator: "between", first: "2026-11-01" }), due),
      evaluateFilterRow(row(priority, {}), priority),
    ];

    expect(outcomes.map((outcome) => outcome.kind)).toEqual(Array(4).fill("incomplete"));
  });

  it("Requires valid numbers and an in-order number range", () => {
    const outcomes = [
      evaluateFilterRow(row(estimate, { first: "abc" }), estimate),
      evaluateFilterRow(row(estimate, { operator: "between", first: "1", second: "x" }), estimate),
      evaluateFilterRow(row(estimate, { operator: "between", first: "8", second: "3" }), estimate),
      evaluateFilterRow(
        row(estimate, { operator: "between", first: "3", second: "8.5" }),
        estimate,
      ),
    ];

    expect(outcomes).toEqual([
      { kind: "invalid", error: "Enter a valid number." },
      { kind: "invalid", error: "Enter a valid number." },
      { kind: "invalid", error: "The first value must not be after the second." },
      {
        kind: "complete",
        filter: {
          fieldKey: "estimate",
          operator: "between",
          value: { kind: "numberRange", min: 3, max: 8.5 },
        },
      },
    ]);
  });

  it("Requires an in-order date range and sends dates as floating ISO dates", () => {
    const reversed = row(due, { operator: "between", first: "2026-11-30", second: "2026-11-01" });
    const single = row(due, { operator: "lessThan", first: "2026-11-30" });

    const outcomes = [evaluateFilterRow(reversed, due), evaluateFilterRow(single, due)];

    expect(outcomes).toEqual([
      { kind: "invalid", error: "The first value must not be after the second." },
      {
        kind: "complete",
        filter: {
          fieldKey: "due",
          operator: "lessThan",
          value: { kind: "date", value: "2026-11-30" },
        },
      },
    ]);
  });

  it("Asks for the more important priority first in a range", () => {
    const critical = { id: "0190A1B2-0000-7000-8000-00000000000A", sortOrder: 0 };
    const low = { id: "0190A1B2-0000-7000-8000-00000000000B", sortOrder: 3 };

    const backwards = evaluateFilterRow(
      row(priority, { operator: "between", firstChoice: low, secondChoice: critical }),
      priority,
    );
    const forwards = evaluateFilterRow(
      row(priority, { operator: "between", firstChoice: critical, secondChoice: low }),
      priority,
    );

    expect(backwards).toEqual({ kind: "invalid", error: "Put the more important priority first." });
    expect(forwards).toEqual({
      kind: "complete",
      filter: {
        fieldKey: "priority",
        operator: "between",
        value: { kind: "choiceRange", min: critical.id, max: low.id },
      },
    });
  });

  it("Sends no value for IsEmpty and IsNotEmpty and the Boolean shown for Booleans", () => {
    const empty = evaluateFilterRow(row(estimate, { operator: "isEmpty", first: "abc" }), estimate);
    const yes = evaluateFilterRow(row(approved, { booleanValue: true }), approved);

    expect(empty).toEqual({
      kind: "complete",
      filter: { fieldKey: "estimate", operator: "isEmpty", value: null },
    });
    expect(yes).toEqual({
      kind: "complete",
      filter: { fieldKey: "approved", operator: "equals", value: { kind: "boolean", value: true } },
    });
  });
});
