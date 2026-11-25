import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { TransferService } from "../../../../src/services/transfer/transfer-service.js";
import {
  editJson,
  fieldKeyed,
  itemTitled,
  type JsonDocument,
  projectNamed,
  randomGuid,
} from "./transfer-json.js";
import { countRows, projectId, readItems } from "./transfer-rows.js";
import { emptyWorld, fixtureText, readRows, type TransferWorld } from "./transfer-world.js";

const seed = fixtureText("legacy-export-all.json");

const nullElements: ReadonlyArray<
  readonly [string, (document: JsonDocument) => unknown[], string]
> = [
  ["projects", (document) => document.projects, "$.projects[0]"],
  ["priorityLevels", (document) => document.priorityLevels, "$.priorityLevels[0]"],
  ["statuses", (document) => document.statuses, "$.statuses[0]"],
  ["savedSearches", (document) => document.savedSearches, "$.savedSearches[0]"],
  ["fields", (document) => document.fields, "$.fields[0]"],
  ["choices", (document) => fieldKeyed(document, "severity").choices, ".choices[0]"],
  ["folders", (document) => projectNamed(document, "Billing").folders, "$.projects[0].folders[0]"],
  ["items", (document) => projectNamed(document, "Billing").items, "$.projects[0].items[0]"],
  [
    "fieldValues",
    (document) => itemTitled(document, "Fix invoice totals").fieldValues,
    ".fieldValues[0]",
  ],
  ["links", (document) => itemTitled(document, "Call vendor").links, ".links[0]"],
];

/** Writes raw bytes to a file in the world's folder and returns a read token for it. */
const grantBytes = (world: TransferWorld, bytes: Uint8Array | string) => {
  const path = join(world.folder, `raw-${randomGuid()}.json`);
  writeFileSync(path, bytes);
  return world.grant(path, "read");
};

