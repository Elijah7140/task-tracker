import { describe, expect, it } from "@effect/vitest";
import type { TransferIssue } from "@task-tracker/core";
import { Effect } from "effect";
import {
  editJson,
  fieldKeyed,
  fieldValues,
  itemIndex,
  itemTitled,
  type JsonDocument,
  parseJson,
  projectNamed,
  randomGuid,
} from "./transfer-json.js";
import { countRows } from "./transfer-rows.js";
import { emptyWorld, fixtureText } from "./transfer-world.js";

const seed = fixtureText("legacy-export-all.json");

/** Imports an edited file into a database holding other data and checks that nothing changed. */
const rejectedIssues = (text: string) =>
  emptyWorld((world) =>
    Effect.gen(function* () {
      yield* world.sql`INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc)
        VALUES ('019A0000-0000-7000-8000-0000000AB001', 'Already here', 0, '2026-11-13 12:00:00', '2026-11-13 12:00:00')`;
      const before = yield* countRows(world);

      const result = yield* world.importJson(text);

      expect(result.kind).toBe("refused");
      expect(yield* countRows(world)).toEqual(before);
      expect(world.backup.count).toBe(0);
      const issues: readonly TransferIssue[] = result.kind === "refused" ? result.issues : [];
      expect(issues.length).toBeGreaterThan(0);
      return issues;
    }),
  );

const rejected = (edit: (document: JsonDocument) => void) => rejectedIssues(editJson(seed, edit));
const firstIssue = (edit: (document: JsonDocument) => void) =>
  Effect.map(rejected(edit), (issues) => issues[0]!);

