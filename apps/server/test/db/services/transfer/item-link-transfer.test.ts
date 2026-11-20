import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { editJson, itemTitled, parseJson, randomGuid } from "./transfer-json.js";
import { itemNamed, projectId, readSavedSearches } from "./transfer-rows.js";
import { emptyWorld, fixtureText, readRows } from "./transfer-world.js";

const seed = fixtureText("legacy-export-all.json");

describe("Item link transfer", () => {
  it.effect("Imports links in order with their titles", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        yield* world.importJson(seed);

        const home = yield* projectId(world, "Home Lab");
        const call = yield* itemNamed(world, home, "Call vendor");
        const links = yield* readRows<{ Url: string; Title: string | null; SortOrder: number }>(
          world,
          "SELECT Url, Title, SortOrder FROM ItemLink WHERE ItemId = ? ORDER BY SortOrder",
          call.Id,
        );
        expect(links).toEqual([
          { Url: "https://a.example/x?y=1&z=<2>", Title: "Aye ü", SortOrder: 0 },
          { Url: "mailto:team@example.com", Title: null, SortOrder: 1 },
        ]);
      }),
    ),
  );

  it("Writes a links array only for items that have links", () => {
    const document = parseJson(seed);

    const withLinks = itemTitled(document, "Call vendor");
    const without = itemTitled(document, "Add index");

    expect(withLinks.links).toEqual([
      { url: "https://a.example/x?y=1&z=<2>", title: "Aye ü" },
      { url: "mailto:team@example.com" },
    ]);
    expect(without.links).toBeUndefined();
  });

  for (const [url, message] of [
    ["file:///C:/secrets.txt", "A link must be a full http, https or mailto address."],
    ["", "Enter a link address."],
  ] as const) {
    it.effect(`Reports a bad link ${JSON.stringify(url)} with its path`, () =>
      emptyWorld((world) =>
        Effect.gen(function* () {
          const text = editJson(seed, (document) => {
            itemTitled(document, "Call vendor").links[0].url = url;
          });

          const result = yield* world.importJson(text);

          const issues = result.kind === "refused" ? result.issues : [];
          expect(issues).toHaveLength(1);
          expect(issues[0]!.path).toMatch(/\.links\[0\]$/);
          expect(issues[0]!.message).toBe(message);
        }),
      ),
    );
  }

  it.effect("Reports more than 100 links on one item", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const text = editJson(seed, (document) => {
          itemTitled(document, "Call vendor").links = Array.from({ length: 101 }, (_, index) => ({
            url: `https://e.example/${index}`,
          }));
        });

        const preview = yield* world.previewJson(text);

        expect(preview.issues).toEqual([
          expect.objectContaining({ message: "An item may have at most 100 links." }),
        ]);
      }),
    ),
  );

  it.effect("Keeps saved references to a legacy custom link field when its key is renamed", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const owner = randomGuid();
        const other = randomGuid();
        yield* world.sql`INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc)
          VALUES ('019A0000-0000-7000-8000-0000000AD001', 'Existing', 0, '2026-11-13 12:00:00', '2026-11-13 12:00:00')`;
        yield* world.sql`INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, ProjectId, IsArchived, SortOrder)
          VALUES ('019A0000-0000-7000-8000-0000000AD002', 'link-2', 'Link', 'Text', '019A0000-0000-7000-8000-0000000AD001', 0, 0)`;
        const query = String.raw`"has:link" has:" LINK " no:link LINK~wiki link:"see \"no:link\""`;
        const text = JSON.stringify({
          format: "task-tracker",
          version: 1,
          fields: [
            {
              id: randomGuid(),
              key: "link",
              displayName: "Link",
              dataType: "Text",
              projectId: owner,
            },
          ],
          projects: [
            { id: owner, name: "Owner" },
            { id: other, name: "Other" },
          ],
          savedSearches: [
            {
              id: randomGuid(),
              name: "Custom",
              queryText: query,
              scopeKind: "Project",
              projectId: owner,
            },
            {
              id: randomGuid(),
              name: "Built-in",
              queryText: "has:link",
              scopeKind: "Project",
              projectId: other,
              sortOrder: 1,
            },
          ],
        });

        const result = yield* world.importJson(text);

        expect(result.kind).toBe("imported");
        const searches = Object.fromEntries(
          (yield* readSavedSearches(world)).map((search) => [search.Name, search.QueryText]),
        );
        expect(searches).toEqual({
          Custom: String.raw`"has:link" has:link-3 no:link-3 link-3~wiki link-3:"see \"no:link\""`,
          "Built-in": "has:link",
        });
      }),
    ),
  );
});
