import { describe, expect, it } from "vitest";
import {
  type FieldDataType,
  type FilterOperator,
  type FilterValue,
  type ItemQuery,
  type SearchableField,
  type SearchChoice,
  createField,
  listSearchableFields,
  listSearchChoices,
  searchOperatorsFor,
  validateItemQuery,
} from "../../src/index.js";

function field(
  key: string,
  dataType: FieldDataType,
  fieldDefinitionId: string | null = null,
): SearchableField {
  return {
    key,
    displayName: key,
    dataType,
    fieldDefinitionId,
    source:
      fieldDefinitionId === null
        ? { kind: "builtIn", column: key }
        : { kind: "custom", fieldDefinitionId },
  };
}

describe("searchOperatorsFor", () => {
  it("Offers contains and emptiness without ordered comparison for text fields", () => {
    const operators = searchOperatorsFor(field("title", "Text"));

    expect(operators).toEqual(["equals", "notEquals", "contains", "isEmpty", "isNotEmpty"]);
  });

  it("Offers only presence tests for the built-in reminder field", () => {
    const operators = searchOperatorsFor(field("reminder", "Boolean"));

    expect(operators).toEqual(["isNotEmpty", "isEmpty"]);
  });

  it("Offers contains and emptiness only for the built-in link field", () => {
    const operators = searchOperatorsFor(field("link", "Text"));

    expect(operators).toEqual(["contains", "isEmpty", "isNotEmpty"]);
  });

  it.each(["Number", "Date"] as const)(
    "Offers ordered comparison and between for %s fields",
    (dataType) => {
      const operators = searchOperatorsFor(field("effort", dataType, "FIELD-1"));

      expect(operators).toEqual([
        "equals",
        "notEquals",
        "greaterThan",
        "lessThan",
        "between",
        "isEmpty",
        "isNotEmpty",
      ]);
    },
  );

  it("Offers ordered comparisons for built-in priority but not a custom choice", () => {
    const priority = searchOperatorsFor(field("priority", "Choice"));
    const type = searchOperatorsFor(field("type", "Choice", "FIELD-2"));

    expect(priority).toContain("between");
    expect(priority).toContain("greaterThan");
    expect(priority).toContain("lessThan");
    expect(type).toEqual(["equals", "notEquals", "isEmpty", "isNotEmpty"]);
  });

  it("Does not treat a custom choice field named priority as ordered", () => {
    const lookalike = field("priority", "Choice", "FIELD-1");

    expect(searchOperatorsFor(lookalike)).not.toContain("greaterThan");
    expect(searchOperatorsFor(lookalike)).not.toContain("between");
  });

  it("Offers equality and emptiness only for boolean fields", () => {
    const operators = searchOperatorsFor(field("completed", "Boolean"));

    expect(operators).toEqual(["equals", "notEquals", "isEmpty", "isNotEmpty"]);
  });

  it("Accepts every offered operator with a suitable value in the query validator", () => {
    const priorityLevels = [
      {
        id: "PRI-1",
        name: "High",
        number: 1,
        colorKey: null,
        isBuiltIn: false,
        isArchived: false,
        sortOrder: 0,
      },
      {
        id: "PRI-2",
        name: "Low",
        number: 2,
        colorKey: null,
        isBuiltIn: false,
        isArchived: false,
        sortOrder: 1,
      },
    ];
    const definitions = [
      createField("F-1", "Notes", "Text", null, []),
      createField("F-2", "Effort", "Number", null, []),
      createField("F-3", "Reviewed on", "Date", null, []),
      createField("F-4", "Billable", "Boolean", null, []),
    ];
    const scope = { kind: "allProjects" } as const;
    const fields = listSearchableFields(scope, definitions, []);

    for (const candidate of fields) {
      const choices = listSearchChoices(candidate, { priorityLevels, choices: [] });
      for (const operator of searchOperatorsFor(candidate)) {
        const query: ItemQuery = {
          scope,
          text: null,
          filters: [
            {
              fieldKey: candidate.key,
              operator,
              value: suitableValue(candidate, operator, choices),
            },
          ],
          includeCompleted: true,
        };

        expect(() =>
          validateItemQuery(query, {
            fields,
            choicesByFieldKey: new Map([[candidate.key, choices]]),
          }),
        ).not.toThrow();
      }
    }
  });
});

function suitableValue(
  target: SearchableField,
  operator: FilterOperator,
  choices: ReadonlyArray<SearchChoice>,
): FilterValue | null {
  if (operator === "isEmpty" || operator === "isNotEmpty") {
    return null;
  }
  const isRange = operator === "between";
  const ranked = [...choices].toSorted((left, right) => left.sortOrder - right.sortOrder);

  switch (target.dataType) {
    case "Text":
      return { kind: "text", value: "x" };
    case "Boolean":
      return { kind: "boolean", value: true };
    case "Number":
      return isRange ? { kind: "numberRange", min: 1, max: 2 } : { kind: "number", value: 1 };
    case "Date":
      return isRange
        ? { kind: "dateRange", min: "2026-11-01", max: "2026-11-30" }
        : { kind: "date", value: "2026-11-14" };
    case "Choice":
      return isRange
        ? { kind: "choiceRange", min: ranked[0]!.id, max: ranked[ranked.length - 1]!.id }
        : { kind: "choice", id: ranked[0]!.id };
  }
}
