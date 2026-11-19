import {
  NotFound,
  RuleViolation,
  type SavedSearchDefinition,
  type SavedSearchProjection,
  type SearchScope,
} from "@task-tracker/contracts";
import { Effect } from "effect";

type SavedSearch = typeof SavedSearchProjection.Type;
type Definition = typeof SavedSearchDefinition.Type;

/** A saved search seeded into the fake server. Scope defaults to all projects. */
export interface SeedSavedSearch {
  readonly name: string;
  readonly queryText: string;
  readonly scope?: typeof SearchScope.Type;
  readonly includeCompleted?: boolean;
}

type Track = <A, E, R>(
  change: Effect.Effect<A, E, R>,
  label: (result: A) => string | null,
) => Effect.Effect<A, E, R>;

/** The fake store state saved searches read and write. */
interface SavedSearchStore {
  readonly savedSearches: FakeSavedSearches;
  readonly summaries: ReadonlyArray<{ readonly project: { readonly id: string } }>;
  readonly nextId: () => string;
  readonly record: (tag: string) => Effect.Effect<unknown>;
}

/** The server's message when a saved search was deleted meanwhile. */
export const MISSING_SAVED_SEARCH_MESSAGE = "This saved search no longer exists.";

const missing = () =>
  new NotFound({ entity: "SavedSearch", message: MISSING_SAVED_SEARCH_MESSAGE });

const sameName = (left: string, right: string) => left.toUpperCase() === right.toUpperCase();

/** Saved searches in display order behind the fake server, with the server's rule messages. */
export class FakeSavedSearches {
  rows: Array<SavedSearch> = [];

  constructor(private readonly nextId: () => string) {}

  /** Adds a saved search as if another client had saved it. */
  add({
    name,
    queryText,
    scope = { kind: "allProjects" },
    includeCompleted = false,
  }: SeedSavedSearch) {
    const saved = { id: this.nextId(), name, queryText, scope, includeCompleted };
    this.rows.push(saved);
    return saved;
  }

  /** Removes a saved search as if another client had deleted it. */
  remove(id: string) {
    this.rows = this.rows.filter((row) => row.id !== id);
  }

  find(id: string) {
    const found = this.rows.find((row) => row.id === id.toUpperCase());
    return found === undefined ? Effect.fail(missing()) : Effect.succeed(found);
  }

  /** The other saved search named `name` ignoring case, if any. */
  clash(name: string, ignoredId: string | null) {
    return this.rows.find((row) => row.id !== ignoredId && sameName(row.name, name));
  }

  replace(saved: SavedSearch) {
    this.rows = this.rows.map((row) => (row.id === saved.id ? saved : row));
  }
}

const rule = (message: string) => Effect.fail(new RuleViolation({ message }));

function checkName(name: string) {
  const trimmed = name.trim();
  return trimmed === "" || trimmed.length > 300
    ? rule("Name must be 1 to 300 characters.")
    : Effect.succeed(trimmed);
}

function checkScope(store: SavedSearchStore, scope: typeof SearchScope.Type) {
  const exists =
    scope.kind === "allProjects" ||
    store.summaries.some(({ project }) => project.id === scope.projectId);
  return exists ? Effect.void : rule("The project this search is limited to no longer exists.");
}

function save(store: SavedSearchStore, name: string, definition: Definition, overwrite: boolean) {
  const searches = store.savedSearches;
  return Effect.gen(function* () {
    const clean = yield* checkName(name);
    yield* checkScope(store, definition.scope);
    const existing = searches.clash(clean, null);
    if (existing !== undefined && !overwrite) {
      return yield* rule(`A saved search named '${existing.name}' already exists.`);
    }
    if (existing !== undefined) {
      const replaced = { ...existing, ...definition };
      searches.replace(replaced);
      return { saved: replaced, replaced: true };
    }
    const saved = { id: store.nextId(), name: clean, ...definition };
    searches.rows.push(saved);
    return { saved, replaced: false };
  });
}

function rename(store: SavedSearchStore, id: string, name: string) {
  const searches = store.savedSearches;
  return Effect.gen(function* () {
    const found = yield* searches.find(id);
    const clean = yield* checkName(name);
    const clash = searches.clash(clean, found.id);
    if (clash !== undefined) {
      return yield* rule(`A saved search named '${clash.name}' already exists.`);
    }
    searches.replace({ ...found, name: clean });
    return clean;
  });
}

/** Fake saved-search handlers that record the server's undo labels (§7.7). */
export function savedSearchHandlers(store: SavedSearchStore, track: Track) {
  const searches = store.savedSearches;
  return {
    ListSavedSearches: () =>
      store.record("ListSavedSearches").pipe(Effect.map(() => [...searches.rows])),
    FindSavedSearch: ({ savedSearchId }: { readonly savedSearchId: string }) =>
      store.record("FindSavedSearch").pipe(Effect.andThen(() => searches.find(savedSearchId))),
    SaveSavedSearch: (payload: {
      readonly name: string;
      readonly definition: Definition;
      readonly overwrite: boolean;
    }) =>
      track(
        store
          .record("SaveSavedSearch")
          .pipe(
            Effect.andThen(
              Effect.suspend(() =>
                save(store, payload.name, payload.definition, payload.overwrite),
              ),
            ),
          ),
        ({ saved, replaced }) =>
          replaced ? `Replace saved search '${saved.name}'` : `Save search '${saved.name}'`,
      ).pipe(Effect.map(({ saved }) => saved)),
    RenameSavedSearch: ({ savedSearchId, name }: { savedSearchId: string; name: string }) =>
      track(
        store
          .record("RenameSavedSearch")
          .pipe(Effect.andThen(Effect.suspend(() => rename(store, savedSearchId, name)))),
        (renamed) => `Rename saved search '${renamed}'`,
      ).pipe(Effect.asVoid),
    DeleteSavedSearch: ({ savedSearchId }: { readonly savedSearchId: string }) =>
      track(
        store.record("DeleteSavedSearch").pipe(
          Effect.andThen(() => searches.find(savedSearchId)),
          Effect.tap((found) => Effect.sync(() => searches.remove(found.id))),
        ),
        (found) => `Delete saved search '${found.name}'`,
      ).pipe(Effect.asVoid),
    ReorderSavedSearches: () => Effect.die(new Error("The web tests do not reorder searches.")),
  };
}
