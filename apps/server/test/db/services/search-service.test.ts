import { expect, it } from "@effect/vitest";
import { MetadataRuleError, type SearchScope } from "@task-tracker/core";
import { Effect } from "effect";
import {
  bool,
  choice,
  date,
  editFields,
  filter,
  number,
  query,
  seedAreaMatrix,
  seedFilterMatrix,
  sortedTitles,
  text,
  titles,
  withSearchServices,
  type SearchServices,
} from "./search-fixtures.js";

const ALL: SearchScope = { kind: "allProjects" };

const searchTitles = (
  svc: SearchServices,
  filters: Parameters<typeof query>[0],
  options?: Parameters<typeof query>[1],
) => svc.search.search(query(filters, options)).pipe(Effect.map(sortedTitles));

const countRows = (svc: SearchServices, table: "TodoItemSearchRow" | "TodoItemSearch") =>
  svc.sql<{ count: number }>`SELECT count(*) AS count FROM ${svc.sql(table)}`.pipe(
    Effect.map((rows) => rows[0]!.count),
  );

it.effect("Treats percent and underscore as literal text in Contains filters", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      const literal = yield* svc.items.create(project.id, null, null, "ÉCOLE%_");
      yield* svc.items.create(project.id, null, null, "ÉCOLEab");

      const results = yield* svc.search.search(query([filter("title", "contains", text("%_"))]));

      expect(results.items.map((item) => item.itemId)).toEqual([literal.id]);
    }),
  ),
);

it.effect("Matches due dates at the minimum and maximum calendar dates", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      const earliest = yield* svc.items.create(project.id, null, null, "Earliest");
      const latest = yield* svc.items.create(project.id, null, null, "Latest");
      const dueOn = (day: string, time: string) => ({
        dueDate: Temporal.PlainDate.from(day),
        dueTime: Temporal.PlainTime.from(time),
      });
      yield* svc.items.edit(earliest.id, editFields("Earliest", dueOn("0001-01-01", "00:00")));
      yield* svc.items.edit(
        latest.id,
        editFields("Latest", dueOn("9999-12-31", "23:59:59.9999999")),
      );
      const match = (operator: "equals" | "lessThan", value: string) =>
        searchTitles(svc, [filter("due", operator, date(value))]);

      const atMax = yield* match("equals", "9999-12-31");
      const beforeMax = yield* match("lessThan", "9999-12-31");
      const atMin = yield* match("equals", "0001-01-01");
      const beforeMin = yield* match("lessThan", "0001-01-01");
      const range = yield* searchTitles(svc, [
        filter("due", "between", { kind: "dateRange", min: "0001-01-01", max: "9999-12-31" }),
      ]);

      expect(atMax).toEqual(["Latest"]);
      expect(beforeMax).toEqual(["Earliest"]);
      expect(atMin).toEqual(["Earliest"]);
      expect(beforeMin).toEqual([]);
      expect(range).toEqual(["Earliest", "Latest"]);
    }),
  ),
);

