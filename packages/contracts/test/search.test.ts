import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { ItemQuery, ItemSearchResults, SearchScope } from "../src/index.js";

describe("Search contracts", () => {
  it("Normalizes GUIDs to uppercase across scopes and filters", () => {
    const projectId = "0190a1b2-0000-7000-8000-000000000001";
    const folderId = "0190a1b2-0000-7000-8000-000000000002";
    const choiceId = "0190a1b2-0000-7000-8000-000000000003";
    const decoded = Schema.decodeUnknownSync(ItemQuery)({
      scope: { kind: "area", projectId, folderId, includeSubfolders: true },
      text: "invoice",
      filters: [
        { fieldKey: "priority", operator: "equals", value: { kind: "choice", id: choiceId } },
        {
          fieldKey: "due",
          operator: "between",
          value: { kind: "dateRange", min: "2026-11-01", max: "2026-11-30" },
        },
      ],
      includeCompleted: false,
    });

    expect(decoded.scope).toEqual({
      kind: "area",
      projectId: projectId.toUpperCase(),
      folderId: folderId.toUpperCase(),
      includeSubfolders: true,
    });
    expect(decoded.filters[0]?.value).toEqual({ kind: "choice", id: choiceId.toUpperCase() });
  });

  it("Decodes search results with location path and display labels", () => {
    const decoded = Schema.decodeUnknownSync(ItemSearchResults)({
      items: [
        {
          itemId: "0190a1b2-0000-7000-8000-000000000010",
          projectId: "0190a1b2-0000-7000-8000-000000000001",
          projectName: "Billing",
          folderId: null,
          parentItemId: null,
          title: "Check invoice",
          ticketNumber: "JIRA-42",
          itemTypeId: null,
          priorityLevelId: null,
          statusId: null,
          dueDate: "2026-11-20",
          dueTime: "15:30:00",
          isCompleted: false,
          hasSchedule: false,
          location: ["Billing"],
          typeName: "Change",
          priorityLabel: "1 · High",
          statusName: "In Progress",
        },
      ],
      hasMore: false,
    });

    expect(decoded.items[0]?.itemId).toBe("0190A1B2-0000-7000-8000-000000000010");
    expect(decoded.hasMore).toBe(false);
  });

  it("Rejects invalid scope project GUIDs", () => {
    expect(() =>
      Schema.decodeUnknownSync(SearchScope)({ kind: "project", projectId: "not-a-guid" }),
    ).toThrow();
  });
});
