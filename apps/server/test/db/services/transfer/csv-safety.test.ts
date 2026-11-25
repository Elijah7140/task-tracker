import { describe, expect, it } from "@effect/vitest";
import { nameKey, parseCsv, writeCsv } from "@task-tracker/core";
import { Effect } from "effect";
import { createProject, csvHeader, csvRow, csvRows, seed, seedDocument } from "./csv-setup.js";
import { BUILT_IN, projectId, readItems, readValues } from "./transfer-rows.js";
import { emptyWorld, readRows, seededWorld, type TransferWorld } from "./transfer-world.js";

const issuesOf = (result: {
  kind: string;
  issues?: ReadonlyArray<{ path: string; message: string }>;
}) => (result.kind === "refused" ? result.issues! : []);

/** Seeds one project and returns its id. */
const seedProject = (world: TransferWorld, document: string, name: string) =>
  Effect.gen(function* () {
    yield* seed(world, document);
    return yield* projectId(world, name);
  });

const linksOf = (world: TransferWorld, itemId: string) =>
  readRows<{ Url: string; Title: string | null }>(
    world,
    "SELECT Url, Title FROM ItemLink WHERE ItemId = ? ORDER BY SortOrder",
    itemId,
  );

/** The single item of a project and its values by field display name. */
const onlyItem = (world: TransferWorld, project: string) =>
  Effect.gen(function* () {
    const items = yield* readItems(world, project);
    expect(items).toHaveLength(1);
    const values = yield* readRows<{ DisplayName: string; TextValue: string | null }>(
      world,
      `SELECT f.DisplayName, v.TextValue FROM ItemFieldValue v
       JOIN FieldDefinition f ON f.Id = v.FieldDefinitionId WHERE v.ItemId = ?`,
      items[0]!.Id,
    );
    return {
      item: items[0]!,
      values: Object.fromEntries(values.map((v) => [v.DisplayName, v.TextValue])),
    };
  });

describe("CSV header collisions", () => {
  it.effect("Suffixes a custom field named like a fixed or retired column and re-imports it", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const fields = [
          { key: "type", displayName: "Type", dataType: "Text" },
          { key: "ticket", displayName: "TICKET", dataType: "Text" },
        ] as const;
        const item = {
          title: "Colliding",
          ticketNumber: "T-1",
          priorityLevelId: BUILT_IN.high,
          fieldValues: [
            { fieldKey: "type", text: "custom kind" },
            { fieldKey: "ticket", text: "custom ticket" },
          ],
        };
        const lookups = {
          priorityLevels: [{ id: BUILT_IN.high, name: "High", isArchived: false, sortOrder: 1 }],
        };
        const document = seedDocument([{ name: "Source", items: [item] }], fields, lookups);
        const source = yield* seedProject(world, document, "Source");

        const csv = yield* world.exportProjectCsv(source);

        const header = csvHeader(csv);
        expect(new Set(header.map(nameKey)).size).toBe(header.length);
        expect(header).toEqual(expect.arrayContaining(["Type (field)", "TICKET (field)"]));
        const target = yield* createProject(world, "Target");
        expect(issuesOf(yield* world.importCsv(csv, target))).toEqual([]);
        const copy = yield* onlyItem(world, target);
        expect(copy.item.PriorityLevelId).toBe(BUILT_IN.high);
        expect(copy.item.TicketNumber).toBe("T-1");
        expect(copy.values).toEqual({ Type: "custom kind", TICKET: "custom ticket" });
      }),
    ),
  );

  it.effect("Suffixes a custom field named Links in the header", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const fields = [{ key: "links", displayName: "Links", dataType: "Text" }] as const;
        yield* seed(world, seedDocument([{ name: "Other" }], fields));

        const header = csvHeader(yield* world.exportProjectCsv(yield* projectId(world, "Billing")));

        expect(header).toContain("Links (field)");
        expect(header.filter((name) => name === "Links")).toHaveLength(1);
      }),
    ),
  );

  it.effect("Round-trips links and custom fields whose headers collide", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const fields = [
          { key: "links-field", displayName: "Links (field)", dataType: "Text" },
          { key: "links", displayName: "Links", dataType: "Text" },
        ] as const;
        const item = {
          title: "Example",
          links: [{ url: "https://example.com" }],
          fieldValues: [
            { fieldKey: "links", text: "plain" },
            { fieldKey: "links-field", text: "suffixed" },
          ],
        };
        const source = yield* seedProject(
          world,
          seedDocument([{ name: "Source", items: [item] }], fields),
          "Source",
        );

        const csv = yield* world.exportProjectCsv(source);
        const target = yield* createProject(world, "Target");
        const result = yield* world.importCsv(csv, target);

        expect(csvHeader(csv).slice(-4)).toEqual([
          "Links",
          "Repeats",
          "Links (field) (field)",
          "Links (field)",
        ]);
        expect(issuesOf(result)).toEqual([]);
        const copy = yield* onlyItem(world, target);
        expect(copy.values).toEqual({ Links: "plain", "Links (field)": "suffixed" });
        expect(yield* linksOf(world, copy.item.Id)).toEqual([
          { Url: "https://example.com", Title: null },
        ]);
      }),
    ),
  );

  it.effect("Reports legacy text under Links as an ambiguous header", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const fields = [
          { key: "links", displayName: "Links", dataType: "Text", scope: "project" },
        ] as const;
        const target = yield* seedProject(
          world,
          seedDocument([{ name: "Target" }], fields),
          "Target",
        );

        const result = yield* world.importCsv("Title,Links\r\nOne,internal wiki\r\n", target);

        const issues = issuesOf(result);
        expect(issues).toHaveLength(1);
        expect(issues[0]!.path).toBe("Row 2, Links");
        expect(issues[0]!.message).toContain("ambiguous");
        expect(issues[0]!.message).toContain("Links (field)");
        expect(yield* readItems(world, target)).toEqual([]);
      }),
    ),
  );
});

