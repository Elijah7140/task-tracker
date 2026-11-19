import { RuleViolation, type TrashBatch } from "@task-tracker/contracts";
import { Effect } from "effect";

type Batch = typeof TrashBatch.Type;

/** The real server's message for a batch that was restored or purged elsewhere. */
export const MISSING_BATCH_MESSAGE =
  "That deletion no longer exists. It may already have been restored or deleted permanently.";

/**
 * A Trash row numbered `sequence`. Higher numbers were deleted later, so they
 * list first. Overrides replace any field, such as the kind or a blocker.
 */
export function trashBatch(
  sequence: number,
  projectId: string,
  title: string,
  overrides: Partial<Batch> = {},
): Batch {
  const suffix = String(sequence).padStart(12, "0");
  return {
    batchId: `0190A1B2-0000-7000-9000-${suffix}`,
    kind: "item",
    topNodeId: `0190A1B2-0000-7000-A000-${suffix}`,
    title,
    projectId,
    path: ["Billing"],
    deletedAt: `2026-11-13T${String(12 + sequence).padStart(2, "0")}:00:00`,
    folderCount: 0,
    itemCount: 1,
    earlierBatchCount: 0,
    restoreBlockedReason: null,
    ...overrides,
  };
}

/**
 * Deletion batches behind the fake server. A batch can carry a restore action
 * that puts its rows back into the fake store, as the server's restore does.
 */
export class FakeTrash {
  batches: Array<Batch> = [];
  /** When set, permanent deletion is refused with this rule message. */
  purgeRefusal: string | null = null;
  private readonly restorers = new Map<string, () => void>();

  /** Adds a batch and what restoring it changes elsewhere in the store. */
  add(batch: Batch, restore: () => void = () => {}) {
    this.batches.push(batch);
    this.restorers.set(batch.batchId, restore);
  }

  /** Removes a batch as if it had been restored or purged elsewhere. */
  remove(batchId: string) {
    this.batches = this.batches.filter((batch) => batch.batchId !== batchId);
  }

  /** The batches in scope, newest first. */
  list(projectId: string | null) {
    return this.batches
      .filter((batch) => projectId === null || batch.projectId === projectId)
      .toSorted((left, right) => right.deletedAt.localeCompare(left.deletedAt));
  }

  /** The batch, or the server's rule failure when it no longer exists. */
  find(batchId: string) {
    const batch = this.batches.find((candidate) => candidate.batchId === batchId);
    return batch === undefined
      ? Effect.fail(new RuleViolation({ message: MISSING_BATCH_MESSAGE }))
      : Effect.succeed(batch);
  }

  /** Applies a restore that the server would allow. */
  restore(batch: Batch) {
    if (batch.restoreBlockedReason !== null) {
      return Effect.fail(new RuleViolation({ message: batch.restoreBlockedReason }));
    }
    return Effect.sync(() => {
      this.remove(batch.batchId);
      this.restorers.get(batch.batchId)?.();
    });
  }

  /** Applies a permanent deletion unless the test refuses it. */
  purge(batchIds: ReadonlyArray<string>) {
    if (this.purgeRefusal !== null) {
      return Effect.fail(new RuleViolation({ message: this.purgeRefusal }));
    }
    return Effect.sync(() => batchIds.forEach((batchId) => this.remove(batchId)));
  }
}

interface TrashStore {
  readonly trash: FakeTrash;
  readonly record: (tag: string) => Effect.Effect<unknown>;
}

type Track = <A, E, R>(
  change: Effect.Effect<A, E, R>,
  label: (result: A) => string | null,
) => Effect.Effect<A, E, R>;

/** Trash endpoints behind the browser tests' real RPC client. Restore records history. */
export function trashHandlers({ trash, record }: TrashStore, track: Track) {
  return {
    ListTrash: ({ projectId }: { projectId: string | null }) =>
      record("ListTrash").pipe(Effect.map(() => trash.list(projectId))),
    RestoreTrashBatch: ({ batchId }: { batchId: string }) =>
      record("RestoreTrashBatch").pipe(
        Effect.andThen(trash.find(batchId)),
        Effect.flatMap((batch) => track(trash.restore(batch), () => `Restore '${batch.title}'`)),
      ),
    PurgeTrashBatch: ({ batchId }: { batchId: string }) =>
      record("PurgeTrashBatch").pipe(
        Effect.andThen(trash.find(batchId)),
        Effect.andThen(trash.purge([batchId])),
      ),
    EmptyTrash: ({ projectId }: { projectId: string | null }) =>
      record("EmptyTrash").pipe(
        Effect.andThen(() => trash.purge(trash.list(projectId).map((batch) => batch.batchId))),
      ),
  };
}