it.effect("Folds Unicode case in title, ticket, status and custom text filters", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      const note = yield* svc.fields.create("Note", "Text", null);
      const status = yield* svc.lookups.statuses.add("ÉCOLE", "Open");
      const matching = yield* svc.items.create(project.id, null, null, "ÉCOLE");
      const other = yield* svc.items.create(project.id, null, null, "Other");
      yield* svc.items.create(project.id, null, null, "Missing");
      yield* svc.items.edit(
        matching.id,
        editFields("ÉCOLE", { ticketNumber: "ÉCOLE-1", statusId: status.id }),
        [{ fieldDefinitionId: note.id, textValue: "ÉCOLE" }],
      );
      yield* svc.items.edit(other.id, editFields("Other", { ticketNumber: "OTHER-1" }), [
        { fieldDefinitionId: note.id, textValue: "Other" },
      ]);
      const cases = [
        { key: "title", expected: " école " },
        { key: "ticket", expected: "école-1" },
        { key: note.key, expected: "école" },
      ];

      const outcomes = yield* Effect.forEach(cases, ({ key, expected }) =>
        Effect.all({
          equal: searchTitles(svc, [filter(key, "equals", text(expected))]),
          different: searchTitles(svc, [filter(key, "notEquals", text(expected))]),
          contained: searchTitles(svc, [filter(key, "contains", text("COL"))]),
        }),
      );
      const byStatus = yield* searchTitles(svc, [filter("status", "equals", text("école"))]);

      expect(outcomes).toEqual([
        { equal: ["ÉCOLE"], different: ["Missing", "Other"], contained: ["ÉCOLE"] },
        { equal: ["ÉCOLE"], different: ["Other"], contained: ["ÉCOLE"] },
        { equal: ["ÉCOLE"], different: ["Other"], contained: ["ÉCOLE"] },
      ]);
      expect(byStatus).toEqual(["ÉCOLE"]);
    }),
  ),
);

it.effect("Treats every Greek sigma form as the same letter", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      yield* svc.items.create(project.id, null, null, "ΟΣ");

      const equal = yield* searchTitles(svc, [filter("title", "equals", text("ος"))]);
      const different = yield* searchTitles(svc, [filter("title", "notEquals", text("ος"))]);
      const contained = yield* searchTitles(svc, [filter("title", "contains", text("ς"))]);

      expect(equal).toEqual(["ΟΣ"]);
      expect(different).toEqual([]);
      expect(contained).toEqual(["ΟΣ"]);
    }),
  ),
);

it.effect("Projects every result property with its location and lookup labels", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Billing");
      const folder = yield* svc.folders.create(project.id, null, "Tables");
      const [itemType] = yield* svc.lookups.itemTypes.list();
      const [priority] = yield* svc.lookups.priorityLevels.list();
      const parent = yield* svc.items.create(project.id, folder.id, null, "Parent");
      const child = yield* svc.items.create(project.id, folder.id, parent.id, "Child");
      yield* svc.items.edit(
        child.id,
        editFields("Child", {
          ticketNumber: "OPS-42",
          itemTypeId: itemType!.id,
          priorityLevelId: priority!.id,
          dueDate: Temporal.PlainDate.from("2026-11-20"),
          dueTime: Temporal.PlainTime.from("09:30:15.1234567"),
        }),
      );
      yield* svc.items.setCompleted(project.id, folder.id, child.id, true);

      const results = yield* svc.search.search(query([filter("ticket", "equals", text("OPS-42"))]));

      expect(results).toEqual({
        hasMore: false,
        items: [
          {
            itemId: child.id,
            projectId: project.id,
            projectName: "Billing",
            folderId: folder.id,
            parentItemId: parent.id,
            title: "Child",
            ticketNumber: "OPS-42",
            itemTypeId: itemType!.id,
            priorityLevelId: priority!.id,
            statusId: expect.any(String),
            dueDate: "2026-11-20",
            dueTime: "09:30:15.1234567",
            isCompleted: true,
            location: ["Billing", "Tables"],
            typeName: itemType!.name,
            priorityLabel: "Critical",
            statusName: "Completed",
          },
        ],
      });
    }),
  ),
);

it.effect("Searches text by FTS5 prefix terms without passing query syntax to MATCH", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Billing");
      const item = yield* svc.items.create(project.id, null, null, "Résumé JIRA-1234");
      yield* svc.items.edit(
        item.id,
        editFields("Résumé JIRA-1234", { description: "Confirm invoice totals" }),
      );

      const byDiacritic = yield* searchTitles(svc, [], { text: "resume inv" });
      const byTicket = yield* searchTitles(svc, [], { text: "JIRA-1234" });
      const quoted = yield* searchTitles(svc, [], { text: '"resume OR status:open"' });
      const operators = yield* searchTitles(svc, [], { text: "* ( ) :" });
      const blank = yield* searchTitles(svc, [], { text: "   " });

      expect(byDiacritic).toEqual(["Résumé JIRA-1234"]);
      expect(byTicket).toEqual(["Résumé JIRA-1234"]);
      expect(quoted).toEqual([]);
      expect(operators).toEqual(["Résumé JIRA-1234"]);
      expect(blank).toEqual(["Résumé JIRA-1234"]);
    }),
  ),
);

