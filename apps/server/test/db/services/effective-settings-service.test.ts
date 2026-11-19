import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { EffectiveSettingsService } from "../../../src/services/effective-settings-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { withSchema } from "./fixtures.js";

it.effect("Effective settings read legacy text, overrides and built-in defaults", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const projects = yield* ProjectService;
    const settings = yield* EffectiveSettingsService;
    const project = yield* projects.create("Project");
    const other = yield* projects.create("Inheriting project");
    const defaults = yield* settings.get(project.id);
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO GlobalSetting (Key, Value)
        VALUES ('autoCompleteParents', 'False'), ('urgencyYellowThreshold', 'P1D'),
               ('urgencyRedThreshold', 'PT3H')`;
        yield* sql`INSERT INTO ProjectSetting (ProjectId, Key, Value)
        VALUES (${project.id}, 'urgencyRedThreshold', 'PT0.5S')`;
      }),
    );

    const effective = yield* settings.get(project.id);
    const inherited = yield* settings.get(other.id);

    expect(defaults.autoCompleteParents).toEqual({ value: true, source: "Global" });
    expect(effective).toEqual({
      autoCompleteParents: { value: false, source: "Global" },
      urgencyYellowThreshold: { value: 864_000_000_000n, source: "Global" },
      urgencyRedThreshold: { value: 5_000_000n, source: "Project" },
      workspaceCardColumns: { value: 4, source: "Global" },
    });
    expect(inherited.urgencyRedThreshold).toEqual({ value: 108_000_000_000n, source: "Global" });
  }).pipe(
    Effect.provide(EffectiveSettingsService.layer),
    Effect.provide(ProjectService.layer("UTC")),
    withSchema,
  ),
);
