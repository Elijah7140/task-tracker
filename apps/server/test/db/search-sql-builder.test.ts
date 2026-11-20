import { describe, expect, it } from "vitest";
import { foldSearchText, type ItemQuery, type SearchableField } from "@task-tracker/core";
import { buildSearchSql } from "../../src/db/search-sql-builder.js";

describe("buildSearchSql", () => {
  it("Selects only result columns and binds limit + 1 for a blank search", () => {
    const query: ItemQuery = {
      scope: { kind: "allProjects" },
      text: null,
      filters: [],
      includeCompleted: true,
    };

    const { sql, parameters } = buildSearchSql(query, [], 200);

    expect(sql.startsWith("SELECT t.Id, t.ProjectId, p.Name")).toBe(true);
    expect(sql).not.toContain("t.Description");
    expect(sql).toContain("ORDER BY p.SortOrder, tt_fold(t.Title), t.Id LIMIT ?");
    expect(parameters.at(-1)).toBe(201);
  });

  it("Joins FTS5 and custom values and orders by bm25 before the SQL limit", () => {
    const fieldId = "019A0000-0000-7000-8000-000000000101";
    const fields: ReadonlyArray<SearchableField> = [
      {
        key: "note",
        displayName: "Note",
        dataType: "Text",
        fieldDefinitionId: fieldId,
        source: { kind: "custom", fieldDefinitionId: fieldId },
      },
    ];
    const query: ItemQuery = {
      scope: { kind: "allProjects" },
      text: "needle",
      filters: [{ fieldKey: "note", operator: "contains", value: { kind: "text", value: "50%_" } }],
      includeCompleted: true,
    };

    const { sql, parameters } = buildSearchSql(query, fields, 2);

    expect(sql).toContain("JOIN TodoItemSearchRow mapping");
    expect(sql).toContain("TodoItemSearch MATCH ?");
    expect(sql).toContain("EXISTS (SELECT 1 FROM ItemFieldValue");
    expect(sql).toContain("instr(tt_fold(v.TextValue), ?) > 0");
    expect(sql).toContain(
      "ORDER BY bm25(TodoItemSearch), p.SortOrder, tt_fold(t.Title), t.Id LIMIT ?",
    );
    expect(parameters).toContain("50%_");
    expect(parameters.at(-1)).toBe(3);
  });

  it("Trims text filter values like .NET, keeping a byte-order mark", () => {
    const fieldId = "019A0000-0000-7000-8000-000000000101";
    const fields: ReadonlyArray<SearchableField> = [
      {
        key: "note",
        displayName: "Note",
        dataType: "Text",
        fieldDefinitionId: fieldId,
        source: { kind: "custom", fieldDefinitionId: fieldId },
      },
    ];
    const value = "\u0085Task\ufeff\u00a0";
    const query: ItemQuery = {
      scope: { kind: "allProjects" },
      text: null,
      filters: [{ fieldKey: "note", operator: "equals", value: { kind: "text", value } }],
      includeCompleted: true,
    };

    const { parameters } = buildSearchSql(query, fields, 2);

    expect(parameters).toContain(foldSearchText("Task\ufeff"));
    expect(parameters).not.toContain(foldSearchText("Task"));
  });
});