it.effect("Follows edits, soft deletion and restore in text search", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      const item = yield* svc.items.create(project.id, null, null, "Résumé JIRA-1234");
      yield* svc.items.edit(item.id, editFields("Changed"));

      const oldTitle = yield* searchTitles(svc, [], { text: "resume" });
      const newTitle = yield* searchTitles(svc, [], { text: "Chan" });
      const batchId = yield* svc.items.delete(project.id, null, item.id);
      const deleted = yield* searchTitles(svc, [], { text: "Changed" });
      yield* svc.items.restore(project.id, null, batchId);
      const restored = yield* searchTitles(svc, [], { text: "Changed" });

      expect(oldTitle).toEqual([]);
      expect(newTitle).toEqual(["Changed"]);
      expect(deleted).toEqual([]);
      expect(restored).toEqual(["Changed"]);
    }),
  ),
);

it.effect("Removes the mapping and FTS rows when an item is permanently deleted", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      const item = yield* svc.items.create(project.id, null, null, "Résumé");
      const batchId = yield* svc.items.delete(project.id, null, item.id);
      const before = [
        yield* countRows(svc, "TodoItemSearchRow"),
        yield* countRows(svc, "TodoItemSearch"),
      ];

      yield* svc.trash.purge(batchId);

      expect(before).toEqual([1, 1]);
      expect(yield* countRows(svc, "TodoItemSearchRow")).toBe(0);
      expect(yield* countRows(svc, "TodoItemSearch")).toBe(0);
      expect(yield* searchTitles(svc, [], { text: "resume" })).toEqual([]);
    }),
  ),
);

it.effect("Keeps the stable search row ID of surviving items through VACUUM", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      const removed = yield* svc.items.create(project.id, null, null, "Removed");
      const survivor = yield* svc.items.create(project.id, null, null, "Surviving record");
      const batchId = yield* svc.items.delete(project.id, null, removed.id);
      yield* svc.trash.purge(batchId);
      const rowId = svc.sql<{ RowId: number }>`SELECT RowId FROM TodoItemSearchRow
        WHERE ItemId = ${survivor.id}`;
      const before = yield* rowId;

      yield* svc.sql`VACUUM`;
      const results = yield* svc.search.search(query([], { text: "surviv" }));

      expect(results.items.map((item) => item.itemId)).toEqual([survivor.id]);
      expect(yield* rowId).toEqual(before);
    }),
  ),
);

it.effect("Includes sub-items in scope and excludes deleted ancestors", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const { first, main } = yield* seedAreaMatrix(svc);
      const area = (folderId: string | null, includeSubfolders: boolean): SearchScope => ({
        kind: "area",
        projectId: first.id,
        folderId,
        includeSubfolders,
      });
      const inScope = (scope: SearchScope, includeCompleted = true) =>
        searchTitles(svc, [], { scope, includeCompleted });

      const outcomes = [
        yield* inScope(ALL),
        yield* inScope({ kind: "project", projectId: first.id }),
        yield* inScope(area(null, false)),
        yield* inScope(area(null, true)),
        yield* inScope(area(main.id, false)),
        yield* inScope(area(main.id, true)),
        yield* inScope(ALL, false),
      ];

      const firstProject = "Child,Complete,Folder,Parent,Root,Sibling,Subitem".split(",");
      expect(outcomes).toEqual([
        [...firstProject, "Other project"].toSorted(),
        firstProject,
        ["Complete", "Root"],
        firstProject,
        ["Folder"],
        ["Child", "Folder", "Parent", "Subitem"],
        ["Child", "Folder", "Other project", "Parent", "Root", "Sibling", "Subitem"],
      ]);
    }),
  ),
);

