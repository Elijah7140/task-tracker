import { type CurrentItemCard, RuleViolation } from "@task-tracker/contracts";
import { Effect } from "effect";
import { FAKE_LOOKUPS, type FakeItemNode } from "./fake-area-items.js";
import type { FakeProjectStore } from "./fake-task-tracker-server.js";

type Item = FakeItemNode["item"];

/** The stored `currentItemId` setting, outside undo history like the real server (§7.18). */
export class FakeCurrentItem {
  itemId: string | null = null;
  /** A simulated failure message for `SetCurrentItem`. */
  setFailure: string | null = null;
}

function allItems(store: FakeProjectStore): Array<Item> {
  const visit = (nodes: ReadonlyArray<FakeItemNode>): Array<Item> =>
    nodes.flatMap((node) => [node.item, ...visit(node.children)]);
  return store.allAreas().flatMap((area) => visit(area.nodes));
}

/** An item that is neither deleted nor inside a deleted project. */
function availableItem(store: FakeProjectStore, itemId: string) {
  const item = allItems(store).find((candidate) => candidate.id === itemId.toUpperCase());
  const project = store.summaries.find((summary) => summary.project.id === item?.projectId);
  return item === undefined || item.deletedAtUtc !== null || project === undefined
    ? undefined
    : { item, projectName: project.project.name };
}

function areaPath(store: FakeProjectStore, projectName: string, folderId: string | null) {
  const names: Array<string> = [];
  for (let id = folderId; id !== null;) {
    const folder = store.folders.find((candidate) => candidate.id === id);
    names.unshift(folder?.name ?? "");
    id = folder?.parentFolderId ?? null;
  }
  return [projectName, ...names].join(" › ");
}

function lookupName(
  entries: ReadonlyArray<{ readonly id: string; readonly name: string }>,
  id: string | null,
) {
  return entries.find((entry) => entry.id === id)?.name ?? null;
}

function card(store: FakeProjectStore, itemId: string): typeof CurrentItemCard.Type | null {
  const found = availableItem(store, itemId);
  if (found === undefined) {
    return null;
  }
  const { item, projectName } = found;
  const priorities = [...FAKE_LOOKUPS.priorityLevels, ...store.extraLookups.priorityLevels];
  return {
    itemId: item.id,
    projectId: item.projectId,
    folderId: item.folderId,
    title: item.title,
    areaPath: areaPath(store, projectName, item.folderId),
    statusName: lookupName(store.statuses.ordered(), item.statusId),
    priorityName: lookupName(priorities, item.priorityLevelId),
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    isCompleted: item.completedAtUtc !== null,
    description: item.description,
  };
}

/** Fake `LoadCurrentItem` and `SetCurrentItem`. */
export function currentItemHandlers(store: FakeProjectStore) {
  const state = store.currentItem;
  return {
    LoadCurrentItem: () =>
      store
        .record("LoadCurrentItem")
        .pipe(
          Effect.andThen(() =>
            Effect.sync(() => (state.itemId === null ? null : card(store, state.itemId))),
          ),
        ),
    SetCurrentItem: ({ itemId }: { readonly itemId: string | null }) =>
      store.record("SetCurrentItem").pipe(
        Effect.andThen(() => {
          const message =
            state.setFailure ??
            (itemId !== null && availableItem(store, itemId) === undefined
              ? "This item is no longer available."
              : null);
          if (message !== null) {
            return Effect.fail(new RuleViolation({ message }));
          }
          state.itemId = itemId?.toUpperCase() ?? null;
          return Effect.void;
        }),
      ),
  };
}
