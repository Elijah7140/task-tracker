import { describe, expect, it } from "vitest";
import {
  type FieldFilter,
  type ItemQuery,
  MetadataRuleError,
  createField,
  listSearchableFields,
  validateItemQuery,
} from "../../src/index.js";

function queryWith(filter: FieldFilter): ItemQuery {
  return {
    scope: { kind: "allProjects" },
    text: null,
    filters: [filter],
    includeCompleted: true,
  };
}

describe("validateItemQuery", () => {
  it("Rejects unknown fields and incompatible operators", () => {
    const fields = listSearchableFields({ kind: "allProjects" }, [], []);
    const unknown = queryWith({
      fieldKey: "unknown",
      operator: "equals",
      value: { kind: "text", value: "x" },
    });
    const wrongOperator = queryWith({
      fieldKey: "title",
      operator: "greaterThan",
      value: { kind: "text", value: "x" },
    });

    expect(() => validateItemQuery(unknown, { fields, choicesByFieldKey: new Map() })).toThrowError(
      MetadataRuleError,
    );
    expect(() =>
      validateItemQuery(wrongOperator, { fields, choicesByFieldKey: new Map() }),
    ).toThrowError(MetadataRuleError);
  });

  it("Rejects wrong value types, reversed ranges, non-finite numbers and missing values", () => {
    const estimate = createField("F-1", "Estimate", "Number", null, []);
    const fields = listSearchableFields({ kind: "allProjects" }, [estimate], []);
    const context = { fields, choicesByFieldKey: new Map() };

    expect(() =>
      validateItemQuery(
        queryWith({
          fieldKey: estimate.key,
          operator: "equals",
          value: { kind: "date", value: "2026-11-14" },
        }),
        context,
      ),
    ).toThrowError(MetadataRuleError);

    expect(() =>
      validateItemQuery(
        queryWith({
          fieldKey: estimate.key,
          operator: "between",
          value: { kind: "numberRange", min: 5, max: 2 },
        }),
        context,
      ),
    ).toThrowError(MetadataRuleError);

    expect(() =>
      validateItemQuery(
        queryWith({
          fieldKey: estimate.key,
          operator: "equals",
          value: { kind: "number", value: Number.NaN },
        }),
        context,
      ),
    ).toThrowError(MetadataRuleError);

    expect(() =>
      validateItemQuery(
        queryWith({
          fieldKey: estimate.key,
          operator: "equals",
          value: null,
        }),
        context,
      ),
    ).toThrowError(MetadataRuleError);
  });

  it("Rejects values supplied to isEmpty and isNotEmpty", () => {
    const fields = listSearchableFields({ kind: "allProjects" }, [], []);

    expect(() =>
      validateItemQuery(
        queryWith({
          fieldKey: "title",
          operator: "isEmpty",
          value: { kind: "text", value: "x" },
        }),
        { fields, choicesByFieldKey: new Map() },
      ),
    ).toThrowError(MetadataRuleError);
  });

  it("Rejects choices outside the field and reversed priority ranges", () => {
    const fields = listSearchableFields({ kind: "allProjects" }, [], []);
    const choicesByFieldKey = new Map([
      [
        "priority",
        [
          { id: "PRI-HIGH", label: "High", sortOrder: 0, name: "High", number: null },
          { id: "PRI-LOW", label: "Low", sortOrder: 1, name: "Low", number: null },
        ],
      ],
    ]);

    expect(() =>
      validateItemQuery(
        queryWith({
          fieldKey: "priority",
          operator: "equals",
          value: { kind: "choice", id: "PRI-MISSING" },
        }),
        { fields, choicesByFieldKey },
      ),
    ).toThrowError(MetadataRuleError);

    expect(() =>
      validateItemQuery(
        queryWith({
          fieldKey: "priority",
          operator: "between",
          value: { kind: "choiceRange", min: "PRI-LOW", max: "PRI-HIGH" },
        }),
        { fields, choicesByFieldKey },
      ),
    ).toThrowError("Priority range must run from more important to less important.");
  });
});