it.effect(
  "Excludes completed items even when filtered by completion and drops deleted projects",
  () =>
    withSearchServices((svc) =>
      Effect.gen(function* () {
        const { second } = yield* seedAreaMatrix(svc);

        const hiddenCompleted = yield* searchTitles(
          svc,
          [filter("completed", "equals", bool(true))],
          {
            includeCompleted: false,
          },
        );
        yield* svc.projects.delete(second.id);
        const remaining = yield* searchTitles(svc, []);

        expect(hiddenCompleted).toEqual([]);
        expect(remaining).toEqual("Child,Complete,Folder,Parent,Root,Sibling,Subitem".split(","));
      }),
    ),
);

it.effect("Orders equal text scores by project order before item ID", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const later = yield* svc.projects.create("Later");
      const earlier = yield* svc.projects.create("Earlier");
      yield* svc.projects.reorder([earlier.id, later.id]);
      yield* svc.items.create(later.id, null, null, "Needle");
      const expected = yield* svc.items.create(earlier.id, null, null, "Needle");

      const results = yield* svc.search.search(query([], { text: "needle" }), 1);

      expect(results.hasMore).toBe(true);
      expect(results.items.map((item) => item.itemId)).toEqual([expected.id]);
    }),
  ),
);

it.effect("Orders by text rank before project order", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const first = yield* svc.projects.create("First");
      const second = yield* svc.projects.create("Second");
      const descriptionHit = yield* svc.items.create(first.id, null, null, "Unrelated");
      yield* svc.items.edit(
        descriptionHit.id,
        editFields("Unrelated", { description: "needle plus many extra unrelated words" }),
      );
      const titleHit = yield* svc.items.create(second.id, null, null, "Needle");

      const results = yield* svc.search.search(query([], { text: "needle" }));

      expect(results.items.map((item) => item.itemId)).toEqual([titleHit.id, descriptionHit.id]);
    }),
  ),
);

it.effect("Orders folded equal titles by item ID", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      const upper = yield* svc.items.create(project.id, null, null, "Same");
      const lower = yield* svc.items.create(project.id, null, null, "same");

      const results = yield* svc.search.search(query([]));

      expect(results.items.map((item) => item.itemId)).toEqual([upper.id, lower.id].toSorted());
    }),
  ),
);

it.effect("Returns a stable bounded page and reports more results", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      yield* seedAreaMatrix(svc);

      const firstPage = yield* svc.search.search(query([]), 2);
      const secondPage = yield* svc.search.search(query([]), 2);
      const everything = yield* svc.search.search(query([]));

      expect(firstPage.hasMore).toBe(true);
      expect(titles(firstPage)).toEqual(["Child", "Complete"]);
      expect(secondPage).toEqual(firstPage);
      expect(everything.hasMore).toBe(false);
      expect(everything.items).toHaveLength(8);
    }),
  ),
);

it.effect("Rejects a limit below one", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(svc.search.search(query([]), 0));

      expect(failure).toEqual(new MetadataRuleError("Search limit must be positive."));
    }),
  ),
);

it.effect("Filters built-in text fields with every allowed operator", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      yield* seedFilterMatrix(svc);
      const match = (key: string, operator: "equals" | "notEquals" | "contains", value: string) =>
        searchTitles(svc, [filter(key, operator, text(value))]);
      const presence = (key: string, operator: "isEmpty" | "isNotEmpty") =>
        searchTitles(svc, [filter(key, operator)]);

      const outcomes = [
        yield* match("title", "equals", " alpha "),
        yield* match("title", "notEquals", "alpha"),
        yield* match("title", "contains", "LPH"),
        yield* presence("title", "isEmpty"),
        yield* presence("title", "isNotEmpty"),
        yield* match("ticket", "equals", "jira-1234"),
        yield* match("ticket", "notEquals", "jira-1234"),
        yield* match("ticket", "contains", "OPS"),
        yield* presence("ticket", "isEmpty"),
        yield* presence("ticket", "isNotEmpty"),
      ];

      expect(outcomes).toEqual([
        ["Alpha"],
        ["Beta", "Gamma"],
        ["Alpha"],
        [],
        ["Alpha", "Beta", "Gamma"],
        ["Alpha"],
        ["Beta"],
        ["Beta"],
        ["Gamma"],
        ["Alpha", "Beta"],
      ]);
    }),
  ),
);

