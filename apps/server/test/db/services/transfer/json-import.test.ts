import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { editJson, itemTitled, parseJson, projectNamed, withoutIds } from "./transfer-json.js";
import {
  BUILT_IN,
  countRows,
  itemNamed,
  projectId,
  readChoices,
  readFields,
  readItems,
  readLookups,
  readProjects,
  readProjectSettings,
  readSavedSearches,
  readValues,
} from "./transfer-rows.js";
import { emptyWorld, readRows, seededWorld } from "./transfer-world.js";

const exportSeed = seededWorld((world) => world.exportJson());

/** Global settings are never imported; imported projects and searches are renumbered after existing ones. */
const comparable = (text: string) =>
  editJson(text, (document) => {
    delete document.globalSettings;
    for (const row of [...document.projects, ...document.savedSearches]) {
      delete row.sortOrder;
    }
  });

const exportedItemCount = (text: string) =>
  (parseJson(text).projects as { items: unknown[] }[]).reduce(
    (sum, project) => sum + project.items.length,
    0,
  );

describe("JSON import", () => {
  it.effect("Adds new projects into the same database and never touches existing rows", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const json = yield* world.exportJson();
        const before = yield* countRows(world);
        const billing = yield* projectId(world, "Billing");
        const original = yield* readItems(world, billing);

        const result = yield* world.importJson(json);

        const after = yield* countRows(world);
        expect(result).toMatchObject({ kind: "imported", backupPath: "backup-1.db.bak" });
        expect(after.Project).toBe(before.Project! + 3);
        expect(after.TodoItem).toBe(before.TodoItem! + exportedItemCount(json));
        expect(after.FieldDefinition).toBe(before.FieldDefinition! + 1);
        expect((yield* readItems(world, billing)).map((item) => item.UpdatedAtUtc)).toEqual(
          original.map((item) => item.UpdatedAtUtc),
        );
        const copy = yield* projectId(world, "Billing (imported)");
        const tickets = (yield* readItems(world, copy)).filter(
          (item) => item.TicketNumber !== null && item.CompletedAtUtc === null,
        );
        const originalTicket = original.find((item) => item.Title === "Fix invoice totals")!;
        expect(tickets).toHaveLength(1);
        expect(tickets[0]!.TicketRank).toBe(originalTicket.TicketRank! + 1);
        if (result.kind === "imported") {
          expect(result.summary).toEqual({
            projects: 3,
            folders: 3,
            items: exportedItemCount(json),
            savedSearches: 5,
          });
        }
      }),
    ),
  );

  it.effect("Gives an existing project name an imported suffix that counts up", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const json = yield* world.exportJson();

        yield* world.importJson(json);
        yield* world.importJson(json);

        const names = (yield* readProjects(world)).map((project) => project.Name);
        expect(names.filter((name) => name.startsWith("Billing"))).toEqual([
          "Billing",
          "Billing (imported)",
          "Billing (imported 2)",
        ]);
        expect(names.slice(-3)).toEqual([
          "Billing (imported 2)",
          "Café Überblick 🚀 (imported 2)",
          "Home Lab (imported 2)",
        ]);
      }),
    ),
  );

  it.effect("Orders imported projects after the existing ones", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        const existing = (yield* readProjects(world)).map((project) => project.SortOrder);

        yield* world.importJson(yield* world.exportJson());

        const imported = (yield* readProjects(world))
          .map((project) => project.SortOrder)
          .slice(existing.length);
        expect(imported).toEqual([2, 3, 4]);
        expect(Math.min(...imported)).toBeGreaterThan(Math.max(...existing));
      }),
    ),
  );

  it.effect("Matches lookups and global fields by name and key ignoring case", () =>
    Effect.gen(function* () {
      const json = yield* exportSeed;
      yield* emptyWorld((world) =>
        Effect.gen(function* () {
          yield* world.sql`INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, IsArchived, SortOrder)
            VALUES ('019A0000-0000-7000-8000-0000000AA002', 'severity', 'Severity', 'Choice', 0, 0)`;
          yield* world.sql`INSERT INTO FieldChoice (Id, FieldDefinitionId, Label, IsArchived, SortOrder)
            VALUES ('019A0000-0000-7000-8000-0000000AA003', '019A0000-0000-7000-8000-0000000AA002', 'MAJOR', 0, 0)`;

          const result = yield* world.importJson(json);

          expect(result.kind).toBe("imported");
          const billing = yield* projectId(world, "Billing");
          expect(
            (yield* readFields(world)).filter((field) => field.Key === "severity"),
          ).toHaveLength(1);
          const choices = yield* readChoices(world, "019A0000-0000-7000-8000-0000000AA002");
          expect(choices.map((choice) => choice.Label)).toEqual(["MAJOR", "Minor", "Legacy"]);
          const fix = yield* itemNamed(world, billing, "Fix invoice totals");
          const severity = (yield* readValues(world, fix.Id)).find(
            (value) => value.FieldDefinitionId === "019A0000-0000-7000-8000-0000000AA002",
          );
          expect(severity?.ChoiceId).toBe("019A0000-0000-7000-8000-0000000AA003");
        }),
      );
    }),
  );

  it.effect(
    "Creates missing lookups and fields after the existing ones, keeping archived flags",
    () =>
      Effect.gen(function* () {
        const json = yield* exportSeed;
        yield* emptyWorld((world) =>
          Effect.gen(function* () {
            yield* world.importJson(json);

            const priorities = yield* readLookups(world, "PriorityLevel");
            expect(priorities.map((level) => level.Name)).toEqual([
              "Critical",
              "High",
              "Medium",
              "Low",
              "Urgent",
              "Someday",
              "",
              "",
            ]);
            expect(priorities.find((level) => level.Name === "Someday")?.IsArchived).toBe(1);
            const fields = yield* readFields(world);
            expect(fields.find((field) => field.Key === "old-note")?.IsArchived).toBe(1);
            expect(fields.find((field) => field.Key === "estimate")?.ProjectId).toBeNull();
          }),
        );
      }),
  );

  it.effect("Stops on a global field whose key exists with another type and changes nothing", () =>
    Effect.gen(function* () {
      const json = yield* exportSeed;
      yield* emptyWorld((world) =>
        Effect.gen(function* () {
          yield* world.sql`INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, IsArchived, SortOrder)
            VALUES ('019A0000-0000-7000-8000-0000000AA004', 'estimate', 'Estimate', 'Text', 0, 0)`;
          const before = yield* countRows(world);

          const result = yield* world.importJson(json);

          expect(result.kind).toBe("refused");
          const issues = result.kind === "refused" ? result.issues : [];
          expect(issues).toHaveLength(1);
          expect(issues[0]!.path).toMatch(/^\$\.fields\[\d+\]\.dataType$/);
          expect(issues[0]!.message).toBe(
            "A field with the key 'estimate' already exists with type Text.",
          );
          expect(yield* countRows(world)).toEqual(before);
          expect(world.backup.count).toBe(0);
        }),
      );
    }),
  );

  it.effect("Numbers a taken project field key and suffixes its name", () =>
    Effect.gen(function* () {
      const json = yield* exportSeed;
      yield* emptyWorld((world) =>
        Effect.gen(function* () {
          yield* world.sql`INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, IsArchived, SortOrder)
            VALUES ('019A0000-0000-7000-8000-0000000AA005', 'customer', 'Customer', 'Text', 0, 0)`;

          const result = yield* world.importJson(json);

          expect(result.kind).toBe("imported");
          const billing = yield* projectId(world, "Billing");
          const projectFields = (yield* readFields(world)).filter(
            (field) => field.ProjectId === billing,
          );
          expect(projectFields.map((field) => [field.Key, field.DisplayName])).toEqual([
            ["customer-2", "Customer (imported)"],
          ]);
          const fix = yield* itemNamed(world, billing, "Fix invoice totals");
          const value = (yield* readValues(world, fix.Id)).find(
            (row) => row.FieldDefinitionId === projectFields[0]!.Id,
          );
          expect(value?.TextValue).toBe("Acme, Inc.");
        }),
      );
    }),
  );

  it.effect("Imports project overrides but never the global settings", () =>
    Effect.gen(function* () {
      const json = editJson(yield* exportSeed, (document) => {
        document.globalSettings.urgencyYellowThreshold = "P10D";
      });
      yield* emptyWorld((world) =>
        Effect.gen(function* () {
          yield* world.importJson(json);

          const billing = yield* projectId(world, "Billing");
          expect(yield* readProjectSettings(world, billing)).toEqual({
            urgencyYellowThreshold: "P5D",
          });
          expect(
            yield* readRows(
              world,
              "SELECT * FROM GlobalSetting WHERE Key = 'urgencyYellowThreshold'",
            ),
          ).toEqual([]);
        }),
      );
    }),
  );

  it.effect("Refuses overrides that would be invalid against this database's global settings", () =>
    Effect.gen(function* () {
      const json = yield* exportSeed;
      yield* emptyWorld((world) =>
        Effect.gen(function* () {
          yield* world.sql`INSERT INTO GlobalSetting (Key, Value) VALUES ('urgencyYellowThreshold', 'P9D'),
            ('urgencyRedThreshold', 'P8D')`;
          const before = yield* countRows(world);

          const result = yield* world.importJson(json);

          const issues = result.kind === "refused" ? result.issues : [];
          expect(issues).toHaveLength(1);
          expect(issues[0]!.path).toMatch(/^\$\.projects\[\d+\]\.settings$/);
          expect(yield* countRows(world)).toEqual(before);
        }),
      );
    }),
  );

  it.effect("Imports saved searches as new ones that point at the new ids", () =>
    Effect.gen(function* () {
      const json = yield* exportSeed;
      yield* emptyWorld((world) =>
        Effect.gen(function* () {
          yield* world.importJson(json);

          const billing = yield* projectId(world, "Billing");
          const severity = (yield* readFields(world)).find((field) => field.Key === "severity")!;
          const major = (yield* readChoices(world, severity.Id)).find(
            (choice) => choice.Label === "Major",
          )!;
          const searches = yield* readSavedSearches(world);
          const openMajor = searches.find((search) => search.Name === "Open major")!;
          expect(openMajor.QueryText).toBe(`severity:#${major.Id.toLowerCase()}`);
          expect(openMajor.ProjectId).toBe(billing);
          // Item types were removed (§12): a search naming one keeps the file's text unmapped.
          expect(searches.find((search) => search.Name === "Spikes")?.QueryText).toMatch(
            /^type:#[0-9a-f-]{36}$/,
          );
          const tables = searches.find((search) => search.Name === "Tables only")!;
          const folders = yield* readRows<{ Id: string; Name: string }>(
            world,
            "SELECT Id, Name FROM Folder WHERE ProjectId = ?",
            billing,
          );
          expect(tables).toMatchObject({
            ScopeKind: "Folder",
            FolderId: folders.find((folder) => folder.Name === "Tables")!.Id,
          });
        }),
      );
    }),
  );

  it.effect("Gives an existing saved search name an imported suffix", () =>
    seededWorld((world) =>
      Effect.gen(function* () {
        yield* world.importJson(yield* world.exportJson());

        const names = (yield* readSavedSearches(world)).map((search) => search.Name).toSorted();

        expect(names).toEqual([
          "Open major",
          "Open major (imported)",
          "Root area",
          "Root area (imported)",
          "Spikes",
          "Spikes (imported)",
          "Tables only",
          "Tables only (imported)",
          "verification",
          "verification (imported)",
        ]);
      }),
    ),
  );

  it.effect("Takes one backup and returns its path", () =>
    Effect.gen(function* () {
      const json = yield* exportSeed;
      yield* emptyWorld((world) =>
        Effect.gen(function* () {
          const result = yield* world.importJson(json);

          expect(world.backup.count).toBe(1);
          expect(result).toMatchObject({ kind: "imported", backupPath: "backup-1.db.bak" });
        }),
      );
    }),
  );

  it.effect("Reopens a completed parent with an open sub-item when auto-complete applies", () =>
    Effect.gen(function* () {
      const json = editJson(yield* exportSeed, (document) => {
        itemTitled(document, "Fix invoice totals").completedAtUtc = "2026-11-13T11:00:00Z";
      });
      yield* emptyWorld((world) =>
        Effect.gen(function* () {
          yield* world.importJson(json);

          const billing = yield* projectId(world, "Billing");
          const parent = yield* itemNamed(world, billing, "Fix invoice totals");
          expect(parent.CompletedAtUtc).toBeNull();
          expect(parent.UpdatedAtUtc).toBe("2026-11-13 12:00:00");
        }),
      );
    }),
  );

  it.effect("Keeps a parent completed when the project override turns auto-complete off", () =>
    Effect.gen(function* () {
      const json = editJson(yield* exportSeed, (document) => {
        itemTitled(document, "Fix invoice totals").completedAtUtc = "2026-11-13T11:00:00Z";
        projectNamed(document, "Billing").settings.autoCompleteParents = "false";
      });
      yield* emptyWorld((world) =>
        Effect.gen(function* () {
          yield* world.importJson(json);

          const billing = yield* projectId(world, "Billing");
          expect((yield* itemNamed(world, billing, "Fix invoice totals")).CompletedAtUtc).toBe(
            "2026-11-13 11:00:00",
          );
        }),
      );
    }),
  );

  it.effect("Succeeds for a file with nothing to import and changes nothing but the backup", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const before = yield* countRows(world);

        const result = yield* world.importJson('{"format":"task-tracker","version":1}');

        expect(result).toEqual({
          kind: "imported",
          summary: { projects: 0, folders: 0, items: 0, savedSearches: 0 },
          backupPath: "backup-1.db.bak",
        });
        expect(yield* countRows(world)).toEqual(before);
      }),
    ),
  );

  it.effect("Reuses built-in lookups by the same name instead of duplicating them", () =>
    Effect.gen(function* () {
      const json = yield* exportSeed;
      yield* emptyWorld((world) =>
        Effect.gen(function* () {
          yield* world.importJson(json);

          const billing = yield* projectId(world, "Billing");
          const fix = yield* itemNamed(world, billing, "Fix invoice totals");
          expect(fix.PriorityLevelId).toBe(BUILT_IN.high);
          expect(fix).not.toHaveProperty("ItemTypeId");
        }),
      );
    }),
  );

  it.effect(
    "Imports, then exports the same document apart from ids, global settings and project order",
    () =>
      Effect.gen(function* () {
        const first = yield* exportSeed;
        const second = yield* emptyWorld((world) =>
          Effect.andThen(world.importJson(first), world.exportJson()),
        );

        expect(withoutIds(comparable(second))).toBe(withoutIds(comparable(first)));
      }),
  );

  it.effect("Round-trips a single project to the same document apart from ids", () =>
    Effect.gen(function* () {
      const first = yield* seededWorld((world) =>
        Effect.flatMap(projectId(world, "Billing"), (id) =>
          world.exportJson({ kind: "project", projectId: id }),
        ),
      );
      const second = yield* emptyWorld((world) =>
        Effect.gen(function* () {
          yield* world.importJson(first);
          const [imported] = yield* readProjects(world);
          return yield* world.exportJson({ kind: "project", projectId: imported!.Id });
        }),
      );

      expect(withoutIds(comparable(second))).toBe(withoutIds(comparable(first)));
    }),
  );
});
