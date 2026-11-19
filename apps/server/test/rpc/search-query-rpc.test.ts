import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

it.effect("Parses query text with the server clock and zone and returns the choices it names", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Billing" });
      const severity = yield* client.CreateField({
        name: "Severity",
        dataType: "Choice",
        projectId: project.id,
      });
      const major = yield* client.AddFieldChoice({ fieldId: severity.id, label: "Major" });
      yield* TestClock.setTime(Temporal.Instant.from("2026-11-14T02:00:00Z").epochMilliseconds);
      const scope = { kind: "project", projectId: project.id.toLowerCase() } as const;

      const parsed = yield* client.ParseSearchQuery({
        scope,
        text: `deadlock ${severity.key}:major due<today is:done`,
      });

      expect(parsed).toEqual({
        kind: "parsed",
        text: "deadlock",
        filters: [
          { fieldKey: severity.key, operator: "equals", value: { kind: "choice", id: major.id } },
          { fieldKey: "due", operator: "lessThan", value: { kind: "date", value: "2026-11-13" } },
          { fieldKey: "completed", operator: "equals", value: { kind: "boolean", value: true } },
        ],
        stableText: `deadlock ${severity.key}:#${major.id} due<today is:done`,
        displayText: `deadlock ${severity.key}:Major due<today is:done`,
        impliesIncludeCompleted: true,
        choices: [
          {
            fieldKey: severity.key,
            choices: [{ id: major.id, label: "Major", sortOrder: 0, name: null, number: null }],
          },
        ],
      });
    }),
  ),
);

it.effect("Returns every positioned error with its description and formats filters", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const scope = { kind: "allProjects" } as const;

      const invalid = yield* client.ParseSearchQuery({ scope, text: "ok tpye:error effort:x" });
      const formatted = yield* client.FormatSearchQuery({
        scope,
        text: "dead lock",
        filters: [
          { fieldKey: "title", operator: "contains", value: { kind: "text", value: "a b" } },
          { fieldKey: "due", operator: "isEmpty", value: null },
        ],
      });

      expect(invalid).toEqual({
        kind: "invalid",
        errors: [
          {
            position: 3,
            length: 10,
            message: "Unknown field 'tpye'. Did you mean 'type'?",
            description:
              "Unknown field 'tpye'. Did you mean 'type'? (at \"tpye:error\", character 4)",
          },
          {
            position: 14,
            length: 8,
            message: expect.stringMatching(/^Unknown field 'effort'/),
            description: expect.stringMatching(/\(at "effort:x", character 15\)$/),
          },
        ],
      });
      expect(formatted).toBe('dead lock title~"a b" no:due');
    }),
  ),
);

it.effect("Maps a deleted scope project to a rule violation", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Gone" });
      yield* client.DeleteProject({ projectId: project.id });
      const scope = { kind: "project", projectId: project.id } as const;

      const parseError = yield* Effect.flip(client.ParseSearchQuery({ scope, text: "x" }));
      const formatError = yield* Effect.flip(
        client.FormatSearchQuery({ scope, text: null, filters: [] }),
      );

      expect(parseError).toMatchObject({
        _tag: "RuleViolation",
        message: "Search project does not exist.",
      });
      expect(formatError).toMatchObject({ _tag: "RuleViolation" });
    }),
  ),
);
