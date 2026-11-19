import { CompletionResult, ItemEdit, NotFound, RuleViolation } from "@task-tracker/contracts";
import { Effect } from "effect";
import { type FakeItemNode, type FakeUrgency, recomputeAreaTree } from "./fake-area-items.js";

type CompletionResultType = typeof CompletionResult.Type;
type ItemEditType = typeof ItemEdit.Type;
type ItemError = RuleViolation | NotFound;

/** A soft-deleted subtree stored in an area so RestoreItems can restore it by batch ID. */
export interface DeletedItemBatch {
  readonly batchId: string;
  readonly parentItemId: string | null;
  readonly root: FakeItemNode;
}

/** Mutable in-memory items, base urgencies, and soft-delete batches for one project area. */
export interface FakeAreaState {
  nodes: Array<FakeItemNode>;
  readonly baseUrgencies: Map<string, FakeUrgency>;
  readonly deletedBatches: Map<string, DeletedItemBatch>;
}

/** Minimal store surface needed by {@link itemHandlers}. */
export interface FakeItemStoreContext {
  readonly nextId: () => string;
  readonly nextTimestamp: () => string;
  readonly autoCompleteFor: (projectId: string) => boolean;
  readonly requireArea: (
    projectId: string,
    folderId: string | null,
  ) => Effect.Effect<FakeAreaState, ItemError>;
  readonly allAreas: () => ReadonlyArray<FakeAreaState>;
}

const missingItem = () => new NotFound({ entity: "Item", message: "Item is missing or deleted." });

const missingBatch = () =>
  new NotFound({ entity: "DeletionBatch", message: "Item deletion batch was not found." });

function validItemTitle(title: string): Effect.Effect<string, RuleViolation> {
  const trimmed = title.trim();
  return trimmed.length > 0 && title.length <= 300
    ? Effect.succeed(trimmed)
    : Effect.fail(
        new RuleViolation({
          message: "Item title is required and must be at most 300 characters.",
        }),
      );
}