it.effect("Filters due and custom dates with every allowed operator", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const { reviewed } = yield* seedFilterMatrix(svc);
      const cases = [
        { key: "due", first: "2026-11-20", second: "2026-11-30" },
        { key: reviewed.key, first: "2026-11-22", second: "2026-12-02" },
      ];

      const outcomes = yield* Effect.forEach(cases, ({ key, first, second }) =>
        Effect.all([
          searchTitles(svc, [filter(key, "equals", date(first))]),
          searchTitles(svc, [filter(key, "notEquals", date(first))]),
          searchTitles(svc, [filter(key, "greaterThan", date(first))]),
          searchTitles(svc, [filter(key, "lessThan", date(second))]),
          searchTitles(svc, [
            filter(key, "between", { kind: "dateRange", min: first, max: second }),
          ]),
          searchTitles(svc, [filter(key, "isEmpty")]),
          searchTitles(svc, [filter(key, "isNotEmpty")]),
        ]),
      );

      const expected = [
        ["Alpha"],
        ["Beta"],
        ["Beta"],
        ["Alpha"],
        ["Alpha", "Beta"],
        ["Gamma"],
        ["Alpha", "Beta"],
      ];
      expect(outcomes).toEqual([expected, expected]);
    }),
  ),
);

it.effect("Filters custom numbers with every allowed operator", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const { estimate } = yield* seedFilterMatrix(svc);
      const key = estimate.key;

      const outcomes = [
        yield* searchTitles(svc, [filter(key, "equals", number(3.5))]),
        yield* searchTitles(svc, [filter(key, "notEquals", number(3.5))]),
        yield* searchTitles(svc, [filter(key, "greaterThan", number(3.5))]),
        yield* searchTitles(svc, [filter(key, "lessThan", number(8.5))]),
        yield* searchTitles(svc, [
          filter(key, "between", { kind: "numberRange", min: 3.5, max: 8.5 }),
        ]),
        yield* searchTitles(svc, [filter(key, "isEmpty")]),
        yield* searchTitles(svc, [filter(key, "isNotEmpty")]),
      ];

      expect(outcomes).toEqual([
        ["Alpha"],
        ["Beta"],
        ["Beta"],
        ["Alpha"],
        ["Alpha", "Beta"],
        ["Gamma"],
        ["Alpha", "Beta"],
      ]);
    }),
  ),
);

it.effect("Filters completion and custom Booleans with every allowed operator", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const { approved } = yield* seedFilterMatrix(svc);

      const outcomes = [
        yield* searchTitles(svc, [filter("completed", "equals", bool(true))]),
        yield* searchTitles(svc, [filter("completed", "notEquals", bool(true))]),
        yield* searchTitles(svc, [filter("completed", "isEmpty")]),
        yield* searchTitles(svc, [filter("completed", "isNotEmpty")]),
        yield* searchTitles(svc, [filter(approved.key, "equals", bool(true))]),
        yield* searchTitles(svc, [filter(approved.key, "notEquals", bool(true))]),
        yield* searchTitles(svc, [filter(approved.key, "isEmpty")]),
        yield* searchTitles(svc, [filter(approved.key, "isNotEmpty")]),
      ];

      expect(outcomes).toEqual([
        ["Alpha"],
        ["Beta", "Gamma"],
        [],
        ["Alpha", "Beta", "Gamma"],
        ["Alpha"],
        ["Beta"],
        ["Gamma"],
        ["Alpha", "Beta"],
      ]);
    }),
  ),
);

