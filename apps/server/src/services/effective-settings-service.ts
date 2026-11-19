import { SettingsResolver } from "@task-tracker/core";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { settingsRepository } from "../db/repositories/settings-repository.js";
import { checkRules } from "./check-rules.js";

/** Resolve settings inside an existing transaction, optionally reusing its global snapshot. */
export function readEffectiveSettings(
  settings: ReturnType<typeof settingsRepository>,
  projectId: string,
  globals = settings.global(),
) {
  return Effect.gen(function* () {
    const global = yield* globals;
    const overrides = yield* settings.project(projectId);
    return yield* checkRules(() => SettingsResolver.resolve(global, overrides));
  });
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const settings = settingsRepository(sql);
  return {
    get: (projectId: string) => sql.withTransaction(readEffectiveSettings(settings, projectId)),
  };
});

/** Read a project's effective settings and their sources. */
export class EffectiveSettingsService extends Context.Service<EffectiveSettingsService>()(
  "@task-tracker/server/EffectiveSettingsService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
