import { expect, it } from "@effect/vitest";
import { EntityMissing, type ItemLinkInput, MetadataRuleError } from "@task-tracker/core";
import { Effect } from "effect";
import type { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { UndoService } from "../../../src/services/undo-service.js";
import { readItems } from "./fixtures.js";
import {
  editFields,
  filter,
  query,
  type SearchServices,
  sortedTitles,
  text,
  withSearchServices,
} from "./search-fixtures.js";

type Operator = "contains" | "isEmpty" | "isNotEmpty";

const link = (url: string, title: string | null = null, id: string | null = null) => ({
  id,
  url,
  title,
});

const setup = (svc: SearchServices) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Temporal.Instant.from("2026-11-13T12:00:00Z").epochMilliseconds);
    const project = yield* svc.projects.create("Project");
    const create = (title: string) => svc.items.create(project.id, null, null, title);
    const save = (itemId: string, links: ReadonlyArray<ItemLinkInput>) =>
      Effect.gen(function* () {
        const [row] = yield* svc.sql<{ Title: string }>`SELECT Title FROM TodoItem
          WHERE Id = ${itemId}`;
        return yield* svc.items.edit(itemId, editFields(row!.Title), [], undefined, links);
      });
    const urls = (itemId: string) =>
      svc.items.loadLinks(itemId).pipe(Effect.map((links) => links.map(({ url }) => url)));
    const countLinks = svc.sql<{ count: number }>`SELECT count(*) AS count FROM ItemLink`.pipe(
      Effect.map((rows) => rows[0]!.count),
    );
    const searchLinks = (operator: Operator, value: string | null = null) =>
      svc.search
        .search(query([filter("link", operator, value === null ? null : text(value))]))
        .pipe(Effect.map(sortedTitles));
    return { project, create, save, urls, countLinks, searchLinks, undo: yield* UndoService };
  });

const test = (
  name: string,
  body: (
    svc: SearchServices,
    world: Effect.Success<ReturnType<typeof setup>>,
  ) => Effect.Effect<void, unknown, SqlClient.SqlClient | UndoService>,
) =>
  it.effect(name, () =>
    withSearchServices((svc) => Effect.flatMap(setup(svc), (world) => body(svc, world))),
  );

test("Saving links stores them in order with trimmed values", (svc, { create, save }) =>
  Effect.gen(function* () {
    const item = yield* create("Task");

    yield* save(item.id, [link("  https://a.example  ", " Aye "), link("mailto:team@example.com")]);

    const stored = yield* svc.items.loadLinks(item.id);
    expect(stored.map(({ url, title, sortOrder }) => ({ url, title, sortOrder }))).toEqual([
      { url: "https://a.example", title: "Aye", sortOrder: 0 },
      { url: "mailto:team@example.com", title: null, sortOrder: 1 },
    ]);
  }));

test("Editing links updates, removes, adds and renumbers", (svc, { create, save }) =>
  Effect.gen(function* () {
    const item = yield* create("Task");
    yield* save(item.id, [
      link("https://a.example"),
      link("https://b.example"),
      link("https://c.example"),
    ]);
    const stored = yield* svc.items.loadLinks(item.id);

    yield* save(item.id, [
      link("https://c.example", "Sea", stored[2]!.id),
      link("https://d.example"),
      link("https://a2.example", null, stored[0]!.id),
    ]);

    const after = yield* svc.items.loadLinks(item.id);
    expect(after.map(({ url }) => url)).toEqual([
      "https://c.example",
      "https://d.example",
      "https://a2.example",
    ]);
    expect([after[0]!.id, after[2]!.id]).toEqual([stored[2]!.id, stored[0]!.id]);
    expect(after[0]!.title).toBe("Sea");
    expect(after.map(({ sortOrder }) => sortOrder)).toEqual([0, 1, 2]);
  }));

test("Leaving the links out keeps the stored links", (svc, { create, save, urls }) =>
  Effect.gen(function* () {
    const item = yield* create("Task");
    yield* save(item.id, [link("https://a.example")]);

    yield* svc.items.edit(item.id, editFields("Renamed"), []);

    expect(yield* urls(item.id)).toEqual(["https://a.example"]);
  }));

