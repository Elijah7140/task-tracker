import { expect, it } from "@effect/vitest";
import { MetadataRuleError, recurrenceRule, type SearchScope } from "@task-tracker/core";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { SearchQueryService } from "../../../src/services/search-query-service.js";
import {
  editFields,
  query,
  sortedTitles,
  withSearchServices,
  type SearchServices,
} from "./search-fixtures.js";

const ALL: SearchScope = { kind: "allProjects" };

type Queries = Effect.Success<typeof SearchQueryService>;

const withQueries = <A, E>(
  timeZone: string,
  body: (svc: SearchServices, queries: Queries) => Effect.Effect<A, E>,
) =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      return yield* body(svc, yield* SearchQueryService);
    }).pipe(Effect.provide(SearchQueryService.layer(timeZone))),
  );

/** Parses `text` and runs the parsed query through the shared search service. */
const searchText = (
  svc: SearchServices,
  queries: Queries,
  text: string,
  scope: SearchScope = ALL,
) =>
  Effect.gen(function* () {
    const parsed = yield* queries.parse(scope, text);
    expect(parsed.result.errors).toEqual([]);
    const { filters } = parsed.result;
    const results = yield* svc.search.search(query(filters, { scope, text: parsed.result.text }));
    return sortedTitles(results);
  });

it.effect("Binds text to scope fields and choices so the parsed query runs the shared search", () =>
  withQueries("UTC", (svc, queries) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Billing");
      const severity = yield* svc.fields.create("Severity", "Choice", project.id);
      const major = yield* svc.fields.addChoice(severity.id, "Major");
      const types = yield* svc.lookups.itemTypes.list();
      const errorType = types.find((type) => type.name === "Error");
      const [critical, high, medium] = yield* svc.lookups.priorityLevels.list();
      const seed = (title: string, priorityId: string, severityChoice: string | null) =>
        Effect.gen(function* () {
          const item = yield* svc.items.create(project.id, null, null, title);
          const custom =
            severityChoice === null
              ? []
              : [{ fieldDefinitionId: severity.id, choiceId: severityChoice }];
          const fields = { itemTypeId: errorType!.id, priorityLevelId: priorityId };
          yield* svc.items.edit(item.id, editFields(title, fields), custom);
        });
      yield* seed("Deadlock in billing", high!.id, major.id);
      yield* seed("Deadlock in reports", medium!.id, major.id);
      yield* seed("Deadlock in exports", critical!.id, null);

      const atLeastHigh = yield* searchText(
        svc,
        queries,
        `deadlock type:error priority>=high ${severity.key}:major`,
      );
      const parsed = yield* queries.parse(ALL, `type:error ${severity.key}:MAJOR`);

      expect(atLeastHigh).toEqual(["Deadlock in billing"]);
      expect(parsed.result.displayText).toBe(`type:Error ${severity.key}:Major`);
      expect(parsed.result.stableText).toBe(`type:#${errorType!.id} ${severity.key}:#${major.id}`);
      expect([...parsed.choices.keys()]).toEqual(["type", severity.key]);
      expect(parsed.choices.get(severity.key)?.map((choice) => choice.label)).toEqual(["Major"]);
    }),
  ),
);

it.effect("Binds priority numbers before names and compares them in list order", () =>
  withQueries("UTC", (svc, queries) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      const [critical, high, medium] = yield* svc.lookups.priorityLevels.list();
      yield* svc.lookups.priorityLevels.setNumber(critical!.id, 1);
      yield* svc.lookups.priorityLevels.setNumber(high!.id, 7);
      yield* svc.lookups.priorityLevels.setNumber(medium!.id, 2);
      const namedSeven = yield* svc.lookups.priorityLevels.add("7");
      const levels = [
        ["Critical", critical!.id],
        ["High", high!.id],
        ["Medium", medium!.id],
        ["Literal seven", namedSeven.id],
      ] as const;
      for (const [title, priorityLevelId] of levels) {
        const item = yield* svc.items.create(project.id, null, null, title);
        yield* svc.items.edit(item.id, editFields(title, { priorityLevelId }));
      }

      const byNumber = yield* searchText(svc, queries, "priority:7");
      const byQuotedName = yield* searchText(svc, queries, 'priority:"7"');
      const moreImportant = yield* searchText(svc, queries, "priority>7");
      const lessImportant = yield* searchText(svc, queries, "priority<7");

      expect(byNumber).toEqual(["High"]);
      expect(byQuotedName).toEqual(["Literal seven"]);
      expect(moreImportant).toEqual(["Critical"]);
      expect(lessImportant).toEqual(["Literal seven", "Medium"]);
    }),
  ),
);

