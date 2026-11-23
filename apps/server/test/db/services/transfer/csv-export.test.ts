import { describe, expect, it } from "@effect/vitest";
import { parseCsv, STANDARD_CSV_COLUMNS, type ItemQuery } from "@task-tracker/core";
import { Effect } from "effect";
import { SearchService } from "../../../../src/services/search-service.js";
import { csvHeader, csvRow, csvRows } from "./csv-setup.js";
import { projectId } from "./transfer-rows.js";
import { seededWorld } from "./transfer-world.js";

const STANDARD_HEADER = [
  "Title",
  "Description",
  "Ticket",
  "Type",
  "Priority",
  "Priority reference",
  "Status",
  "Due date",
  "Due time",
  "Completed",
  "Completed at",
  "Project",
  "Folder path",
  "Parent title",
  "Links",
  "Repeats",
];

const allProjects: ItemQuery = {
  scope: { kind: "allProjects" },
  text: null,
  filters: [],
  includeCompleted: true,
};

describe("CSV export", () => {
  it.effect("Writes the standard columns, then one per custom field by display name", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* projectId(world, "Billing");

        const header = csvHeader(yield* world.exportProjectCsv(billing));

        expect(STANDARD_CSV_COLUMNS).toEqual(STANDARD_HEADER);
        expect(header.slice(0, STANDARD_HEADER.length)).toEqual(STANDARD_HEADER);
        expect(header.slice(STANDARD_HEADER.length)).toEqual([
          "Severity",
          "Estimate",
          "Reviewed",
          "Flag",
          "Notes",
          "Customer",
        ]);
      }),
    ),
  );

  it.effect("Writes items in screen order with their folder path and parent title", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* projectId(world, "Billing");

        const text = yield* world.exportProjectCsv(billing);

        expect(csvRows(text).map((row) => row.Title)).toEqual([
          "Fix invoice totals",
          "Check query plan",
          "Write regression test",
          "Add index",
        ]);
        const sub = csvRow(text, "Check query plan");
        expect(sub["Parent title"]).toBe("Fix invoice totals");
        expect(sub["Folder path"]).toBe("");
        expect(sub.Project).toBe("Billing");
        expect(csvRow(text, "Add index")["Folder path"]).toBe("dbo/Tables");
      }),
    ),
  );

  it.effect("Writes dates, times and completion in invariant ISO form", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* projectId(world, "Billing");

        const text = yield* world.exportProjectCsv(billing);

        const fix = csvRow(text, "Fix invoice totals");
        expect([fix["Due date"], fix["Due time"], fix.Completed, fix["Completed at"]]).toEqual([
          "2026-11-20",
          "15:00:00",
          "no",
          "",
        ]);
        const addIndex = csvRow(text, "Add index");
        expect(addIndex).not.toHaveProperty("Scheduled start");
        expect(addIndex.Completed).toBe("yes");
        expect(addIndex["Completed at"]).toMatch(/Z$/);
      }),
    ),
  );

  it.effect("Writes type, priority and custom values as names and invariant text", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* projectId(world, "Billing");

        const fix = csvRow(yield* world.exportProjectCsv(billing), "Fix invoice totals");

        expect(fix).toMatchObject({
          Type: "Change",
          Priority: "High",
          "Priority reference": "#name:High",
          Severity: "Major",
          Estimate: "2.5",
          Reviewed: "2026-11-01",
          Flag: "yes",
          Customer: "Acme, Inc.",
          Ticket: "JIRA-1",
        });
      }),
    ),
  );

  it.effect("Writes descriptions with commas, quotes and line breaks that survive parsing", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* projectId(world, "Billing");

        const fix = csvRow(yield* world.exportProjectCsv(billing), "Fix invoice totals");

        expect(fix.Description).toBe('Totals are wrong,\nsee the "Q4" report');
      }),
    ),
  );

  it.effect("Leaves out deleted items", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* projectId(world, "Billing");

        const titles = csvRows(yield* world.exportProjectCsv(billing)).map((row) => row.Title);

        expect(titles).not.toContain("Old idea");
      }),
    ),
  );

  it.effect("Gives an archived field a column only when an exported item has a value", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const lab = yield* projectId(world, "Home Lab");

        const header = csvHeader(yield* world.exportProjectCsv(lab));

        expect(header).not.toContain("Old note");
        expect(header).not.toContain("Customer");
        expect(header).toContain("Severity");
      }),
    ),
  );

  it.effect("Writes the same text under another time zone", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const billing = yield* projectId(world, "Billing");
        const english = yield* world.exportProjectCsv(billing);
        const saved = process.env.TZ;
        process.env.TZ = "Pacific/Chatham";

        const elsewhere = yield* world.exportProjectCsv(billing).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              if (saved === undefined) {
                delete process.env.TZ;
              } else {
                process.env.TZ = saved;
              }
            }),
          ),
        );

        expect(elsewhere).toBe(english);
        expect(elsewhere).toContain(",2.5,");
      }),
    ),
  );

  it.effect("Starts the file with a byte order mark and ends lines with CRLF", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const lab = yield* projectId(world, "Home Lab");

        const bytes = yield* world.exportProjectCsvBytes(lab);

        expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
        expect(bytes.subarray(-2).toString("latin1")).toBe("\r\n");
        expect(bytes.subarray(3, 6).toString("utf8")).toBe("Tit");
      }),
    ),
  );

  it.effect("Writes every search match in result order, beyond the page limit", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const search = yield* SearchService;
        const expected = yield* search.search(allProjects, 1_000_000);
        const shown = yield* search.search(allProjects, 1);

        const { bytes, count } = yield* world.exportSearchCsv(allProjects);

        const titles = csvRows(bytes.toString("utf8")).map((row) => row.Title);
        expect(shown.items).toHaveLength(1);
        expect(count).toBe(expected.items.length);
        expect(titles).toEqual(expected.items.map((item) => item.title));
        expect(titles).not.toContain("Old idea");
        expect(titles).toContain("Replace router");
      }),
    ),
  );

  it.effect("Leaves out items deleted after a search when its results are exported", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const before = yield* world.exportSearchCsv(allProjects);
        yield* world.sql.withTransaction(
          world.sql`UPDATE TodoItem SET DeletedAtUtc = '2026-11-13 12:30:00' WHERE Title = 'Replace router'`,
        );

        const after = yield* world.exportSearchCsv(allProjects);

        const titles = csvRows(after.bytes.toString("utf8")).map((row) => row.Title);
        expect(after.count).toBe(before.count - 1);
        expect(titles).not.toContain("Replace router");
      }),
    ),
  );

  it.effect("Refuses to export a deleted project", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const [trashed] = yield* world.sql<{
          Id: string;
        }>`SELECT Id FROM Project WHERE Name = 'Trashed'`;

        const failure = yield* Effect.flip(world.exportProjectCsv(trashed!.Id));

        expect(failure).toMatchObject({ message: "Project is missing or deleted." });
      }),
    ),
  );

  it.effect("Writes the links column with addresses separated by spaces", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const lab = yield* projectId(world, "Home Lab");

        const text = yield* world.exportProjectCsv(lab);

        const header = csvHeader(text);
        expect(header.indexOf("Links")).toBe(header.length - 2 - 5);
        expect(csvRow(text, "Call vendor").Links).toBe(
          "https://a.example/x?y=1&z=<2> mailto:team@example.com",
        );
        expect(csvRow(text, "Quiet").Links).toBe("");
      }),
    ),
  );

  it.effect("Writes the read-only repeat description", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const lab = yield* projectId(world, "Home Lab");

        const text = yield* world.exportProjectCsv(lab);

        expect(csvRow(text, "Audit").Repeats).toBe("Every 2 weeks on Mon, Thu");
        expect(csvRow(text, "Month end").Repeats).toBe("Every 3 months on the last day");
      }),
    ),
  );

  it.effect("Writes number-only, named and archived priorities with distinct references", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const lab = yield* projectId(world, "Home Lab");

        const text = yield* world.exportProjectCsv(lab);

        expect(csvRow(text, "Review release")).toMatchObject({
          Priority: "7",
          "Priority reference": "#7",
          Status: "Shipped",
        });
        expect(csvRow(text, "Being verified")["Priority reference"]).toBe(
          "#id:01a1f637-48eb-7d52-b5ca-49b075deee4f",
        );
        expect(parseCsv(text).issues).toEqual([]);
      }),
    ),
  );
});
