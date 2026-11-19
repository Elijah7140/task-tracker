import {
  type CompletionResult,
  type NotFound,
  RuleViolation,
  type StatusKind,
  type StatusProjection,
} from "@task-tracker/contracts";
import { Effect } from "effect";
import { FAKE_LOOKUPS, type FakeItemNode } from "./fake-area-items.js";
import { applySetItemCompleted, type FakeAreaState } from "./fake-item-operations.js";

type Status = typeof StatusProjection.Type;
type Kind = typeof StatusKind.Type;
type Result = typeof CompletionResult.Type;

/** Store surface the status handlers need from the fake server. */
export interface FakeStatusTarget {
  readonly statuses: FakeStatuses;
  readonly nextId: () => string;
  readonly nextTimestamp: () => string;
  readonly autoCompleteFor: (projectId: string) => boolean;
  readonly requireArea: (
    projectId: string,
    folderId: string | null,
  ) => Effect.Effect<FakeAreaState, NotFound | RuleViolation>;
  readonly allAreas: () => ReadonlyArray<FakeAreaState>;
  readonly itemProject: (itemId: string) => Effect.Effect<string, NotFound>;
  readonly patchItem: (itemId: string, patch: Partial<FakeItemNode["item"]>) => void;
}

const rule = (message: string) => Effect.fail(new RuleViolation({ message }));

/** Workflow statuses mirroring the server's Core rules and messages. */
export class FakeStatuses {
  rows: Array<Status> = FAKE_LOOKUPS.statuses.map((row) => ({ ...row }));

  /** Rows in list order, including archived rows. */
  ordered = () => this.rows.toSorted((left, right) => left.sortOrder - right.sortOrder);

  find = (id: string) => {
    const row = this.rows.find((candidate) => candidate.id === id.toUpperCase());
    return row === undefined ? rule("Status was not found.") : Effect.succeed(row);
  };

  /** Validates a name against every other status, including archived ones. */
  uniqueName = (
    name: string,
    excludeId: string | null,
    archivedAdvice: string,
  ): Effect.Effect<string, RuleViolation> => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || name.length > 300) {
      return rule("Name must be 1 to 300 characters.");
    }
    const clash = this.rows.find(
      (row) => row.id !== excludeId && row.name.toUpperCase() === trimmed.toUpperCase(),
    );
    if (clash?.isArchived) {
      return rule(`The name '${trimmed}' is used by an archived status. ${archivedAdvice}`);
    }
    return clash === undefined
      ? Effect.succeed(trimmed)
      : rule(`The name '${trimmed}' is already used by another status.`);
  };

  replace = (id: string, change: Partial<Status>) => {
    this.rows = this.rows.map((row) => (row.id === id ? { ...row, ...change } : row));
  };
}

function findItem(target: FakeStatusTarget, itemId: string) {
  const visit = (nodes: ReadonlyArray<FakeItemNode>): FakeItemNode["item"] | undefined => {
    for (const node of nodes) {
      const found = node.item.id === itemId ? node.item : visit(node.children);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  };
  return target.itemProject(itemId).pipe(
    Effect.map(() =>
      target
        .allAreas()
        .map((area) => visit(area.nodes))
        .find(Boolean)!,
    ),
  );
}

/**
 * Assigns a status, or none, through the completion rules: a Done status completes
 * the item (asking first about open sub-items) and an Open status or none reopens it.
 */
export function applySetItemStatus(
  target: FakeStatusTarget,
  itemId: string,
  statusId: string | null,
  approval?: ReadonlyArray<string>,
): Effect.Effect<Result, NotFound | RuleViolation> {
  return Effect.gen(function* () {
    const item = yield* findItem(target, itemId);
    if (item.statusId === statusId) {
      return { kind: "applied", changes: [] };
    }
    const status = target.statuses.rows.find((row) => row.id === statusId && !row.isArchived);
    if (statusId !== null && status === undefined) {
      return yield* rule("Status is missing or archived.");
    }
    const done = status?.kind === "Done";
    let result: Result = { kind: "applied", changes: [] };
    if (done !== (item.completedAtUtc !== null)) {
      const area = yield* target.requireArea(item.projectId, item.folderId);
      result = yield* applySetItemCompleted(target, area, item.projectId, itemId, done, approval);
    }
    if (result.kind === "applied") {
      target.patchItem(itemId, done ? { statusId } : { statusId, reopenStatusId: null });
    }
    return result;
  });
}

/** Status list and assignment handlers behind the browser tests' real RPC client. */
export function statusHandlers(
  target: FakeStatusTarget,
  record: (tag: string) => Effect.Effect<unknown>,
) {
  const statuses = target.statuses;
  const edit = (
    tag: string,
    id: string,
    change: (row: Status) => Effect.Effect<Partial<Status>, RuleViolation>,
  ) =>
    record(tag).pipe(
      Effect.andThen(statuses.find(id)),
      Effect.flatMap((row) =>
        change(row).pipe(Effect.map((patch) => statuses.replace(row.id, patch))),
      ),
    );
  return {
    ListStatuses: () => record("ListStatuses").pipe(Effect.map(statuses.ordered)),
    AddStatus: ({ name, kind }: { name: string; kind: Kind }) =>
      record("AddStatus").pipe(
        Effect.andThen(statuses.uniqueName(name, null, "Restore it instead.")),
        Effect.map((trimmed) => {
          const sortOrder = Math.max(-1, ...statuses.rows.map((row) => row.sortOrder)) + 1;
          const row = { id: target.nextId(), name: trimmed, kind, isArchived: false, sortOrder };
          statuses.rows = [...statuses.rows, row];
          return row;
        }),
      ),
    RenameStatus: ({ id, name }: { id: string; name: string }) =>
      edit("RenameStatus", id, (row) =>
        statuses
          .uniqueName(name, row.id, "Restore or rename that one first.")
          .pipe(Effect.map((trimmed) => ({ name: trimmed }))),
      ),
    ArchiveStatus: ({ id }: { id: string }) =>
      edit("ArchiveStatus", id, (row) =>
        row.kind === "Done" &&
        !statuses.rows.some(
          (other) => other.id !== row.id && other.kind === "Done" && !other.isArchived,
        )
          ? rule("At least one Done status must stay active.")
          : Effect.succeed({ isArchived: true }),
      ),
    RestoreStatus: ({ id }: { id: string }) =>
      edit("RestoreStatus", id, () => Effect.succeed({ isArchived: false })),
    ReorderStatuses: ({ ids }: { ids: ReadonlyArray<string> }) =>
      record("ReorderStatuses").pipe(
        Effect.andThen(() => {
          const keys = ids.map((id) => id.toUpperCase());
          const complete =
            keys.length === statuses.rows.length &&
            new Set(keys).size === keys.length &&
            keys.every((id) => statuses.rows.some((row) => row.id === id));
          if (!complete) {
            return rule("Order must contain every lookup exactly once.");
          }
          statuses.rows = keys.map((id, sortOrder) => ({
            ...statuses.rows.find((row) => row.id === id)!,
            sortOrder,
          }));
          return Effect.void;
        }),
      ),
    SetItemStatus: ({
      itemId,
      statusId,
      confirmedOpenItemIds,
    }: {
      itemId: string;
      statusId: string | null;
      confirmedOpenItemIds?: ReadonlyArray<string>;
    }) =>
      record("SetItemStatus").pipe(
        Effect.andThen(applySetItemStatus(target, itemId, statusId, confirmedOpenItemIds)),
      ),
  };
}
