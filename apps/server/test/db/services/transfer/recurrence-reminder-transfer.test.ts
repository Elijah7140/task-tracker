import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { editJson, itemTitled, parseJson, projectNamed } from "./transfer-json.js";
import { itemNamed, projectId, readItems, readProjectSettings } from "./transfer-rows.js";
import { emptyWorld, fixtureText } from "./transfer-world.js";

const seed = fixtureText("legacy-export-all.json");

describe("Recurrence and reminder transfer", () => {
  it.effect("Keeps the rule and groups imported occurrences under a new series", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const document = parseJson(seed);
        const items = projectNamed(document, "Home Lab").items as {
          title: string;
          [key: string]: unknown;
        }[];
        const [audit, successor] = items.filter((item) => item.title === "Audit");

        const result = yield* world.importJson(seed);

        expect(result.kind).toBe("imported");
        expect(document.version).toBe(1);
        expect(audit!.recurrenceSuccessorCreated).toBe(true);
        expect(successor!.recurrenceSuccessorCreated).toBeUndefined();
        expect(audit!.recurrence).toMatchObject({
          frequency: "weekly",
          weekdays: "monday, thursday",
        });
        const home = yield* projectId(world, "Home Lab");
        const rows = (yield* readItems(world, home)).filter((item) => item.Title === "Audit");
        expect(
          rows.map((row) => [
            row.RecurrenceFrequency,
            row.RecurrenceRemaining,
            row.RecurrenceSuccessorCreated,
          ]),
        ).toEqual([
          [2, 4, 1],
          [2, 3, 0],
        ]);
        expect(rows[0]!.RecurrenceSeriesId).not.toBeNull();
        expect(rows[1]!.RecurrenceSeriesId).toBe(rows[0]!.RecurrenceSeriesId);
        expect(rows[0]!.RecurrenceSeriesId).not.toBe(
          String(audit!.recurrenceSeriesId).toUpperCase(),
        );
      }),
    ),
  );

  it.effect("Reports invalid recurrence fields at their item paths", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const text = editJson(seed, (edited) => {
          const item = itemTitled(edited, "Audit");
          item.recurrence.interval = 0;
          item.recurrence.remaining = 0;
          item.recurrenceSeriesId = "00000000-0000-0000-0000-000000000000";
          item.dueDate = null;
        });

        const preview = yield* world.previewJson(text);

        const prefix = `$.projects[2].items[${(projectNamed(parseJson(seed), "Home Lab").items as { title: string }[]).findIndex((item) => item.title === "Audit")}]`;
        expect(preview.issues.map((issue) => issue.path)).toEqual(
          expect.arrayContaining([
            `${prefix}.recurrence.interval`,
            `${prefix}.recurrence.remaining`,
            `${prefix}.recurrenceSeriesId`,
            `${prefix}.recurrence`,
          ]),
        );
      }),
    ),
  );

  for (const [property, value] of [
    ["frequency", "daily, weekly"],
    ["anchor", "dueDate, dueDate"],
    ["endKind", "never, onDate"],
    ["weekdays", "monday, someday"],
  ] as const) {
    it.effect(`Rejects an invalid ${property} name at the recurrence property`, () =>
      emptyWorld((world) =>
        Effect.gen(function* () {
          const text = editJson(seed, (edited) => {
            const recurrence = itemTitled(edited, "Audit").recurrence;
            if (property === "frequency") {
              recurrence.weekdays = null;
              recurrence.monthDay = 16;
            }
            recurrence[property] = value;
          });

          const result = yield* world.importJson(text);

          const issues = result.kind === "refused" ? result.issues : [];
          expect(issues).toHaveLength(1);
          expect(issues[0]!.path).toMatch(new RegExp(`\\.recurrence\\.${property}$`));
          expect(issues[0]!.message).toContain("name");
        }),
      ),
    );
  }

  it.effect("Requires a Boolean successor marker", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const text = editJson(seed, (edited) => {
          itemTitled(edited, "Audit").recurrenceSuccessorCreated = "true";
        });

        const result = yield* world.importJson(text);

        const issues = result.kind === "refused" ? result.issues : [];
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({
          message: "The JSON value could not be converted to System.Boolean.",
        });
        expect(issues[0]!.path).toMatch(/\.recurrenceSuccessorCreated$/);
      }),
    ),
  );

  it.effect("Keeps the reminder choice and project settings without delivery or snooze state", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const result = yield* world.importJson(seed);

        expect(result.kind).toBe("imported");
        expect(seed).not.toMatch(/reminderDeliveredFor|snoozedUntilUtc|snoozedForUtc/i);
        const home = yield* projectId(world, "Home Lab");
        const call = yield* itemNamed(world, home, "Call vendor");
        const quiet = yield* itemNamed(world, home, "Quiet");
        expect([call.ReminderMode, call.ReminderOffsetMinutes, quiet.ReminderMode]).toEqual([
          2, 15, 1,
        ]);
        expect(yield* readProjectSettings(world, home)).toEqual({
          autoCompleteParents: "false",
          dateOnlyReminderTime: "10:30:00",
          defaultReminderOffset: "PT30M",
          remindersEnabled: "false",
        });
      }),
    ),
  );

  it.effect("Reports an invalid reminder offset and setting with their JSON paths", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const text = editJson(seed, (edited) => {
          itemTitled(edited, "Call vendor").reminderOffsetMinutes = 12;
          projectNamed(edited, "Home Lab").settings.dateOnlyReminderTime = "25:00";
        });

        const preview = yield* world.previewJson(text);

        expect(preview.issues).toEqual(
          expect.arrayContaining([
            {
              path: "$.projects[2].settings.dateOnlyReminderTime",
              message:
                "Invalid value for setting 'dateOnlyReminderTime': Expected a local time in HH:mm or HH:mm:ss format.",
            },
            expect.objectContaining({ message: "Choose a supported offset for offset mode only." }),
          ]),
        );
      }),
    ),
  );
});