it.effect("Matches status names and presence independently of completion", () =>
  withQueries("UTC", (svc, queries) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      const release = yield* svc.items.create(project.id, null, null, "Release");
      yield* svc.items.create(project.id, null, null, "Unscheduled");
      const statuses = yield* svc.lookups.statuses.list();
      const testing = statuses.find((status) => status.name === "Testing")!;
      yield* svc.items.setStatus(release.id, testing.id);

      const byName = yield* searchText(svc, queries, "status:testing");
      const byPart = yield* searchText(svc, queries, "status~est");
      const withoutStatus = yield* searchText(svc, queries, "no:status");
      const completed = yield* searchText(svc, queries, "completed:true");

      expect(byName).toEqual(["Release"]);
      expect(byPart).toEqual(["Release"]);
      expect(withoutStatus).toEqual(["Unscheduled"]);
      expect(completed).toEqual([]);
    }),
  ),
);

it.effect("Resolves relative dates with the Effect clock in the server's zone", () =>
  withQueries("America/New_York", (svc, queries) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Project");
      for (const [title, dueDate] of [
        ["Thirteenth", "2026-11-13"],
        ["Fourteenth", "2026-11-14"],
      ] as const) {
        const item = yield* svc.items.create(project.id, null, null, title);
        yield* svc.items.edit(
          item.id,
          editFields(title, { dueDate: Temporal.PlainDate.from(dueDate) }),
        );
      }
      yield* TestClock.setTime(Temporal.Instant.from("2026-11-14T02:00:00Z").epochMilliseconds);

      const parsed = yield* queries.parse(ALL, "due:today due>=yesterday due<=+0d");
      const dueToday = yield* searchText(svc, queries, "due:today");

      expect(parsed.result.filters.map((filter) => filter.value)).toEqual([
        { kind: "date", value: "2026-11-13" },
        { kind: "date", value: "2026-11-11" },
        { kind: "date", value: "2026-11-14" },
      ]);
      expect(parsed.result.stableText).toBe("due:today due>=yesterday due<=+0d");
      expect(dueToday).toEqual(["Thirteenth"]);
    }),
  ),
);

it.effect("Reports fields outside the scope and stale choices as positioned errors", () =>
  withQueries("UTC", (svc, queries) =>
    Effect.gen(function* () {
      const billing = yield* svc.projects.create("Billing");
      const other = yield* svc.projects.create("Other");
      const severity = yield* svc.fields.create("Severity", "Choice", billing.id);
      const major = yield* svc.fields.addChoice(severity.id, "Major");
      const saved = yield* queries.parse(ALL, `${severity.key}:major`);
      yield* svc.fields.archiveChoice(severity.id, major.id);

      const outside = yield* queries.parse(
        { kind: "project", projectId: other.id },
        saved.result.stableText,
      );
      const stale = yield* queries.parse(ALL, saved.result.stableText);

      expect(outside.result.errors).toEqual([
        expect.objectContaining({
          position: 0,
          message: expect.stringMatching(/^Unknown field 'severity'/),
        }),
      ]);
      expect(stale.result.errors.map((error) => error.message)).toEqual([
        "That Severity choice no longer exists.",
      ]);
      expect(stale.result.filters).toEqual([]);
    }),
  ),
);