it.effect("Filters type, priority and custom choices, with priority ordered by rank", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const matrix = yield* seedFilterMatrix(svc);
      const cases = [
        { key: "type", id: matrix.typeA.id },
        { key: "priority", id: matrix.priorityA.id },
        { key: matrix.category.key, id: matrix.choiceA.id },
      ];
      const { priorityA, priorityB } = matrix;

      const equality = yield* Effect.forEach(cases, ({ key, id }) =>
        Effect.all([
          searchTitles(svc, [filter(key, "equals", choice(id))]),
          searchTitles(svc, [filter(key, "notEquals", choice(id))]),
          searchTitles(svc, [filter(key, "isEmpty")]),
          searchTitles(svc, [filter(key, "isNotEmpty")]),
        ]),
      );
      const ordered = [
        yield* searchTitles(svc, [filter("priority", "greaterThan", choice(priorityB.id))]),
        yield* searchTitles(svc, [filter("priority", "lessThan", choice(priorityA.id))]),
        yield* searchTitles(svc, [
          filter("priority", "between", {
            kind: "choiceRange",
            min: priorityA.id,
            max: priorityB.id,
          }),
        ]),
      ];

      const expected = [["Alpha"], ["Beta"], ["Gamma"], ["Alpha", "Beta"]];
      expect(equality).toEqual([expected, expected, expected]);
      expect(ordered).toEqual([["Alpha"], ["Beta"], ["Alpha", "Beta"]]);
    }),
  ),
);

it.effect("Filters custom text with every allowed operator", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const { note } = yield* seedFilterMatrix(svc);
      const key = note.key;

      const outcomes = [
        yield* searchTitles(svc, [filter(key, "equals", text(" RED "))]),
        yield* searchTitles(svc, [filter(key, "notEquals", text("red"))]),
        yield* searchTitles(svc, [filter(key, "contains", text("LU"))]),
        yield* searchTitles(svc, [filter(key, "isEmpty")]),
        yield* searchTitles(svc, [filter(key, "isNotEmpty")]),
      ];

      expect(outcomes).toEqual([["Alpha"], ["Beta"], ["Beta"], ["Gamma"], ["Alpha", "Beta"]]);
    }),
  ),
);

it.effect("Combines date and number comparisons with AND", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const { estimate, reviewed } = yield* seedFilterMatrix(svc);

      const results = yield* searchTitles(svc, [
        filter("due", "lessThan", date("2026-11-30")),
        filter("due", "equals", date("2026-11-20")),
        filter(estimate.key, "between", { kind: "numberRange", min: 3, max: 4 }),
        filter(reviewed.key, "greaterThan", date("2026-11-20")),
      ]);

      expect(results).toEqual(["Alpha"]);
    }),
  ),
);

it.effect("Compares priority by current rank, independent of level numbers", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      const [urgent, routine, ...rest] = yield* svc.lookups.priorityLevels.list();
      yield* svc.lookups.priorityLevels.setNumber(urgent!.id, 7);
      yield* svc.lookups.priorityLevels.setNumber(routine!.id, 1);
      const item = yield* svc.items.create(project.id, null, null, "Work");
      yield* svc.items.edit(item.id, editFields("Work", { priorityLevelId: urgent!.id }));
      const moreImportant = filter("priority", "greaterThan", choice(routine!.id));

      const before = yield* searchTitles(svc, [moreImportant]);
      yield* svc.lookups.priorityLevels.reorder([
        routine!.id,
        urgent!.id,
        ...rest.map((level) => level.id),
      ]);
      const after = yield* searchTitles(svc, [moreImportant]);

      expect(before).toEqual(["Work"]);
      expect(after).toEqual([]);
    }),
  ),
);