describe("JSON import robustness", () => {
  for (const [list, select, expectedPath] of nullElements) {
    it.effect(`Reports a null ${list} element with its path instead of crashing`, () =>
      emptyWorld((world) =>
        Effect.gen(function* () {
          const text = editJson(seed, (document) => {
            select(document)[0] = null;
          });

          const preview = yield* world.previewJson(text);
          const result = yield* world.importJson(text);

          expect(preview.issues).toHaveLength(1);
          expect(preview.issues[0]!.path.endsWith(expectedPath)).toBe(true);
          expect(preview.issues[0]!.message).toBe("must be an object");
          expect(result.kind).toBe("refused");
          expect(world.backup.count).toBe(0);
        }),
      ),
    );
  }

  it.effect("Accepts a leading byte order mark, as text and as UTF-8 bytes", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const transfer = yield* TransferService;

        const preview = yield* world.previewJson(`\uFEFF${seed}`);
        const result = yield* transfer.importJson(
          yield* grantBytes(
            world,
            Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(seed)]),
          ),
        );

        expect(preview.issues).toEqual([]);
        expect(result.kind).toBe("imported");
      }),
    ),
  );

  it.effect("Imports a title that fits once trimmed and reports one that does not", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const fits = editJson(seed, (document) => {
          itemTitled(document, "Replace router").title = `${"a".repeat(300)}${" ".repeat(10)}`;
        });
        const tooLong = editJson(seed, (document) => {
          itemTitled(document, "Replace router").title = "a".repeat(301);
        });

        const result = yield* world.importJson(fits);
        const check = yield* world.previewJson(tooLong);

        expect(result.kind).toBe("imported");
        const home = yield* projectId(world, "Home Lab");
        expect((yield* readItems(world, home)).map((item) => item.Title)).toContain(
          "a".repeat(300),
        );
        expect(check.issues).toContainEqual(
          expect.objectContaining({ message: "The value must be 300 characters or fewer." }),
        );
      }),
    ),
  );

  it.effect("Measures every kind of name after trimming like the domain does", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const padding = " ".repeat(10);
        const text = editJson(seed, (document) => {
          document.itemTypes[3].name = `${"t".repeat(300)}${padding}`;
          document.priorityLevels[4].name = `${"p".repeat(300)}${padding}`;
          projectNamed(document, "Billing").name = `${"b".repeat(300)}${padding}`;
        });

        const result = yield* world.importJson(text);

        expect(result.kind).toBe("imported");
      }),
    ),
  );

  it.effect("Indexes imported items for full-text search", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        yield* world.importJson(seed);

        const found = yield* readRows<{ Title: string }>(
          world,
          `SELECT item.Title FROM TodoItemSearch JOIN TodoItemSearchRow AS map ON map.RowId = TodoItemSearch.rowid
           JOIN TodoItem AS item ON item.Id = map.ItemId WHERE TodoItemSearch MATCH 'invoice'`,
        );

        expect(found.map((row) => row.Title)).toEqual(["Fix invoice totals"]);
      }),
    ),
  );

  it.effect("Stops before anything is saved when the backup cannot be made", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        world.backup.fail = true;
        const before = yield* countRows(world);

        const failure = yield* Effect.flip(world.importJson(seed));

        expect(failure.message).toContain("nothing was imported");
        expect(yield* countRows(world)).toEqual(before);
      }),
    ),
  );

  it.effect(
    "Imports a large hierarchy",
    () =>
      emptyWorld((world) =>
        Effect.gen(function* () {
          const parentId = randomGuid();
          const items = [
            { id: parentId, title: "Parent", sortOrder: 0 },
            ...Array.from({ length: 2999 }, (_, index) => ({
              id: randomGuid(),
              parentItemId: parentId,
              title: `Child ${index + 1}`,
              sortOrder: index + 1,
            })),
          ];
          const text = JSON.stringify({
            format: "task-tracker",
            version: 1,
            projects: [{ id: randomGuid(), name: "Wide", items }],
          });

          const result = yield* world.importJson(text);

          expect(result).toMatchObject({ kind: "imported", summary: { items: 3000 } });
        }),
      ),
    // Writes 3,000 rows in one transaction: about 0.75 s alone, but several seconds under
    // Electron's SQLite when the machine is busy, so it gets more than the 5 s default.
    30_000,
  );

  it.effect("Refuses a file that is not UTF-8 with advice", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const transfer = yield* TransferService;
        const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("{}", "utf16le")]);

        const failure = yield* Effect.flip(
          transfer.previewJsonImport(yield* grantBytes(world, utf16)),
        );

        expect(failure.message).toBe(
          "This file isn't UTF-8. Re-save it as UTF-8 text and try again.",
        );
      }),
    ),
  );

  it.effect("Refuses a file over 50 MB before reading it", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const transfer = yield* TransferService;
        const token = yield* grantBytes(world, Buffer.alloc(50 * 1024 * 1024 + 1, 0x20));

        const failure = yield* Effect.flip(transfer.importJson(token));

        expect(failure.message).toBe(
          "This file is 51 MB; the largest file that can be imported is 50 MB.",
        );
        expect(world.backup.count).toBe(0);
      }),
    ),
  );

  it.effect("Refuses nesting deeper than the legacy reader allowed", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const preview = yield* world.previewJson(
          `{"format":"task-tracker","version":1,"x":${"[".repeat(70)}${"]".repeat(70)}}`,
        );

        expect(preview.issues).toHaveLength(1);
        expect(preview.issues[0]!.message).toMatch(
          /^The maximum configured depth of 64 has been exceeded/,
        );
      }),
    ),
  );

  it.effect("Accepts comments and trailing commas like the legacy reader", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const result = yield* world.importJson(
          '{ // export\n "format": "task-tracker", /* v1 */ "version": 1, "projects": [], }',
        );

        expect(result.kind).toBe("imported");
      }),
    ),
  );
});
