import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { createProject, folderNamed, seed, seedDocument } from "./csv-setup.js";
import {
  BUILT_IN,
  countRows,
  itemNamed,
  projectId,
  readItems,
  readValues,
} from "./transfer-rows.js";
import { emptyWorld, seededWorld, type TransferWorld } from "./transfer-world.js";
import { UndoService } from "../../../../src/services/undo-service.js";

const billingOf = (world: TransferWorld) => projectId(world, "Billing");

const issuesOf = (result: {
  kind: string;
  issues?: ReadonlyArray<{ path: string; message: string }>;
}) => (result.kind === "refused" ? result.issues! : []);

describe("CSV import preview", () => {
  it.effect("Counts rows and reports how the columns were understood", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const csv =
          "Title,Type,Priority,Severity,Project,Mystery\r\nOne,Change,High,Major,Billing,x\r\nTwo,,,,Billing,y\r\n";

        const preview = yield* world.previewCsv(csv, yield* billingOf(world));

        expect(preview.rowCount).toBe(2);
        expect(preview.recognizedColumns).toEqual(["Title", "Type", "Priority", "Severity"]);
        expect(preview.unknownColumns).toEqual(["Mystery"]);
        expect(preview.ignoredColumns).toEqual(["Project"]);
        expect(preview.sampleRows.map((row) => row.title)).toEqual(["One", "Two"]);
        expect(preview.canImport).toBe(true);
        expect(preview.fileName).toMatch(/^import-\d+\.csv$/);
      }),
    ),
  );

  it.effect("Shows only the first rows but counts them all", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const rows = Array.from({ length: 12 }, (_, index) => `Item ${index + 1}\r\n`).join("");

        const preview = yield* world.previewCsv(`Title\r\n${rows}`, yield* billingOf(world));

        expect(preview.rowCount).toBe(12);
        expect(preview.sampleRows).toHaveLength(5);
      }),
    ),
  );

  it.effect("Gives errors row numbers and columns and lists the valid names", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const csv =
          "Title,Type,Priority,Due date,Estimate,Severity\r\n" +
          "Good,Change,High,2026-12-01,1,Major\r\n" +
          "Bad type,Bug,High,2026-12-01,1,Major\r\n" +
          ",Change,Urgent,13/01/2026,abc,Huge\r\n";

        const preview = yield* world.previewCsv(csv, yield* billingOf(world));

        expect(preview.canImport).toBe(false);
        expect(preview.issues.map((issue) => issue.path)).toEqual([
          "Row 3, Type",
          "Row 4, Title",
          "Row 4, Due date",
          "Row 4, Estimate",
          "Row 4, Severity",
        ]);
        expect(preview.issues[0]!.message).toContain("'Bug'");
        expect(preview.issues[0]!.message).toContain("Change, Error, Discussion, Spike");
        expect(preview.issues[4]!.message).toContain("Minor, Major");
        expect(preview.sampleRows.map((row) => row.hasError)).toEqual([false, true, true]);
      }),
    ),
  );

  it.effect("Refuses an archived priority so old values do not slip in", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const preview = yield* world.previewCsv(
          "Title,Priority\r\nX,Someday\r\n",
          yield* billingOf(world),
        );

        expect(preview.issues).toHaveLength(1);
        expect(preview.issues[0]!.message).toContain("archived");
      }),
    ),
  );

  for (const [csv, path, part] of [
    ["Description\r\nNo title column\r\n", "Row 1", "needs a 'Title' column"],
    ["Title,title\r\nx,y\r\n", "Row 1", "more than once"],
    ["Title\r\n", "Row 2", "no item rows"],
    ["", "Row 1", "needs a header row"],
    ['Title\r\n"never closed\r\n', "Row 2", "never closed"],
    ["Title,Ticket\r\nx,y,z\r\n", "Row 2", "3 cells but the header has 2"],
    ["Title,Due time\r\nx,15:00\r\n", "Row 2, Due time", "needs a due date"],
    ["Title,Completed\r\nx,maybe\r\n", "Row 2, Completed", "yes or no"],
    [
      "Title,Completed,Completed at\r\nx,no,2026-10-01T08:00:00Z\r\n",
      "Row 2, Completed at",
      "says no",
    ],
  ] as const) {
    it.effect(`Reports a structural problem at ${path}: ${part}`, () =>
      seededWorld((world) =>
        Effect.gen(function* () {
          const preview = yield* world.previewCsv(csv, yield* billingOf(world));

          expect(preview.canImport).toBe(false);
          const matching = preview.issues.filter((issue) => issue.path === path);
          expect(matching).toHaveLength(1);
          expect(matching[0]!.message).toContain(part);
        }),
      ),
    );
  }

  it.effect("Refuses a decimal comma with a hint", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const preview = yield* world.previewCsv(
          'Title,Estimate\r\nX,"2,5"\r\n',
          yield* billingOf(world),
        );

        expect(preview.issues).toHaveLength(1);
        expect(preview.issues[0]!.message).toContain("use a dot");
      }),
    ),
  );

  it.effect("Has no column for an archived field", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const preview = yield* world.previewCsv(
          "Title,Old note\r\nx,y\r\n",
          yield* billingOf(world),
        );

        expect(preview.unknownColumns).toEqual(["Old note"]);
        expect(preview.canImport).toBe(true);
      }),
    ),
  );

  it.effect("Recognises the Links column", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const target = yield* createProject(world, "Target");

        const preview = yield* world.previewCsv("Title,Links\r\nOne,https://a.example\r\n", target);

        expect(preview.recognizedColumns).toContain("Links");
        expect(preview.canImport).toBe(true);
      }),
    ),
  );

  it.effect("Refuses a file that isn't UTF-8 with advice for spreadsheets", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const latin1 = Uint8Array.from([
          0x54, 0x69, 0x74, 0x6c, 0x65, 0x0d, 0x0a, 0x43, 0x61, 0x66, 0xe9,
        ]);

        const failure = yield* Effect.flip(world.previewCsv(latin1, yield* billingOf(world)));

        expect(failure.message).toBe(
          "This file isn't UTF-8. Re-save it as 'CSV UTF-8' and try again.",
        );
      }),
    ),
  );

  it.effect("Reports a missing project or folder as missing", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const [trashed] = yield* world.sql<{
          Id: string;
        }>`SELECT Id FROM Project WHERE Name = 'Trashed'`;
        const billing = yield* billingOf(world);

        const project = yield* Effect.flip(world.previewCsv("Title\r\nx\r\n", trashed!.Id));
        const folder = yield* Effect.flip(
          world.importCsv("Title\r\nx\r\n", billing, crypto.randomUUID()),
        );

        expect(project).toMatchObject({ message: "Project is missing or deleted." });
        expect(folder).toMatchObject({ message: "Folder is missing or deleted." });
      }),
    ),
  );
});