describe("JSON import validation", () => {
  it.effect("Rejects a file with another format", () =>
    Effect.gen(function* () {
      const issue = yield* firstIssue((document) => {
        document.format = "something-else";
      });

      expect(issue).toEqual({
        path: "$.format",
        message: `This is not a Task Tracker export; 'format' must be "task-tracker".`,
      });
    }),
  );

  it.effect("Rejects a newer version with a message to update", () =>
    Effect.gen(function* () {
      const issue = yield* firstIssue((document) => {
        document.version = 2;
      });

      expect(issue.path).toBe("$.version");
      expect(issue.message).toContain("newer version");
    }),
  );

  it.effect("Rejects an older or missing version", () =>
    Effect.gen(function* () {
      const older = yield* firstIssue((document) => {
        document.version = 0;
      });
      const missing = yield* firstIssue((document) => {
        delete document.version;
      });

      expect([older, missing]).toEqual([
        { path: "$.version", message: "File version 0 is not supported." },
        { path: "$.version", message: "The version must be a whole number." },
      ]);
    }),
  );

  it.effect("Rejects text that is not JSON and changes nothing", () =>
    Effect.gen(function* () {
      const issues = yield* rejectedIssues("{ this is not json");

      expect(issues).toHaveLength(1);
      expect(issues[0]!.path).toBe("$");
    }),
  );

  it.effect("Reports a value of the wrong JSON type with its path", () =>
    Effect.gen(function* () {
      const issues = yield* rejected((document) => {
        projectNamed(document, "Billing").sortOrder = "first";
      });

      expect(issues).toEqual([
        {
          path: "$.projects[0].sortOrder",
          message: "The JSON value could not be converted to System.Nullable`1[System.Int32].",
        },
      ]);
    }),
  );

  it.effect("Reports a missing project name with its path", () =>
    Effect.gen(function* () {
      const issue = yield* firstIssue((document) => {
        delete projectNamed(document, "Billing").name;
      });

      expect(issue).toEqual({ path: "$.projects[0].name", message: "A value is required." });
    }),
  );

  it.effect("Reports item problems with the index of the item", () =>
    Effect.gen(function* () {
      const index = itemIndex(parseJson(seed), "Billing", "Add index");

      const issues = yield* rejected((document) => {
        const item = itemTitled(document, "Add index");
        item.title = "   ";
        item.dueDate = "20/11/2026";
        item.dueTime = "25:00";
      });

      const prefix = `$.projects[0].items[${index}]`;
      expect(issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining([`${prefix}.title`, `${prefix}.dueDate`, `${prefix}.dueTime`]),
      );
    }),
  );

  it.effect("Reports all problems together", () =>
    Effect.gen(function* () {
      const issues = yield* rejected((document) => {
        projectNamed(document, "Billing").name = "";
        itemTitled(document, "Replace router").dueTime = "15:00:00";
        projectNamed(document, "Home Lab").folders = [{ name: "No id" }];
      });

      expect(issues.length).toBeGreaterThanOrEqual(3);
    }),
  );

  it.effect("Rejects a due time without a due date", () =>
    Effect.gen(function* () {
      const issue = yield* firstIssue((document) => {
        itemTitled(document, "Replace router").dueTime = "15:00:00";
      });

      expect(issue.path).toMatch(/\.dueTime$/);
      expect(issue.message).toBe("A due time needs a due date.");
    }),
  );

  it.effect("Ignores the schedule an older export wrote, even when it is invalid", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const text = editJson(seed, (document) => {
          const item = itemTitled(document, "Add index");
          item.scheduledStart = "2026-11-21T09:00:00Z";
          item.scheduledEnd = "not a time";
        });

        const result = yield* world.importJson(text);

        expect(result.kind).toBe("imported");
      }),
    ),
  );

  it.effect("Dates a repeating item that an older export gave only a schedule", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const result = yield* world.importJson(seed);

        const [monthEnd] = yield* world.sql<{ DueDate: string | null; DueTime: string | null }>`
          SELECT DueDate, DueTime FROM TodoItem WHERE Title = 'Month end'`;
        expect(result.kind).toBe("imported");
        expect(monthEnd).toEqual({ DueDate: "2026-11-30", DueTime: null });
      }),
    ),
  );

  it.effect("Rejects a completion time without Z", () =>
    Effect.gen(function* () {
      const issue = yield* firstIssue((document) => {
        itemTitled(document, "Add index").completedAtUtc = "2026-11-21T09:00:00";
      });

      expect(issue).toMatchObject({
        message: "Expected a UTC timestamp such as 2026-11-13T12:00:00Z.",
      });
      expect(issue.path).toMatch(/\.completedAtUtc$/);
    }),
  );

  it.effect("Rejects a sub-item in another folder than its parent", () =>
    Effect.gen(function* () {
      const issue = yield* firstIssue((document) => {
        itemTitled(document, "Check query plan").folderId = projectNamed(
          document,
          "Billing",
        ).folders[0].id;
      });

      expect(issue.path).toMatch(/\.folderId$/);
      expect(issue.message).toContain("same folder");
    }),
  );

  it.effect("Rejects an item in a folder of another project with the folder id in lowercase", () =>
    Effect.gen(function* () {
      const folder = projectNamed(parseJson(seed), "Billing").folders[0].id as string;

      const issue = yield* firstIssue((document) => {
        itemTitled(document, "Replace router").folderId = folder.toUpperCase();
      });

      expect(issue.path).toMatch(/\.folderId$/);
      expect(issue.message).toBe(`The folder ${folder} is not in this project.`);
    }),
  );

  it.effect("Rejects items that would be each other's parent", () =>
    Effect.gen(function* () {
      const issues = yield* rejected((document) => {
        itemTitled(document, "Fix invoice totals").parentItemId = itemTitled(
          document,
          "Check query plan",
        ).id;
      });

      expect(issues.some((issue) => issue.message.includes("sub-item of itself"))).toBe(true);
    }),
  );

  it.effect("Rejects folders that would be inside each other", () =>
    Effect.gen(function* () {
      const issues = yield* rejected((document) => {
        const folders = projectNamed(document, "Billing").folders as JsonDocument[];
        folders.find((folder) => folder.name === "dbo")!.parentFolderId = folders.find(
          (folder) => folder.name === "Tables",
        )!.id;
      });

      expect(issues.some((issue) => issue.message.includes("inside itself"))).toBe(true);
    }),
  );

  it.effect("Rejects an unknown priority and ignores an older file's item type", () =>
    Effect.gen(function* () {
      const issues = yield* rejected((document) => {
        const item = itemTitled(document, "Fix invoice totals");
        item.itemTypeId = randomGuid();
        item.priorityLevelId = randomGuid();
      });

      const paths = issues.map((issue) => issue.path);
      expect(paths.some((path) => path.endsWith(".itemType"))).toBe(false);
      expect(paths.some((path) => path.endsWith(".priority"))).toBe(true);
    }),
  );

  it.effect("Rejects duplicate ids", () =>
    Effect.gen(function* () {
      const issue = yield* firstIssue((document) => {
        itemTitled(document, "Replace router").id = itemTitled(document, "Fix invoice totals").id;
      });

      expect(issue.path).toMatch(/\.id$/);
      expect(issue.message).toMatch(/^The id [0-9a-f-]{36} is used more than once\.$/);
    }),
  );

  it.effect("Rejects a value for a field the file does not define", () =>
    Effect.gen(function* () {
      const issue = yield* firstIssue((document) => {
        fieldValues(document, "Fix invoice totals").push({ fieldKey: "missing", text: "x" });
      });

      expect(issue.path).toMatch(/\.fieldKey$/);
      expect(issue.message).toBe("The field 'missing' is not defined in this file.");
    }),
  );

  it.effect("Rejects a value whose type does not match the field", () =>
    Effect.gen(function* () {
      const issue = yield* firstIssue((document) => {
        const estimate = fieldValues(document, "Fix invoice totals").find(
          (value) => value.fieldKey === "estimate",
        )!;
        delete estimate.number;
        estimate.text = "two and a half";
      });

      expect(issue.message).toBe("The value does not match the field type Number.");
    }),
  );

  it.effect("Rejects a choice that is not an option of the field", () =>
    Effect.gen(function* () {
      const issue = yield* firstIssue((document) => {
        const severity = fieldValues(document, "Fix invoice totals").find(
          (value) => value.fieldKey === "severity",
        )!;
        delete severity.choiceId;
        severity.choiceLabel = "Catastrophic";
      });

      expect(issue.message).toBe("The choice is not one of the options of the field 'severity'.");
    }),
  );

  it.effect("Rejects a value with two typed values or none", () =>
    Effect.gen(function* () {
      const both = yield* firstIssue((document) => {
        fieldValues(document, "Fix invoice totals").find(
          (value) => value.fieldKey === "estimate",
        )!.text = "x";
      });
      const none = yield* firstIssue((document) => {
        delete fieldValues(document, "Fix invoice totals").find(
          (value) => value.fieldKey === "estimate",
        )!.number;
      });

      expect([both.message, none.message]).toEqual([
        "Exactly one value is required.",
        "Exactly one value is required.",
      ]);
    }),
  );

  it.effect("Rejects a second value for the same field on one item", () =>
    Effect.gen(function* () {
      const issue = yield* firstIssue((document) => {
        fieldValues(document, "Fix invoice totals").push({ fieldKey: "estimate", number: 3 });
      });

      expect(issue.message).toContain("more than one value");
    }),
  );

  it.effect("Rejects a project field value on an item of another project", () =>
    Effect.gen(function* () {
      const issue = yield* firstIssue((document) => {
        fieldValues(document, "Replace router").push({ fieldKey: "customer", text: "x" });
      });

      expect(issue.message).toContain("another project");
    }),
  );

  it.effect("Rejects blank text and a malformed date value", () =>
    Effect.gen(function* () {
      const blank = yield* firstIssue((document) => {
        fieldValues(document, "Fix invoice totals").find(
          (value) => value.fieldKey === "notes",
        )!.text = "   ";
      });
      const date = yield* firstIssue((document) => {
        fieldValues(document, "Fix invoice totals").find(
          (value) => value.fieldKey === "reviewed",
        )!.date = "11/01/2026";
      });

      expect(blank.path).toMatch(/\.text$/);
      expect(date.path).toMatch(/\.date$/);
    }),
  );

  it.effect("Rejects a saved search pointing at a project outside the file", () =>
    Effect.gen(function* () {
      const issue = yield* firstIssue((document) => {
        document.savedSearches[0].projectId = randomGuid();
      });

      expect(issue).toEqual({
        path: "$.savedSearches[0].projectId",
        message: "The search's project must be one of the projects in this file.",
      });
    }),
  );

  it.effect("Rejects an unreadable setting value and ignores unknown settings", () =>
    Effect.gen(function* () {
      const bad = yield* firstIssue((document) => {
        projectNamed(document, "Billing").settings.urgencyYellowThreshold = "soon";
      });
      const result = yield* emptyWorld((world) =>
        world.importJson(
          editJson(seed, (document) => {
            projectNamed(document, "Billing").settings.futureSetting = "whatever";
          }),
        ),
      );

      expect(bad).toEqual({
        path: "$.projects[0].settings.urgencyYellowThreshold",
        message:
          "Invalid value for setting 'urgencyYellowThreshold': Expected an ISO-8601 duration.",
      });
      expect(result.kind).toBe("imported");
    }),
  );

  it.effect("Rejects duplicate priority names and active choice labels", () =>
    Effect.gen(function* () {
      const types = yield* rejected((document) => {
        document.priorityLevels[1].name = "critical";
      });
      const labels = yield* rejected((document) => {
        fieldKeyed(document, "severity").choices[1].label = "minor";
      });

      expect(types).toContainEqual({
        path: "$.priorityLevels[1].name",
        message: "The name 'critical' is used more than once.",
      });
      expect(labels.some((issue) => issue.message.includes("more than one active choice"))).toBe(
        true,
      );
    }),
  );

  it.effect(
    "Never takes a backup or adds rows for a rejected file and reports an empty summary",
    () =>
      emptyWorld((world) =>
        Effect.gen(function* () {
          const text = editJson(seed, (document) => {
            itemTitled(document, "Replace router").dueDate = "nonsense";
          });

          const preview = yield* world.previewJson(text);
          const result = yield* world.importJson(text);

          expect(preview.issues.length).toBeGreaterThan(0);
          expect(result.kind).toBe("refused");
          expect(world.backup.count).toBe(0);
          expect(yield* countRows(world)).toMatchObject({ Project: 0, TodoItem: 0 });
        }),
      ),
  );
});