it.effect("Excludes items without a custom number from NotEquals", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      const estimate = yield* svc.fields.create("Estimate", "Number", null);
      const first = yield* svc.items.create(project.id, null, null, "First");
      yield* svc.items.create(project.id, null, null, "Second");
      yield* svc.items.edit(first.id, editFields("First"), [
        { fieldDefinitionId: estimate.id, numberValue: 3 },
      ]);

      const results = yield* searchTitles(svc, [filter(estimate.key, "notEquals", number(2))]);

      expect(results).toEqual(["First"]);
    }),
  ),
);

it.effect("Filters links by address or title text and by presence", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Ops");
      const linked = yield* svc.items.create(project.id, null, null, "Linked");
      yield* svc.items.create(project.id, null, null, "Plain");
      yield* svc.sql`INSERT INTO ItemLink (Id, ItemId, Url, Title, SortOrder, CreatedAtUtc)
        VALUES ('019A0000-0000-7000-8000-000000009001', ${linked.id},
          'https://example.com/DOCS', 'Runbook', 0, '2026-11-14 00:00:00')`;

      const byTitle = yield* searchTitles(svc, [filter("link", "contains", text("runbook"))]);
      const byAddress = yield* searchTitles(svc, [filter("link", "contains", text(" docs "))]);
      const missing = yield* searchTitles(svc, [filter("link", "contains", text("wiki"))]);
      const empty = yield* searchTitles(svc, [filter("link", "isEmpty")]);
      const present = yield* searchTitles(svc, [filter("link", "isNotEmpty")]);

      expect([byTitle, byAddress, missing, empty, present]).toEqual([
        ["Linked"],
        ["Linked"],
        [],
        ["Plain"],
        ["Linked"],
      ]);
    }),
  ),
);

it.effect("Rejects missing or deleted scope projects and folders outside the project", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      const other = yield* svc.projects.create("Other");
      const otherFolder = yield* svc.folders.create(other.id, null, "Elsewhere");
      const missingId = "019A0000-0000-7000-8000-00000000FFFF";
      const failure = (scope: SearchScope) =>
        Effect.flip(svc.search.search(query([], { scope }))).pipe(
          Effect.map((error) => error.message),
        );

      const missing = yield* failure({ kind: "project", projectId: missingId });
      const wrongFolder = yield* failure({
        kind: "area",
        projectId: project.id,
        folderId: otherFolder.id,
        includeSubfolders: false,
      });
      yield* svc.projects.delete(project.id);
      const deleted = yield* failure({ kind: "project", projectId: project.id });
      const fields = yield* Effect.flip(
        svc.search.listFields({ kind: "project", projectId: project.id }),
      );

      expect(missing).toBe("Search project does not exist.");
      expect(wrongFolder).toBe("Search folder does not exist in the project.");
      expect(deleted).toBe("Search project does not exist.");
      expect(fields.message).toBe("Search project does not exist.");
    }),
  ),
);

it.effect("Rejects choices from another field, archived choices and invalid custom values", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const fieldA = yield* svc.fields.create("Field A", "Choice", null);
      const fieldB = yield* svc.fields.create("Field B", "Choice", null);
      const choiceB = yield* svc.fields.addChoice(fieldB.id, "B");
      const old = yield* svc.fields.addChoice(fieldA.id, "Old");
      yield* svc.fields.archiveChoice(fieldA.id, old.id);
      const archived = yield* svc.fields.create("Archived", "Text", null);
      yield* svc.fields.archive(archived.id);
      const [type] = yield* svc.lookups.itemTypes.list();
      const [high] = yield* svc.lookups.priorityLevels.list();
      const invalid = [
        filter(fieldA.key, "equals", choice(choiceB.id)),
        filter(fieldA.key, "equals", choice(old.id)),
        filter("type", "equals", choice(high!.id)),
        filter("priority", "equals", choice(type!.id)),
        filter(archived.key, "equals", text("hidden")),
      ];

      const messages = yield* Effect.forEach(invalid, (rule) =>
        Effect.flip(svc.search.search(query([rule]))).pipe(Effect.map((error) => error.message)),
      );

      expect(messages).toEqual([
        `Choice does not belong to search field '${fieldA.key}'.`,
        `Choice does not belong to search field '${fieldA.key}'.`,
        "Choice does not belong to search field 'type'.",
        "Choice does not belong to search field 'priority'.",
        `Unknown search field '${archived.key}'.`,
      ]);
    }),
  ),
);