describe("CSV import", () => {
  it.effect("Adds rows as top-level items at the end of the project root", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* billingOf(world);
        const csv =
          "title,TYPE,priority,Ticket,Due date,Due time,Scheduled start,Scheduled end,Description\r\n" +
          'Plan,change,HIGH,T-1,2026-12-01,09:30,2026-12-02 10:00,2026-12-02T11:30,"Line one\r\nline two, with comma"\r\n';

        const result = yield* world.importCsv(csv, billing);

        expect(result).toMatchObject({ kind: "imported", summary: { items: 1 } });
        const items = yield* readItems(world, billing);
        const created = items.find((item) => item.Title === "Plan")!;
        const fix = items.find((item) => item.Title === "Fix invoice totals")!;
        expect(created).toMatchObject({
          ParentItemId: null,
          FolderId: null,
          ItemTypeId: BUILT_IN.change,
          PriorityLevelId: BUILT_IN.high,
          TicketNumber: "T-1",
          TicketRank: fix.TicketRank! + 1,
          DueDate: "2026-12-01",
          DueTime: "09:30:00",
          Description: null,
          Notes: "Line one\r\nline two, with comma",
          SortOrder: 2,
        });
        // An older file's schedule columns are unknown now and ignored (§7.4).
        expect(created).not.toHaveProperty("ScheduledStart");
        const roots = items.filter((item) => item.FolderId === null && item.ParentItemId === null);
        expect(roots.at(-1)!.Id).toBe(created.Id);
      }),
    ),
  );

  it.effect("Records no undo step and keeps the previous one", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const undo = yield* UndoService;
        const billing = yield* billingOf(world);
        const before = yield* undo.status();

        const result = yield* world.importCsv("Title\r\nImported\r\n", billing);

        expect(result.kind).toBe("imported");
        expect(yield* undo.status()).toEqual(before);
      }),
    ),
  );

  it.effect("Adds rows into a chosen folder", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* billingOf(world);
        const tables = yield* folderNamed(world, billing, "Tables");

        const result = yield* world.importCsv("Title\r\nIn tables\r\n", billing, tables);

        expect(result.kind).toBe("imported");
        expect((yield* itemNamed(world, billing, "In tables")).FolderId).toBe(tables);
      }),
    ),
  );

  it.effect("Matches custom fields by display name and validates values per type", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* billingOf(world);
        const csv =
          "Title,severity,Estimate,Reviewed,Flag,Notes,Customer\r\nRow,major,3.75,2026-10-01,No,  trimmed  ,Zed\r\n";

        yield* world.importCsv(csv, billing);

        const values = yield* readValues(world, (yield* itemNamed(world, billing, "Row")).Id);
        expect(values).toHaveLength(6);
        expect(values.map((value) => value.NumberValue)).toContain(3.75);
        expect(values.map((value) => value.TextValue)).toEqual(
          expect.arrayContaining(["Zed", "trimmed"]),
        );
        expect(values.map((value) => value.BoolValue)).toContain(0);
        expect(values.map((value) => value.DateValue)).toContain("2026-10-01");
        expect(values.filter((value) => value.ChoiceId !== null)).toHaveLength(1);
      }),
    ),
  );

  it.effect("Creates no values for empty cells and pads short rows", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* billingOf(world);

        const result = yield* world.importCsv(
          "Title,Estimate,Notes\r\nShort\r\nEmpty,,\r\n",
          billing,
        );

        expect(result.kind).toBe("imported");
        for (const title of ["Short", "Empty"]) {
          expect(yield* readValues(world, (yield* itemNamed(world, billing, title)).Id)).toEqual(
            [],
          );
        }
      }),
    ),
  );

  it.effect("Completes a yes row now and keeps a given completion time", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* billingOf(world);
        const csv =
          "Title,Completed,Completed at\r\nA,yes,\r\nB,yes,2026-10-01T08:00:00Z\r\nC,no,\r\nD,,2026-10-02T08:00:00Z\r\n";

        yield* world.importCsv(csv, billing);

        const completed = (title: string) =>
          Effect.map(itemNamed(world, billing, title), (row) => row.CompletedAtUtc);
        expect(yield* completed("A")).toBe("2026-11-13 12:00:00");
        expect(yield* completed("B")).toBe("2026-10-01 08:00:00");
        expect(yield* completed("C")).toBeNull();
        expect(yield* completed("D")).toBe("2026-10-02 08:00:00");
        expect((yield* itemNamed(world, billing, "A")).StatusId).toBe(BUILT_IN.completed);
      }),
    ),
  );

  it.effect("Ignores Parent title and makes every row a top-level item", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* billingOf(world);

        yield* world.importCsv("Title,Parent title\r\nChild,Fix invoice totals\r\n", billing);

        expect((yield* itemNamed(world, billing, "Child")).ParentItemId).toBeNull();
      }),
    ),
  );

  it.effect("Stops the whole import for one bad row and takes no backup", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const before = yield* countRows(world);

        const result = yield* world.importCsv(
          "Title,Type\r\nFine,Change\r\nBroken,Nope\r\n",
          yield* billingOf(world),
        );

        expect(issuesOf(result).map((issue) => issue.path)).toEqual(["Row 3, Type"]);
        expect(yield* countRows(world)).toEqual(before);
        expect(world.backup.count).toBe(0);
      }),
    ),
  );

  it.effect("Never creates lookups for unknown values", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const before = yield* countRows(world);

        yield* world.importCsv(
          "Title,Type,Priority\r\nX,Bug,Whenever\r\n",
          yield* billingOf(world),
        );

        expect(yield* countRows(world)).toEqual(before);
      }),
    ),
  );

  it.effect("Accepts a byte order mark and other line endings", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const result = yield* world.importCsv("﻿Title\nOne\rTwo\r\nThree", yield* billingOf(world));

        expect(result).toMatchObject({ kind: "imported", summary: { items: 3 } });
      }),
    ),
  );

  it.effect("Trims titles like .NET, keeping a byte-order mark or zero-width space", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* billingOf(world);
        const csv = "Title\r\n\u00a0\uFEFFMarked\u2028\r\n\u0085\u200bZero width\u3000\r\n";

        const result = yield* world.importCsv(csv, billing);

        expect(result).toMatchObject({ kind: "imported", summary: { items: 2 } });
        const titles = (yield* readItems(world, billing)).map((item) => item.Title);
        expect(titles).toContain("\uFEFFMarked");
        expect(titles).toContain("\u200bZero width");
      }),
    ),
  );

  it.effect("Reads numbers and dates the same under another time zone", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* billingOf(world);
        const saved = process.env.TZ;
        process.env.TZ = "Asia/Kathmandu";

        const result = yield* world
          .importCsv("Title,Estimate,Due date\r\nElsewhere,2.5,2026-12-24\r\n", billing)
          .pipe(
            Effect.ensuring(
              Effect.sync(() =>
                saved === undefined ? delete process.env.TZ : (process.env.TZ = saved),
              ),
            ),
          );

        expect(result.kind).toBe("imported");
        const created = yield* itemNamed(world, billing, "Elsewhere");
        expect(created.DueDate).toBe("2026-12-24");
        expect((yield* readValues(world, created.Id))[0]!.NumberValue).toBe(2.5);
      }),
    ),
  );

  it.effect("Takes a backup before a successful import", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const result = yield* world.importCsv("Title\r\nx\r\n", yield* billingOf(world));

        expect(world.backup.count).toBe(1);
        expect(result).toMatchObject({ backupPath: "backup-1.db.bak" });
      }),
    ),
  );

  it.effect("Imports nothing when the backup can't be made", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        world.backup.fail = true;
        const before = yield* countRows(world);

        const failure = yield* Effect.flip(
          world.importCsv("Title\r\nx\r\n", yield* billingOf(world)),
        );

        expect(failure.message).toContain("The database backup could not be made");
        expect(yield* countRows(world)).toEqual(before);
      }),
    ),
  );

  it.effect("Rolls back every row when a write fails after the backup", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* billingOf(world);
        const before = yield* countRows(world);
        yield* world.sql.withTransaction(
          world.sql`CREATE TRIGGER fail_second BEFORE INSERT ON TodoItem WHEN NEW.Title = 'Second'
            BEGIN SELECT RAISE(ABORT, 'disk full'); END`,
        );

        const failure = yield* Effect.flip(
          world.importCsv("Title\r\nFirst\r\nSecond\r\n", billing),
        );

        expect(failure).toBeDefined();
        expect(world.backup.count).toBe(1);
        expect(yield* countRows(world)).toEqual(before);
      }),
    ),
  );

  it.effect("Revalidates on import against data changed since the preview", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* billingOf(world);
        const csv = "Title,Type\r\nLate,Spike\r\n";
        const preview = yield* world.previewCsv(csv, billing);
        yield* world.sql.withTransaction(
          world.sql`UPDATE ItemType SET IsArchived = 1 WHERE Name = 'Spike'`,
        );

        const result = yield* world.importCsv(csv, billing);

        expect(preview.canImport).toBe(true);
        expect(issuesOf(result)).toEqual([
          { path: "Row 2, Type", message: "The type 'Spike' is archived." },
        ]);
      }),
    ),
  );

  it.effect("Reports a status that disagrees with completion", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const target = yield* createProject(world, "Release");
        const csv =
          "Title,Status,Completed\r\nOpen but done,Testing,yes\r\nDone but open,Completed,no\r\n";

        const result = yield* world.importCsv(csv, target);

        expect(issuesOf(result).map((issue) => issue.path)).toEqual([
          "Row 2, Status",
          "Row 3, Status",
        ]);
        expect(yield* readItems(world, target)).toEqual([]);
      }),
    ),
  );

  it.effect("Keeps status names and completes a row with a Done status", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const target = yield* createProject(world, "Release");

        const result = yield* world.importCsv(
          "Title,Status\r\nTest,Testing\r\nShip,Completed\r\n",
          target,
        );

        expect(issuesOf(result)).toEqual([]);
        const [test, ship] = yield* readItems(world, target);
        expect(test!.CompletedAtUtc).toBeNull();
        expect(test!.StatusId).not.toBeNull();
        expect(ship!.CompletedAtUtc).not.toBeNull();
        expect(ship!.StatusId).toBe(BUILT_IN.completed);
        const csv = yield* world.exportProjectCsv(target);
        expect(csv).toContain(",Testing,");
        expect(csv).toContain(",Completed,");
      }),
    ),
  );

  it.effect("Round-trips a numbered priority and a priority named for that number", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const named = crypto.randomUUID();
        const numbered = crypto.randomUUID();
        const priorityLevels = [
          { id: named, name: "7", isArchived: false, sortOrder: 10 },
          { id: numbered, name: "", number: 7, isArchived: false, sortOrder: 11 },
        ];
        yield* seed(
          world,
          seedDocument(
            [
              {
                name: "Release",
                items: [
                  { title: "Numbered", priorityLevelId: numbered },
                  { title: "Named", priorityLevelId: named },
                ],
              },
            ],
            [],
            { priorityLevels },
          ),
        );
        const source = yield* projectId(world, "Release");
        const csv = yield* world.exportProjectCsv(source);
        const destination = yield* createProject(world, "Imported");

        const result = yield* world.importCsv(csv, destination);

        expect(issuesOf(result)).toEqual([]);
        expect(csv).toContain(",7,#7,");
        expect(csv).toContain(",7,#name:7,");
        const sourceItems = yield* readItems(world, source);
        const copied = yield* readItems(world, destination);
        expect(copied.map((item) => item.PriorityLevelId)).toEqual(
          sourceItems.map((item) => item.PriorityLevelId),
        );
      }),
    ),
  );

  it.effect("Reports an ambiguous legacy priority label", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const priorityLevels = [
          { id: crypto.randomUUID(), name: "7", isArchived: false, sortOrder: 10 },
          { id: crypto.randomUUID(), name: "", number: 7, isArchived: false, sortOrder: 11 },
        ];
        yield* seed(world, seedDocument([{ name: "Release" }], [], { priorityLevels }));
        const target = yield* projectId(world, "Release");

        const result = yield* world.importCsv("Title,Priority\r\nReview,7\r\n", target);

        expect(issuesOf(result).map((issue) => issue.path)).toEqual(["Row 2, Priority"]);
        expect(yield* readItems(world, target)).toEqual([]);
      }),
    ),
  );

  it.effect("Lists Repeats as ignored and imports no repeat rule", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const csv = yield* world.exportProjectCsv(yield* projectId(world, "Home Lab"));
        // Legacy refuses its own row for the archived number-only priority, so leave it out.
        const editable = csv
          .split("\r\n")
          .filter((line) => !line.startsWith("Being verified,"))
          .join("\r\n");
        const target = yield* createProject(world, "Imported");

        const preview = yield* world.previewCsv(editable, target);
        const result = yield* world.importCsv(editable, target);

        expect(preview.ignoredColumns).toContain("Repeats");
        expect(result.kind).toBe("imported");
        const items = yield* readItems(world, target);
        expect(items.every((item) => item.RecurrenceFrequency === null)).toBe(true);
      }),
    ),
  );
});