test("An empty list removes every link", (_svc, { create, save, urls }) =>
  Effect.gen(function* () {
    const item = yield* create("Task");
    yield* save(item.id, [link("https://a.example")]);

    yield* save(item.id, []);

    expect(yield* urls(item.id)).toEqual([]);
  }));

for (const url of [
  "",
  "example.com",
  "file:///C:/secrets.txt",
  "javascript:alert(1)",
  "ftp://example.com/a",
  "custom://open",
  "https://",
  "https://a b.example",
]) {
  test(`The invalid address ${JSON.stringify(url)} saves nothing`, (svc, world) =>
    Effect.gen(function* () {
      const item = yield* world.create("Task");
      yield* world.save(item.id, [link("https://kept.example")]);

      const failure = yield* Effect.flip(
        svc.items.edit(item.id, editFields("Changed"), [], undefined, [
          link("https://new.example"),
          link(url),
        ]),
      );

      expect(failure).toBeInstanceOf(MetadataRuleError);
      expect(yield* world.urls(item.id)).toEqual(["https://kept.example"]);
      expect((yield* readItems()).map(({ Title }) => Title)).toEqual(["Task"]);
    }));
}

test("Over-long addresses, titles and lists are rejected", (_svc, { create, save, urls }) =>
  Effect.gen(function* () {
    const item = yield* create("Task");
    const longUrl = "https://example.com/" + "a".repeat(2000);
    const longTitle = "t".repeat(301);
    const tooMany = Array.from({ length: 101 }, (_, index) => link(`https://e.example/${index}`));

    const failures = yield* Effect.all(
      [[link(longUrl)], [link("https://a.example", longTitle)], tooMany].map((links) =>
        Effect.flip(save(item.id, links)),
      ),
    );

    expect(failures.map((failure) => failure.message)).toEqual([
      "A link address must be 2000 characters or fewer.",
      "A link title must be 300 characters or fewer.",
      "An item may have at most 100 links.",
    ]);
    expect(yield* urls(item.id)).toEqual([]);
  }));

test("The same link ID twice is rejected", (svc, { create, save }) =>
  Effect.gen(function* () {
    const item = yield* create("Task");
    yield* save(item.id, [link("https://a.example")]);
    const [stored] = yield* svc.items.loadLinks(item.id);

    const failure = yield* Effect.flip(
      save(item.id, [
        link("https://a.example", null, stored!.id),
        link("https://b.example", null, stored!.id),
      ]),
    );

    expect(failure.message).toBe("Each link may appear only once.");
  }));

test("A deleted item's links cannot be loaded and come back with a restore", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Task");
    yield* world.save(item.id, [link("https://a.example")]);

    const batch = yield* svc.items.delete(world.project.id, null, item.id);
    const failure = yield* Effect.flip(svc.items.loadLinks(item.id));
    const retained = yield* world.countLinks;
    yield* svc.trash.restore(batch);

    expect(failure).toBeInstanceOf(EntityMissing);
    expect(retained).toBe(1);
    expect(yield* world.urls(item.id)).toEqual(["https://a.example"]);
  }));

test("Purging an item removes its links and keeps others", (svc, world) =>
  Effect.gen(function* () {
    const doomed = yield* world.create("Doomed");
    const kept = yield* world.create("Kept");
    yield* world.save(doomed.id, [link("https://a.example"), link("https://b.example")]);
    yield* world.save(kept.id, [link("https://c.example")]);
    const batch = yield* svc.items.delete(world.project.id, null, doomed.id);

    yield* svc.trash.purge(batch);

    expect(yield* world.countLinks).toBe(1);
    expect(yield* world.urls(kept.id)).toEqual(["https://c.example"]);
  }));

test("Purging a project removes the links of all its items", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Task");
    yield* world.save(item.id, [link("https://a.example")]);
    const batch = yield* svc.projects.delete(world.project.id);

    yield* svc.trash.purge(batch);

    expect(yield* world.countLinks).toBe(0);
  }));

test("The foreign key cascades a direct item delete", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Task");
    yield* world.save(item.id, [link("https://a.example")]);

    yield* svc.sql`DELETE FROM TodoItem WHERE Id = ${item.id}`;

    expect(yield* world.countLinks).toBe(0);
  }));