describe("CSV links", () => {
  it.effect("Round-trips links as addresses without titles", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const csv = yield* world.exportProjectCsv(yield* projectId(world, "Home Lab"));
        const [header, ...records] = parseCsv(csv).records;
        const vendor = records.filter((record) => record.cells[0] === "Call vendor");
        const vendorOnly = writeCsv([header!, ...vendor].map((record) => record.cells));
        const target = yield* createProject(world, "Target");

        const result = yield* world.importCsv(vendorOnly, target);

        expect(issuesOf(result)).toEqual([]);
        const [copy] = yield* readItems(world, target);
        expect(yield* linksOf(world, copy!.Id)).toEqual([
          { Url: "https://a.example/x?y=1&z=<2>", Title: null },
          { Url: "mailto:team@example.com", Title: null },
        ]);
      }),
    ),
  );

  for (const cell of ["https://a.example file:///C:/x", "not-a-link"]) {
    it.effect(`Reports a bad link in ${JSON.stringify(cell)} at its row and column`, () =>
      emptyWorld((world) =>
        Effect.gen(function* () {
          const target = yield* createProject(world, "Target");

          const result = yield* world.importCsv(`Title,Links\r\nOne,${cell}\r\n`, target);

          expect(result.kind).toBe("refused");
          expect(issuesOf(result).map((issue) => issue.path)).toContain("Row 2, Links");
        }),
      ),
    );
  }

  it.effect("Reports only the count for an overlong link list", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const target = yield* createProject(world, "Target");
        const urls = Array.from({ length: 100 }, () => "https://example.com").join(" ");

        const result = yield* world.importCsv(
          `Title,Links\r\nOne,${urls} invalid another-invalid\r\n`,
          target,
        );

        expect(issuesOf(result)).toEqual([
          { path: "Row 2, Links", message: "An item may have at most 100 links." },
        ]);
      }),
    ),
  );
});

describe("CSV formula safety", () => {
  it.effect("Exports text cells that start like formulas with a leading apostrophe", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const fields = [{ key: "notes", displayName: "Notes", dataType: "Text" }] as const;
        const item = {
          title: '=HYPERLINK("x")',
          description: "+1 description",
          ticketNumber: "@ticket",
          folder: "@folder",
          fieldValues: [{ fieldKey: "notes", text: "-2 note" }],
        };
        const document = seedDocument(
          [{ name: "=cmd", folders: ["@folder"], items: [item] }],
          fields,
        );
        const project = yield* seedProject(world, document, "=cmd");

        const row = csvRows(yield* world.exportProjectCsv(project))[0]!;

        expect(row).toMatchObject({
          Title: `'=HYPERLINK("x")`,
          Description: "'+1 description",
          Ticket: "'@ticket",
          Notes: "'-2 note",
          Project: "'=cmd",
          "Folder path": "'@folder",
        });
      }),
    ),
  );

  it.effect("Imports protected cells back to the original text", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const fields = [{ key: "notes", displayName: "Notes", dataType: "Text" }] as const;
        const item = {
          title: "=SUM(1,2)",
          description: "'=already quoted",
          ticketNumber: "-9",
          fieldValues: [{ fieldKey: "notes", text: "@mention" }],
        };
        const source = yield* seedProject(
          world,
          seedDocument([{ name: "Source", items: [item] }], fields),
          "Source",
        );
        const csv = yield* world.exportProjectCsv(source);
        const target = yield* createProject(world, "Target");

        const result = yield* world.importCsv(csv, target);

        expect(issuesOf(result)).toEqual([]);
        const copy = yield* onlyItem(world, target);
        expect(copy.item).toMatchObject({
          Title: "=SUM(1,2)",
          Description: null,
          Notes: "'=already quoted",
          TicketNumber: "-9",
        });
        expect(copy.values).toEqual({ Notes: "@mention" });
      }),
    ),
  );

  it.effect("Removes a hand-written apostrophe only in front of a formula start", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const target = yield* createProject(world, "Target");

        yield* world.importCsv("Title,Description\r\n'=typed,'just a quote\r\n", target);

        const [item] = yield* readItems(world, target);
        expect(item).toMatchObject({ Title: "=typed", Description: null, Notes: "'just a quote" });
      }),
    ),
  );

  it.effect("Leaves numbers and dates unprotected", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const fields = [{ key: "estimate", displayName: "Estimate", dataType: "Number" }] as const;
        const item = { title: "Negative", fieldValues: [{ fieldKey: "estimate", number: -2.5 }] };
        const project = yield* seedProject(
          world,
          seedDocument([{ name: "Numbers", items: [item] }], fields),
          "Numbers",
        );

        const csv = yield* world.exportProjectCsv(project);

        expect(csvRow(csv, "Negative").Estimate).toBe("-2.5");
        const values = yield* readValues(world, (yield* readItems(world, project))[0]!.Id);
        expect(values[0]!.NumberValue).toBe(-2.5);
      }),
    ),
  );
});
