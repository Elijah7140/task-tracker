import { MetadataRuleError, parseOrDefault, SettingsCatalogue } from "@task-tracker/core";
import { Context, Effect, Layer, Option } from "effect";
import { SqlClient } from "effect/sql";
import { currentItemRepository } from "../db/repositories/current-item-repository.js";
import { settingsRepository } from "../db/repositories/settings-repository.js";

const { currentItemId } = SettingsCatalogue;

/** Refuses a choice the user can no longer see, as the legacy service did. */
const unavailable = () => new MetadataRuleError("This item is no longer available.");

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const settings = settingsRepository(sql);
  const cards = currentItemRepository(sql);

  /** The stored choice, or null when none is stored or the text is malformed. */
  const storedId = settings
    .global()
    .pipe(Effect.map((global) => parseOrDefault(currentItemId, global.get(currentItemId.key))));

  /** The current item's card, or null when none is chosen or it is no longer available. */
  const load = sql.withTransaction(
    Effect.gen(function* () {
      const itemId = yield* storedId;
      if (itemId === null) {
        return null;
      }
      return Option.getOrNull(yield* cards.findAvailable(itemId));
    }),
  );

  /** Makes an available item current, or clears the choice when `itemId` is null. */
  const set = Effect.fnUntraced(function* (itemId: string | null) {
    if (itemId !== null && Option.isNone(yield* cards.findAvailable(itemId))) {
      return yield* Effect.fail(unavailable());
    }
    yield* settings.setGlobal({ Key: currentItemId.key, Value: currentItemId.format(itemId) });
  }, sql.withTransaction);

  return { load, set };
});

/**
 * Remembers the one item the user is working on, which the tray card shows
 * (§7.18). The choice is the global setting `currentItemId`, written outside
 * undo history. Each operation runs in its own transaction.
 */
export class CurrentItemService extends Context.Service<CurrentItemService>()(
  "@task-tracker/server/CurrentItemService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