test("Undo and redo of a save remove and restore the added links", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Task");
    yield* world.save(item.id, [link("https://a.example", "Aye"), link("https://b.example")]);
    const saved = yield* svc.items.loadLinks(item.id);

    yield* world.undo.apply("undo");
    const undone = yield* svc.items.loadLinks(item.id);
    const status = yield* world.undo.status();
    yield* world.undo.apply("redo");

    expect(undone).toEqual([]);
    expect(status).toMatchObject({ undo: "Create 'Task'", redo: "Edit 'Task'" });
    expect(yield* svc.items.loadLinks(item.id)).toEqual(saved);
  }));

test("Undo of a removal and reorder puts the old links back", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Task");
    yield* world.save(item.id, [
      link("https://a.example"),
      link("https://b.example"),
      link("https://c.example"),
    ]);
    const before = yield* svc.items.loadLinks(item.id);
    yield* world.save(item.id, [
      link(before[2]!.url, null, before[2]!.id),
      link(before[0]!.url, null, before[0]!.id),
    ]);

    yield* world.undo.apply("undo");

    expect(yield* svc.items.loadLinks(item.id)).toEqual(before);
  }));

test("Link changes and field changes are one undo step", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Task");
    const fields = editFields("Task", { notes: "New description" });
    yield* svc.items.edit(item.id, fields, [], undefined, [link("https://a.example")]);

    yield* world.undo.apply("undo");

    expect(yield* world.urls(item.id)).toEqual([]);
    expect((yield* readItems())[0]?.Notes).toBeNull();
  }));

test("Undo is refused when a link changed since", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Task");
    yield* world.save(item.id, [link("https://a.example")]);
    yield* svc.sql`UPDATE ItemLink SET Url = 'https://sneaky.example'`;

    const failure = yield* Effect.flip(world.undo.apply("undo"));

    expect(failure.message).toBe("This item changed since; can't undo.");
    expect(yield* world.urls(item.id)).toEqual(["https://sneaky.example"]);
  }));

test("A failed link write rolls back the item edit and every link change", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Task");
    yield* world.save(item.id, [link("https://a.example"), link("https://b.example")]);
    yield* svc.sql`CREATE TRIGGER FailLinkInsert BEFORE INSERT ON ItemLink
      BEGIN SELECT RAISE(ABORT, 'link write failed'); END`;

    const failure = yield* Effect.flip(
      svc.items.edit(item.id, editFields("Changed"), [], undefined, [link("https://c.example")]),
    );

    expect(String(failure)).toContain("link write failed");
    expect(yield* world.urls(item.id)).toEqual(["https://a.example", "https://b.example"]);
    expect((yield* readItems())[0]?.Title).toBe("Task");
    expect(yield* world.undo.status()).toMatchObject({ undo: "Edit 'Task'", redo: null });
  }));

test("Link addresses and titles are searchable with the link field", (_svc, world) =>
  Effect.gen(function* () {
    const first = yield* world.create("First");
    const second = yield* world.create("Second");
    yield* world.create("Third");
    yield* world.save(first.id, [link("https://wiki.example.com/Schema")]);
    yield* world.save(second.id, [link("https://other.example", "Design Notes")]);

    const results = yield* Effect.all([
      world.searchLinks("contains", "WIKI"),
      world.searchLinks("contains", "design"),
      world.searchLinks("isNotEmpty"),
      world.searchLinks("isEmpty"),
    ]);

    expect(results).toEqual([["First"], ["Second"], ["First", "Second"], ["Third"]]);
  }));

test("Link search treats wildcards literally and ignores deleted items", (svc, world) =>
  Effect.gen(function* () {
    const item = yield* world.create("Task");
    const other = yield* world.create("Other");
    yield* world.save(item.id, [link("https://a.example/a_b")]);
    yield* world.save(other.id, [link("https://a.example/axb")]);

    const literal = yield* world.searchLinks("contains", "a_b");
    yield* svc.items.delete(world.project.id, null, item.id);

    expect(literal).toEqual(["Task"]);
    expect(yield* world.searchLinks("isNotEmpty")).toEqual(["Other"]);
  }));
