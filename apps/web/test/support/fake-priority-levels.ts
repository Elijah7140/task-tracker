import { type PriorityLevelProjection, RuleViolation } from "@task-tracker/contracts";
import { Effect } from "effect";

type PriorityLevel = typeof PriorityLevelProjection.Type;

/** Formats a priority as the server does: "7", "7 · Hotfix" or the name alone. */
export function priorityLabel(name: string, number: number | null): string {
  if (number === null) {
    return name;
  }
  return name === "" ? String(number) : `${number} · ${name}`;
}

/** Access to the fake's priority rows and its shared lookup name rules. */
export interface PriorityLevelStore {
  readonly rows: () => Array<PriorityLevel>;
  readonly setRows: (next: Array<PriorityLevel>) => void;
  readonly nextId: () => string;
  readonly validateName: (name: string, excludeId?: string) => Effect.Effect<string, RuleViolation>;
}

const fail = (message: string) => Effect.fail(new RuleViolation({ message }));

function checkNumber(store: PriorityLevelStore, id: string | null, number: number | null) {
  if (number === null) {
    return Effect.void;
  }
  if (!Number.isSafeInteger(number) || number < 1) {
    return fail("Priority number must be a whole number of at least 1.");
  }
  const taken = store
    .rows()
    .some((row) => row.id !== id && !row.isArchived && row.number === number);
  return taken ? fail(`Priority number ${number} is already in use.`) : Effect.void;
}

/** A numbered level may have an empty name; otherwise the shared name rules apply. */
function checkName(store: PriorityLevelStore, name: string, number: number | null, id?: string) {
  return number !== null && name.trim() === "" ? Effect.succeed("") : store.validateName(name, id);
}

function findRow(store: PriorityLevelStore, id: string) {
  const row = store.rows().find((candidate) => candidate.id === id.toUpperCase());
  return row === undefined ? fail("Lookup was not found.") : Effect.succeed(row);
}

function replace(store: PriorityLevelStore, updated: PriorityLevel) {
  const labelled = { ...updated, label: priorityLabel(updated.name, updated.number) };
  store.setRows(store.rows().map((row) => (row.id === updated.id ? labelled : row)));
}

/** Priority RPCs whose rules involve the optional number, mirroring the server. */
export function numberedPriorityHandlers(
  store: PriorityLevelStore,
  record: (tag: string) => Effect.Effect<unknown>,
) {
  return {
    AddPriorityLevel: ({ name, number = null }: { name: string; number?: number | null }) =>
      record("AddPriorityLevel").pipe(
        Effect.andThen(checkNumber(store, null, number)),
        Effect.andThen(checkName(store, name, number)),
        Effect.map((trimmed) => {
          const row: PriorityLevel = {
            id: store.nextId(),
            name: trimmed,
            number,
            label: priorityLabel(trimmed, number),
            colorKey: null,
            isBuiltIn: false,
            isArchived: false,
            sortOrder: store.rows().length,
          };
          store.setRows([...store.rows(), row]);
          return row;
        }),
      ),
    RenamePriorityLevel: ({ id, name }: { id: string; name: string }) =>
      record("RenamePriorityLevel").pipe(
        Effect.andThen(findRow(store, id)),
        Effect.flatMap((row) =>
          checkName(store, name, row.number, row.id).pipe(
            Effect.map((trimmed) => replace(store, { ...row, name: trimmed })),
          ),
        ),
      ),
    RestorePriorityLevel: ({ id }: { id: string }) =>
      record("RestorePriorityLevel").pipe(
        Effect.andThen(findRow(store, id)),
        Effect.tap((row) => checkNumber(store, row.id, row.number)),
        Effect.map((row) => replace(store, { ...row, isArchived: false })),
      ),
    SetPriorityNumber: ({ id, number }: { id: string; number: number | null }) =>
      record("SetPriorityNumber").pipe(
        Effect.andThen(findRow(store, id)),
        Effect.tap((row) => checkNumber(store, row.id, number)),
        Effect.tap((row) =>
          number === null && row.name === ""
            ? fail("Name must be 1 to 300 characters.")
            : Effect.void,
        ),
        Effect.map((row) => replace(store, { ...row, number })),
      ),
  };
}