it.effect("Lists built-in, global and scoped project fields in registry order", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const first = yield* svc.projects.create("First");
      const second = yield* svc.projects.create("Second");
      yield* svc.fields.create("Global", "Text", null);
      yield* svc.fields.create("Local", "Number", first.id);
      yield* svc.fields.create("Other", "Date", second.id);
      const archived = yield* svc.fields.create("Archived", "Text", null);
      yield* svc.fields.archive(archived.id);
      const keys = (scope: SearchScope) =>
        svc.search.listFields(scope).pipe(Effect.map((fields) => fields.map((field) => field.key)));

      const projectKeys = yield* keys({ kind: "project", projectId: first.id });
      const allKeys = yield* keys(ALL);

      const builtIns = [
        "title",
        "ticket",
        "type",
        "priority",
        "due",
        "status",
        "completed",
        "link",
        "repeats",
        "reminder",
        "kind",
        "requestor",
        "dispatched",
        "pending",
        "application",
        "module",
        "interface",
        "tickettype",
        "comment",
      ];
      expect(projectKeys).toEqual([...builtIns, "global", "local"]);
      expect(allKeys).toEqual([...builtIns, "global", "local", "other"]);
    }),
  ),
);

it.effect("Lists active choices in sort order for a field key in scope", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const category = yield* svc.fields.create("Category", "Choice", null);
      const firstChoice = yield* svc.fields.addChoice(category.id, "First");
      const second = yield* svc.fields.addChoice(category.id, "Second");
      const hidden = yield* svc.fields.addChoice(category.id, "Hidden");
      yield* svc.fields.reorderChoices(category.id, [second.id, firstChoice.id, hidden.id]);
      yield* svc.fields.archiveChoice(category.id, hidden.id);
      const hiddenType = yield* svc.lookups.itemTypes.add("Hidden type");
      yield* svc.lookups.itemTypes.archive(hiddenType.id);

      const choices = yield* svc.search.listChoices(ALL, category.key);
      const types = yield* svc.search.listChoices(ALL, "type");
      const unknown = yield* Effect.flip(svc.search.listChoices(ALL, "missing"));

      expect(choices.map((option) => option.label)).toEqual(["Second", "First"]);
      expect(types.map((option) => option.label)).not.toContain("Hidden type");
      expect(types.length).toBeGreaterThan(0);
      expect(unknown.message).toBe("Unknown search field 'missing'.");
    }),
  ),
);

it.effect("Locates active items and returns null for deleted items or deleted ancestors", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Billing");
      const folder = yield* svc.folders.create(project.id, null, "Invoices");
      const hiddenFolder = yield* svc.folders.create(project.id, null, "Hidden");
      const active = yield* svc.items.create(project.id, folder.id, null, "Active");
      const deleted = yield* svc.items.create(project.id, null, null, "Deleted");
      const inDeletedFolder = yield* svc.items.create(project.id, hiddenFolder.id, null, "Inside");
      yield* svc.items.delete(project.id, null, deleted.id);
      yield* svc.folders.delete(project.id, hiddenFolder.id);

      const found = yield* svc.search.locateItem(active.id.toLowerCase());
      const missing = yield* svc.search.locateItem(deleted.id);
      const underDeletedFolder = yield* svc.search.locateItem(inDeletedFolder.id);

      expect(found).toEqual({ itemId: active.id, projectId: project.id, folderId: folder.id });
      expect(missing).toBeNull();
      expect(underDeletedFolder).toBeNull();
    }),
  ),
);
