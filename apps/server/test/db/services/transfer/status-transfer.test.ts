import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { editJson, itemTitled, parseJson, randomGuid } from "./transfer-json.js";
import {
  BUILT_IN,
  itemNamed,
  projectId,
  readFields,
  readItems,
  readLookups,
  readProjects,
  readSavedSearches,
  readValues,
} from "./transfer-rows.js";
import { emptyWorld, fixtureText, readRows } from "./transfer-world.js";

const seed = fixtureText("legacy-export-all.json");

/** A minimal version 1 file with one project. */
function oneProject(extra: Record<string, unknown>, items: unknown[]) {
  return JSON.stringify({
    format: "task-tracker",
    version: 1,
    ...extra,
    projects: [{ id: "019A0000-0000-7000-8000-0000000AC001", name: "Release", items }],
  });
}

describe("Status and priority transfer", () => {
  it.effect("Round-trips both status references and a number-only priority", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const result = yield* world.importJson(seed);

        expect(result.kind).toBe("imported");
        const home = yield* projectId(world, "Home Lab");
        const review = yield* itemNamed(world, home, "Review release");
        const statuses = yield* readLookups(world, "StatusLevel");
        const verification = statuses.find((status) => status.Name === "Verification")!;
        const shipped = statuses.find((status) => status.Name === "Shipped")!;
        const source = itemTitled(parseJson(seed), "Review release");
        expect(verification.Id).not.toBe(source.reopenStatusId.toUpperCase());
        expect([review.StatusId, review.ReopenStatusId]).toEqual([shipped.Id, verification.Id]);
        const priority = (yield* readLookups(world, "PriorityLevel")).find(
          (level) => level.Id === review.PriorityLevelId,
        )!;
        expect([priority.Name, priority.Number]).toEqual(["", 7]);
      }),
    ),
  );

  it.effect("Reports invalid status references at the item paths", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const text = oneProject({}, [
          {
            id: randomGuid(),
            title: "Review",
            statusId: randomGuid(),
            reopenStatusId: randomGuid(),
          },
        ]);

        const result = yield* world.importJson(text);

        const paths = result.kind === "refused" ? result.issues.map((issue) => issue.path) : [];
        expect(paths).toEqual([
          "$.projects[0].items[0].statusId",
          "$.projects[0].items[0].reopenStatusId",
        ]);
      }),
    ),
  );

  it.effect("Reports a status whose name matches a status of another kind", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        yield* world.sql`INSERT INTO StatusLevel (Id, Name, Kind, IsBuiltIn, IsArchived, SortOrder)
          VALUES ('019A0000-0000-7000-8000-0000000AC002', 'Verification', 1, 0, 0, 9)`;

        const result = yield* world.importJson(seed);

        const issues = result.kind === "refused" ? result.issues : [];
        expect(issues).toHaveLength(1);
        expect(issues[0]).toEqual({
          path: "$.statuses[4].kind",
          message: "The matching status has a different kind.",
        });
        expect(yield* readProjects(world)).toEqual([]);
      }),
    ),
  );

  it.effect(
    "Completes legacy files without statuses with the first Done status and renames the old key",
    () =>
      emptyWorld((world) =>
        Effect.gen(function* () {
          const text = editJson(seed, (document) => {
            delete document.statuses;
            for (const item of document.projects.flatMap(
              (project: { items: object[] }) => project.items,
            )) {
              delete item.statusId;
              delete item.reopenStatusId;
            }
            document.savedSearches[0].queryText = "status:true";
          });

          const result = yield* world.importJson(text);

          expect(result.kind).toBe("imported");
          const billing = yield* projectId(world, "Billing");
          expect((yield* itemNamed(world, billing, "Add index")).StatusId).toBe(BUILT_IN.completed);
          const searches = yield* readSavedSearches(world);
          expect(searches.find((search) => search.Name === "Open major")?.QueryText).toBe(
            "completed:true",
          );
        }),
      ),
  );

  it.effect("Keeps incoming suffixes and values distinct when renaming a legacy global field", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const legacyId = randomGuid();
        const secondId = randomGuid();
        const text = oneProject(
          {
            fields: [
              {
                id: legacyId,
                key: "completed",
                displayName: "Legacy",
                dataType: "Text",
                sortOrder: 0,
              },
              {
                id: secondId,
                key: "completed-2",
                displayName: "Completed 2",
                dataType: "Text",
                sortOrder: 1,
              },
            ],
          },
          [
            {
              id: randomGuid(),
              title: "Review",
              fieldValues: [
                { fieldKey: "completed", text: "Legacy value" },
                { fieldKey: "completed-2", text: "Other value" },
              ],
            },
          ],
        );

        yield* world.importJson(text);

        const fields = new Map((yield* readFields(world)).map((field) => [field.Id, field.Key]));
        const release = yield* projectId(world, "Release");
        const [item] = yield* readItems(world, release);
        const values = Object.fromEntries(
          (yield* readValues(world, item!.Id)).map((value) => [
            fields.get(value.FieldDefinitionId),
            value.TextValue,
          ]),
        );
        expect(values).toEqual({ "completed-3": "Legacy value", "completed-2": "Other value" });
      }),
    ),
  );

  for (const exact of [false, true]) {
    it.effect(
      `Keeps archived number-only priorities distinct${exact ? " when their ids exist" : ""}`,
      () =>
        emptyWorld((world) =>
          Effect.gen(function* () {
            const first = "019A0000-0000-7000-8000-0000000AC0F1";
            const second = "019A0000-0000-7000-8000-0000000AC0F2";
            if (exact) {
              yield* world.sql`INSERT INTO PriorityLevel (Id, Name, Number, IsBuiltIn, IsArchived, SortOrder)
              VALUES (${first}, '', 7, 0, 1, 10), (${second}, '', 7, 0, 1, 11)`;
            }
            const text = oneProject(
              {
                priorityLevels: [
                  { id: first, name: "", number: 7, isArchived: true, sortOrder: 4 },
                  { id: second, name: "", number: 7, isArchived: true, sortOrder: 5 },
                ],
              },
              [
                { id: randomGuid(), title: "First", priorityLevelId: first },
                { id: randomGuid(), title: "Second", priorityLevelId: second, sortOrder: 1 },
              ],
            );

            for (let attempt = 0; attempt < 2; attempt++) {
              const result = yield* world.importJson(text);
              expect(result.kind).toBe("imported");
              const projects = yield* readProjects(world);
              const items = yield* readItems(world, projects.at(-1)!.Id);
              const archived = (yield* readLookups(world, "PriorityLevel")).filter(
                (level) => level.IsArchived === 1,
              );
              expect(archived).toHaveLength(2);
              expect(items.map((item) => item.PriorityLevelId)).toEqual([
                archived[0]!.Id,
                archived[1]!.Id,
              ]);
              if (exact) {
                expect(archived.map((level) => level.Id)).toEqual([first, second]);
              }
            }
          }),
        ),
    );
  }

  it.effect("Refuses a new active priority whose number is already in use", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        yield* world.sql`INSERT INTO PriorityLevel (Id, Name, Number, IsBuiltIn, IsArchived, SortOrder)
          VALUES ('019A0000-0000-7000-8000-0000000AC003', '', 7, 0, 0, 10)`;
        const text = oneProject(
          { priorityLevels: [{ id: randomGuid(), name: "Seven", number: 7, sortOrder: 0 }] },
          [],
        );

        const result = yield* world.importJson(text);

        expect(result).toEqual({
          kind: "refused",
          issues: [
            {
              path: "$.priorityLevels[0].number",
              message: "This priority number is already in use.",
            },
          ],
        });
        expect(yield* readRows(world, "SELECT * FROM PriorityLevel WHERE Name = 'Seven'")).toEqual(
          [],
        );
      }),
    ),
  );
});