/** Finds a node along with its parent node (null if root) and containing siblings array. */
function locateNode(
  nodes: Array<FakeItemNode>,
  itemId: string,
  parent: FakeItemNode | null = null,
):
  | {
      node: FakeItemNode;
      parent: FakeItemNode | null;
      siblings: Array<FakeItemNode>;
      index: number;
    }
  | undefined {
  for (let index = 0; index < nodes.length; index += 1) {
    const candidate = nodes[index]!;
    if (candidate.item.id === itemId) {
      return { node: candidate, parent, siblings: nodes, index };
    }
    const nested = locateNode(candidate.children as Array<FakeItemNode>, itemId, candidate);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

function collectSubtreeIds(node: FakeItemNode, ids: Set<string> = new Set()): Set<string> {
  ids.add(node.item.id);
  for (const child of node.children) {
    collectSubtreeIds(child, ids);
  }
  return ids;
}

function collectOpenDescendants(
  node: FakeItemNode,
  out: Array<FakeItemNode> = [],
): Array<FakeItemNode> {
  for (const child of node.children) {
    if (child.item.completedAtUtc === null) {
      out.push(child);
    }
    collectOpenDescendants(child, out);
  }
  return out;
}

function ancestorNodes(nodes: Array<FakeItemNode>, itemId: string | null): Array<FakeItemNode> {
  const result: Array<FakeItemNode> = [];
  let currentId = itemId;
  while (currentId !== null) {
    const found = locateNode(nodes, currentId);
    if (found === undefined) {
      break;
    }
    result.push(found.node);
    currentId = found.parent?.item.id ?? null;
  }
  return result;
}

function mapTree(
  nodes: ReadonlyArray<FakeItemNode>,
  transform: (node: FakeItemNode) => FakeItemNode,
): Array<FakeItemNode> {
  return nodes.map((node) => {
    const mappedChildren = mapTree(node.children, transform);
    return transform({ ...node, children: mappedChildren });
  });
}

function rewriteFolderId(node: FakeItemNode, folderId: string | null): FakeItemNode {
  return {
    ...node,
    item: { ...node.item, folderId },
    children: node.children.map((child) => rewriteFolderId(child, folderId)),
  };
}

function detachNode(nodes: ReadonlyArray<FakeItemNode>, itemId: string): Array<FakeItemNode> {
  return nodes
    .filter((node) => node.item.id !== itemId)
    .map((node) => ({ ...node, children: detachNode(node.children, itemId) }));
}

function reconcileAncestors(
  area: FakeAreaState,
  parentIds: ReadonlyArray<string | null>,
  autoComplete: boolean,
  now: string,
  changes: Array<{ readonly itemId: string; readonly completedAtUtc: string | null }> = [],
) {
  if (!autoComplete) {
    return;
  }
  const visited = new Set<string>();
  const toReconcile: Array<string> = [];
  for (const parentId of parentIds) {
    for (const ancestor of ancestorNodes(area.nodes, parentId)) {
      if (!visited.has(ancestor.item.id)) {
        visited.add(ancestor.item.id);
        toReconcile.push(ancestor.item.id);
      }
    }
  }
  const updates = new Map<string, string | null>();
  for (const id of toReconcile) {
    const located = locateNode(area.nodes, id);
    if (located === undefined || located.node.children.length === 0) {
      continue;
    }
    const allComplete = located.node.children.every(
      (child) =>
        (updates.has(child.item.id) ? updates.get(child.item.id) : child.item.completedAtUtc) !==
        null,
    );
    const current = located.node.item.completedAtUtc;
    const next = allComplete ? (current ?? now) : null;
    if (next !== current) {
      updates.set(id, next);
      changes.push({ itemId: id, completedAtUtc: next });
    }
  }
  if (updates.size > 0) {
    area.nodes = mapTree(area.nodes, (node) =>
      updates.has(node.item.id)
        ? { ...node, item: { ...node.item, completedAtUtc: updates.get(node.item.id) ?? null } }
        : node,
    );
  }
}

function sameIdSet(
  expectedIds: ReadonlyArray<string>,
  suppliedIds?: ReadonlyArray<string>,
): boolean {
  if (suppliedIds === undefined || suppliedIds.length !== expectedIds.length) {
    return false;
  }
  const supplied = new Set(suppliedIds.map((id) => id.toUpperCase()));
  return expectedIds.every((id) => supplied.has(id.toUpperCase()));
}

/** Creates an item in an area, optionally under a parent item. */
export function applyCreateItem(
  store: FakeItemStoreContext,
  area: FakeAreaState,
  projectId: string,
  folderId: string | null,
  parentItemId: string | null,
  title: string,
): Effect.Effect<FakeItemNode["item"], ItemError> {
  return Effect.gen(function* () {
    const trimmed = yield* validItemTitle(title);
    if (parentItemId !== null && locateNode(area.nodes, parentItemId) === undefined) {
      return yield* Effect.fail(missingItem());
    }
    const now = store.nextTimestamp();
    const id = store.nextId();
    const newNode: FakeItemNode = {
      item: {
        id,
        projectId,
        folderId,
        parentItemId,
        title: trimmed,
        description: null,
        ticketNumber: null,
        itemTypeId: null,
        priorityLevelId: null,
        dueDate: null,
        dueTime: null,
        scheduledStart: null,
        scheduledEnd: null,
        sortOrder: 0,
        createdAtUtc: now,
        updatedAtUtc: now,
        completedAtUtc: null,
        deletedAtUtc: null,
        deletionBatchId: null,
      },
      ownUrgency: "None",
      displayedUrgency: { value: "None", sourceDescendantId: null },
      isFinished: false,
      children: [],
    };
    area.baseUrgencies.set(id, "None");
    if (parentItemId === null) {
      area.nodes = [...area.nodes, newNode];
    } else {
      area.nodes = mapTree(area.nodes, (node) =>
        node.item.id === parentItemId ? { ...node, children: [...node.children, newNode] } : node,
      );
    }
    reconcileAncestors(area, [parentItemId], store.autoCompleteFor(projectId), now);
    area.nodes = recomputeAreaTree(area.nodes, area.baseUrgencies);
    return locateNode(area.nodes, id)!.node.item;
  });
}

/** Validates and applies built-in item fields, mirroring the server's rule messages. */
export function applyEditItem(
  store: FakeItemStoreContext,
  itemId: string,
  fields: ItemEditType,
): Effect.Effect<void, ItemError> {
  return Effect.gen(function* () {
    const trimmed = yield* validItemTitle(fields.title);
    if (fields.ticketNumber !== null && fields.ticketNumber.length > 100) {
      return yield* Effect.fail(
        new RuleViolation({ message: "Ticket number must be at most 100 characters." }),
      );
    }
    if (fields.dueDate === null && fields.dueTime !== null) {
      return yield* Effect.fail(new RuleViolation({ message: "Due time requires a due date." }));
    }
    if (
      fields.scheduledEnd !== null &&
      (fields.scheduledStart === null || fields.scheduledStart > fields.scheduledEnd)
    ) {
      return yield* Effect.fail(
        new RuleViolation({ message: "Scheduled end requires a start no later than the end." }),
      );
    }
    for (const area of store.allAreas()) {
      if (locateNode(area.nodes, itemId) !== undefined) {
        const now = store.nextTimestamp();
        area.nodes = mapTree(area.nodes, (node) =>
          node.item.id === itemId
            ? {
                ...node,
                item: {
                  ...node.item,
                  ...fields,
                  title: trimmed,
                  ticketNumber: fields.ticketNumber?.trim() || null,
                  updatedAtUtc: now,
                },
              }
            : node,
        );
        area.nodes = recomputeAreaTree(area.nodes, area.baseUrgencies);
        return;
      }
    }
    return yield* Effect.fail(missingItem());
  });
}

/** Sets only an item's priority, refusing a missing or archived level as the server does. */
export function applySetItemPriority(
  store: FakeItemStoreContext,
  itemId: string,
  priorityLevelId: string | null,
  levels: ReadonlyArray<{ readonly id: string; readonly isArchived: boolean }>,
): Effect.Effect<void, ItemError> {
  return Effect.gen(function* () {
    const area = store
      .allAreas()
      .find((candidate) => locateNode(candidate.nodes, itemId) !== undefined);
    if (area === undefined) {
      return yield* Effect.fail(missingItem());
    }
    if (
      priorityLevelId !== null &&
      !levels.some((level) => level.id === priorityLevelId.toUpperCase() && !level.isArchived)
    ) {
      return yield* Effect.fail(new RuleViolation({ message: "Priority is missing or archived." }));
    }
    const id = priorityLevelId?.toUpperCase() ?? null;
    const now = store.nextTimestamp();
    area.nodes = mapTree(area.nodes, (node) =>
      node.item.id === itemId
        ? { ...node, item: { ...node.item, priorityLevelId: id, updatedAtUtc: now } }
        : node,
    );
  });
}

/** Completes or reopens an item, mirroring Core's confirmation, blocked, and roll-up rules. */
export function applySetItemCompleted(
  store: FakeItemStoreContext,
  area: FakeAreaState,
  projectId: string,
  itemId: string,
  completed: boolean,
  confirmedOpenItemIds?: ReadonlyArray<string>,
): Effect.Effect<CompletionResultType, NotFound> {
  const located = locateNode(area.nodes, itemId);
  if (located === undefined) {
    return Effect.fail(missingItem());
  }
  const autoComplete = store.autoCompleteFor(projectId);
  const now = store.nextTimestamp();
  if (completed) {
    const openDescendants = autoComplete ? collectOpenDescendants(located.node) : [];
    const openSubItemIds = openDescendants.map((node) => node.item.id);
    if (openSubItemIds.length > 0 && !sameIdSet(openSubItemIds, confirmedOpenItemIds)) {
      return Effect.succeed({
        kind: "needs-confirmation",
        openSubItemCount: openSubItemIds.length,
        openSubItemIds,
      });
    }
    const targetIds = new Set([itemId, ...openSubItemIds]);
    const changes: Array<{ readonly itemId: string; readonly completedAtUtc: string | null }> = [];
    area.nodes = mapTree(area.nodes, (node) => {
      if (!targetIds.has(node.item.id) || node.item.completedAtUtc !== null) {
        return node;
      }
      changes.push({ itemId: node.item.id, completedAtUtc: now });
      return { ...node, item: { ...node.item, completedAtUtc: now, updatedAtUtc: now } };
    });
    reconcileAncestors(area, [located.parent?.item.id ?? null], autoComplete, now, changes);
    area.nodes = recomputeAreaTree(area.nodes, area.baseUrgencies);
    return Effect.succeed({ kind: "applied", changes });
  }

  if (
    autoComplete &&
    located.node.children.length > 0 &&
    located.node.children.every((child) => child.item.completedAtUtc !== null)
  ) {
    return Effect.succeed({
      kind: "blocked",
      reason: "Reopen a sub-item instead, or add a new one.",
    });
  }
  const changes: Array<{ readonly itemId: string; readonly completedAtUtc: string | null }> = [];
  if (located.node.item.completedAtUtc !== null) {
    changes.push({ itemId, completedAtUtc: null });
    area.nodes = mapTree(area.nodes, (node) =>
      node.item.id === itemId
        ? { ...node, item: { ...node.item, completedAtUtc: null, updatedAtUtc: now } }
        : node,
    );
  }
  reconcileAncestors(area, [located.parent?.item.id ?? null], autoComplete, now, changes);
  area.nodes = recomputeAreaTree(area.nodes, area.baseUrgencies);
  return Effect.succeed({ kind: "applied", changes });
}

function moveWithinArea(
  store: FakeItemStoreContext,
  area: FakeAreaState,
  projectId: string,
  itemId: string,
  newParentId: string | null,
): Effect.Effect<void, ItemError> {
  const located = locateNode(area.nodes, itemId);
  if (located === undefined) {
    return Effect.fail(missingItem());
  }
  if (newParentId !== null) {
    if (locateNode(area.nodes, newParentId) === undefined) {
      return Effect.fail(missingItem());
    }
    const subtreeIds = collectSubtreeIds(located.node);
    if (subtreeIds.has(newParentId)) {
      return Effect.fail(new RuleViolation({ message: "Item move would create a cycle." }));
    }
  }
  const oldParentId = located.parent?.item.id ?? null;
  const movedNode: FakeItemNode = {
    ...located.node,
    item: { ...located.node.item, parentItemId: newParentId },
  };
  area.nodes = detachNode(area.nodes, itemId);
  if (newParentId === null) {
    area.nodes = [...area.nodes, movedNode];
  } else {
    area.nodes = mapTree(area.nodes, (node) =>
      node.item.id === newParentId ? { ...node, children: [...node.children, movedNode] } : node,
    );
  }
  reconcileAncestors(
    area,
    [oldParentId, newParentId],
    store.autoCompleteFor(projectId),
    store.nextTimestamp(),
  );
  area.nodes = recomputeAreaTree(area.nodes, area.baseUrgencies);
  return Effect.void;
}

function applyIndentItem(
  store: FakeItemStoreContext,
  area: FakeAreaState,
  projectId: string,
  itemId: string,
): Effect.Effect<void, ItemError> {
  const located = locateNode(area.nodes, itemId);
  if (located === undefined) {
    return Effect.fail(missingItem());
  }
  if (located.index === 0) {
    return Effect.fail(new RuleViolation({ message: "The first sibling cannot be indented." }));
  }
  return moveWithinArea(
    store,
    area,
    projectId,
    itemId,
    located.siblings[located.index - 1]!.item.id,
  );
}

function applyOutdentItem(
  store: FakeItemStoreContext,
  area: FakeAreaState,
  projectId: string,
  itemId: string,
): Effect.Effect<void, ItemError> {
  const located = locateNode(area.nodes, itemId);
  if (located === undefined) {
    return Effect.fail(missingItem());
  }
  if (located.parent === null) {
    return Effect.fail(new RuleViolation({ message: "A top-level item cannot be outdented." }));
  }
  return moveWithinArea(store, area, projectId, itemId, located.parent.item.parentItemId);
}

function applyReorderItems(
  area: FakeAreaState,
  parentItemId: string | null,
  itemIds: ReadonlyArray<string>,
): Effect.Effect<void, ItemError> {
  const siblings =
    parentItemId === null ? area.nodes : locateNode(area.nodes, parentItemId)?.node.children;
  if (siblings === undefined) {
    return Effect.fail(missingItem());
  }
  const byId = new Map(siblings.map((sibling) => [sibling.item.id, sibling]));
  if (!sameIdSet([...byId.keys()], itemIds)) {
    return Effect.fail(
      new RuleViolation({ message: "Order must contain every sibling exactly once." }),
    );
  }
  const ordered = itemIds.map((id) => byId.get(id)!);
  if (parentItemId === null) {
    area.nodes = ordered;
  } else {
    area.nodes = mapTree(area.nodes, (node) =>
      node.item.id === parentItemId ? { ...node, children: ordered } : node,
    );
  }
  area.nodes = recomputeAreaTree(area.nodes, area.baseUrgencies);
  return Effect.void;
}

function applyMoveItemToArea(
  source: FakeAreaState,
  destination: FakeAreaState,
  sourceFolderId: string | null,
  targetFolderId: string | null,
  itemId: string,
): Effect.Effect<void, ItemError> {
  const located = locateNode(source.nodes, itemId);
  if (located === undefined) {
    return Effect.fail(missingItem());
  }
  if (located.parent !== null || sourceFolderId === targetFolderId) {
    return Effect.fail(
      new RuleViolation({
        message: "Only a top-level item can move to another area in the same project.",
      }),
    );
  }
  const moved = rewriteFolderId(located.node, targetFolderId);
  for (const movedId of collectSubtreeIds(moved)) {
    const urgency = source.baseUrgencies.get(movedId);
    if (urgency !== undefined) {
      destination.baseUrgencies.set(movedId, urgency);
      source.baseUrgencies.delete(movedId);
    }
  }
  source.nodes = detachNode(source.nodes, itemId);
  destination.nodes = [...destination.nodes, moved];
  source.nodes = recomputeAreaTree(source.nodes, source.baseUrgencies);
  destination.nodes = recomputeAreaTree(destination.nodes, destination.baseUrgencies);
  return Effect.void;
}

/** Soft-deletes a subtree into a deletion batch and reconciles remaining ancestors. */
export function applyDeleteItem(
  store: FakeItemStoreContext,
  area: FakeAreaState,
  projectId: string,
  itemId: string,
): Effect.Effect<string, NotFound> {
  const located = locateNode(area.nodes, itemId);
  if (located === undefined) {
    return Effect.fail(missingItem());
  }
  const now = store.nextTimestamp();
  const batchId = store.nextId();
  const parentItemId = located.parent?.item.id ?? null;
  area.deletedBatches.set(batchId, { batchId, parentItemId, root: located.node });
  area.nodes = detachNode(area.nodes, itemId);
  reconcileAncestors(area, [parentItemId], store.autoCompleteFor(projectId), now);
  area.nodes = recomputeAreaTree(area.nodes, area.baseUrgencies);
  return Effect.succeed(batchId);
}

function applyRestoreItems(
  store: FakeItemStoreContext,
  area: FakeAreaState,
  projectId: string,
  batchId: string,
): Effect.Effect<void, ItemError> {
  const batch = area.deletedBatches.get(batchId);
  if (batch === undefined) {
    return Effect.fail(missingBatch());
  }
  if (batch.parentItemId !== null && locateNode(area.nodes, batch.parentItemId) === undefined) {
    return Effect.fail(new RuleViolation({ message: "Restore the parent item first." }));
  }
  area.deletedBatches.delete(batchId);
  if (batch.parentItemId === null) {
    area.nodes = [...area.nodes, batch.root];
  } else {
    area.nodes = mapTree(area.nodes, (node) =>
      node.item.id === batch.parentItemId
        ? { ...node, children: [...node.children, batch.root] }
        : node,
    );
  }
  reconcileAncestors(
    area,
    [batch.parentItemId],
    store.autoCompleteFor(projectId),
    store.nextTimestamp(),
  );
  area.nodes = recomputeAreaTree(area.nodes, area.baseUrgencies);
  return Effect.void;
}

/** Builds all RPC handlers for {@link ItemRpcs} excluding `LoadArea`. */
export function itemHandlers(
  store: FakeItemStoreContext,
  record: (tag: string) => Effect.Effect<unknown>,
) {
  return {
    CreateItem: ({
      projectId,
      folderId,
      parentItemId,
      title,
    }: {
      projectId: string;
      folderId: string | null;
      parentItemId: string | null;
      title: string;
    }) =>
      record("CreateItem").pipe(
        Effect.andThen(store.requireArea(projectId, folderId)),
        Effect.flatMap((area) =>
          applyCreateItem(store, area, projectId, folderId, parentItemId, title),
        ),
      ),

    EditItem: ({ itemId, fields }: { itemId: string; fields: ItemEditType }) =>
      record("EditItem").pipe(Effect.andThen(applyEditItem(store, itemId, fields))),

    SetItemCompleted: ({
      projectId,
      folderId,
      itemId,
      completed,
      confirmedOpenItemIds,
    }: {
      projectId: string;
      folderId: string | null;
      itemId: string;
      completed: boolean;
      confirmedOpenItemIds?: ReadonlyArray<string>;
    }) =>
      record("SetItemCompleted").pipe(
        Effect.andThen(store.requireArea(projectId, folderId)),
        Effect.flatMap((area) =>
          applySetItemCompleted(store, area, projectId, itemId, completed, confirmedOpenItemIds),
        ),
      ),

    IndentItem: ({
      projectId,
      folderId,
      itemId,
    }: {
      projectId: string;
      folderId: string | null;
      itemId: string;
    }) =>
      record("IndentItem").pipe(
        Effect.andThen(store.requireArea(projectId, folderId)),
        Effect.flatMap((area) => applyIndentItem(store, area, projectId, itemId)),
      ),

    OutdentItem: ({
      projectId,
      folderId,
      itemId,
    }: {
      projectId: string;
      folderId: string | null;
      itemId: string;
    }) =>
      record("OutdentItem").pipe(
        Effect.andThen(store.requireArea(projectId, folderId)),
        Effect.flatMap((area) => applyOutdentItem(store, area, projectId, itemId)),
      ),

    MoveItem: ({
      projectId,
      folderId,
      itemId,
      parentItemId,
    }: {
      projectId: string;
      folderId: string | null;
      itemId: string;
      parentItemId: string | null;
    }) =>
      record("MoveItem").pipe(
        Effect.andThen(store.requireArea(projectId, folderId)),
        Effect.flatMap((area) => moveWithinArea(store, area, projectId, itemId, parentItemId)),
      ),

    ReorderItems: ({
      projectId,
      folderId,
      parentItemId,
      itemIds,
    }: {
      projectId: string;
      folderId: string | null;
      parentItemId: string | null;
      itemIds: ReadonlyArray<string>;
    }) =>
      record("ReorderItems").pipe(
        Effect.andThen(store.requireArea(projectId, folderId)),
        Effect.flatMap((area) => applyReorderItems(area, parentItemId, itemIds)),
      ),

    MoveItemToArea: ({
      projectId,
      sourceFolderId,
      targetFolderId,
      itemId,
    }: {
      projectId: string;
      sourceFolderId: string | null;
      targetFolderId: string | null;
      itemId: string;
    }) =>
      record("MoveItemToArea").pipe(
        Effect.andThen(
          Effect.all([
            store.requireArea(projectId, sourceFolderId),
            store.requireArea(projectId, targetFolderId),
          ]),
        ),
        Effect.flatMap(([source, destination]) =>
          applyMoveItemToArea(source, destination, sourceFolderId, targetFolderId, itemId),
        ),
      ),

    DeleteItem: ({
      projectId,
      folderId,
      itemId,
    }: {
      projectId: string;
      folderId: string | null;
      itemId: string;
    }) =>
      record("DeleteItem").pipe(
        Effect.andThen(store.requireArea(projectId, folderId)),
        Effect.flatMap((area) => applyDeleteItem(store, area, projectId, itemId)),
      ),

    RestoreItems: ({
      projectId,
      folderId,
      batchId,
    }: {
      projectId: string;
      folderId: string | null;
      batchId: string;
    }) =>
      record("RestoreItems").pipe(
        Effect.andThen(store.requireArea(projectId, folderId)),
        Effect.flatMap((area) => applyRestoreItems(store, area, projectId, batchId)),
      ),
  };
}