it.effect("Keeps stable text working after a choice label is renamed", () =>
  withQueries("UTC", (svc, queries) =>
    Effect.gen(function* () {
      const category = yield* svc.fields.create("Category", "Choice", null);
      const choice = yield* svc.fields.addChoice(category.id, "Hardware");
      const saved = yield* queries.parse(ALL, "category:hardware");
      yield* svc.fields.renameChoice(category.id, choice.id, "Devices");

      const reopened = yield* queries.parse(ALL, saved.result.stableText);
      const byOldLabel = yield* queries.parse(ALL, "category:hardware");

      expect(reopened.result.filters).toEqual(saved.result.filters);
      expect(reopened.result.displayText).toBe("category:Devices");
      expect(byOldLabel.result.errors).toHaveLength(1);
    }),
  ),
);

it.effect("Formats filters as canonical text with current labels that parses back unchanged", () =>
  withQueries("UTC", (svc, queries) =>
    Effect.gen(function* () {
      yield* svc.fields.create("Estimate", "Number", null);
      const [critical, high] = yield* svc.lookups.priorityLevels.list();
      const missing = "0190A1B2-0000-7000-8000-0000000000FF";
      const filters = [
        {
          fieldKey: "priority",
          operator: "between",
          value: { kind: "choiceRange", min: critical!.id, max: high!.id },
        },
        {
          fieldKey: "estimate",
          operator: "between",
          value: { kind: "numberRange", min: 1, max: 2.5 },
        },
        { fieldKey: "title", operator: "contains", value: { kind: "text", value: "dead lock" } },
        { fieldKey: "completed", operator: "equals", value: { kind: "boolean", value: true } },
      ] as const;

      const text = yield* queries.format(ALL, "deadlock has:x", filters);
      const reparsed = yield* queries.parse(ALL, text);
      const unknown = yield* queries.format(ALL, null, [
        { fieldKey: "type", operator: "equals", value: { kind: "choice", id: missing } },
      ]);

      expect(text).toBe(
        'deadlock "has:x" priority:Critical..High estimate:1..2.5 title~"dead lock" is:done',
      );
      expect(reparsed.result.filters).toEqual(filters);
      expect(reparsed.result.text).toBe("deadlock has:x");
      expect(unknown).toBe(`type:#${missing}`);
    }),
  ),
);

it.effect("Rejects a deleted scope project", () =>
  withQueries("UTC", (svc, queries) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Gone");
      yield* svc.projects.delete(project.id);
      const scope: SearchScope = { kind: "project", projectId: project.id };

      const parseError = yield* Effect.flip(queries.parse(scope, "deadlock"));
      const formatError = yield* Effect.flip(queries.format(scope, "deadlock", []));

      expect(parseError).toEqual(new MetadataRuleError("Search project does not exist."));
      expect(formatError).toEqual(new MetadataRuleError("Search project does not exist."));
    }),
  ),
);

it.effect("Finds repeating items with is:recurring and the repeats field (§7.11)", () =>
  withQueries("UTC", (svc, queries) =>
    Effect.gen(function* () {
      const project = yield* svc.projects.create("Ops");
      const repeating = yield* svc.items.create(project.id, null, null, "Weekly report");
      yield* svc.items.create(project.id, null, null, "One-off task");
      const dueDate = Temporal.PlainDate.from("2026-11-20");
      const recurrence = recurrenceRule("Daily");
      yield* svc.items.edit(repeating.id, editFields("Weekly report", { dueDate, recurrence }), []);

      const found = yield* Effect.forEach(
        ["is:recurring", "repeats:yes", "repeats:no", "has:repeats", "no:repeats"],
        (text) => searchText(svc, queries, text),
      );

      expect(found).toEqual([
        ["Weekly report"],
        ["Weekly report"],
        ["One-off task"],
        ["Weekly report"],
        ["One-off task"],
      ]);
    }),
  ),
);
