import type { InProgressItem } from "@task-tracker/contracts";
import { Effect } from "effect";
import { FAKE_LOOKUPS, type FakeItemNode } from "./fake-area-items.js";
import type { FakeProjectStore } from "./fake-task-tracker-server.js";

type Item = FakeItemNode["item"];
type Row = typeof InProgressItem.Type;

/** Test controls for the fake stack: urgency the real server would work out from dates. */
export class FakeInProgress {
  readonly urgency = new Map<string, Row["urgency"]>();
}

function allItems(store: FakeProjectStore): Array<Item> {
  const visit = (nodes: ReadonlyArray<FakeItemNode>): Array<Item> =>
    nodes.flatMap((node) => [node.item, ...visit(node.children)]);
  return store.allAreas().flatMap((area) => visit(area.nodes));
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

function priorities(store: FakeProjectStore) {
  return [...FAKE_LOOKUPS.priorityLevels, ...store.extraLookups.priorityLevels];
}

/** The row for an open, available item with a marked status, or undefined. */
function row(store: FakeProjectStore, item: Item): Row | undefined {
  const status = store.statuses.rows.find((candidate) => candidate.id === item.statusId);
  const project = store.summaries.find((summary) => summary.project.id === item.projectId);
  if (!status?.isInProgress || item.completedAtUtc !== null || item.deletedAtUtc !== null) {
    return undefined;
  }
  if (project === undefined) {
    return undefined;
  }
  const priority = priorities(store).find((level) => level.id === item.priorityLevelId);
  return {
    itemId: item.id,
    projectId: item.projectId,
    folderId: item.folderId,
    itemKind: item.kind ?? "Todo",
    ticketNumber: item.ticketNumber,
    title: item.title,
    areaPath: areaPath(store, project.project.name, item.folderId),
    statusName: status.name,
    priorityName: priority?.name ?? null,
    dueDate: item.dueDate,
    dueTime: item.dueTime,
    urgency: store.inProgress.urgency.get(item.id) ?? "None",
  };
}

const URGENCY_ORDER: ReadonlyArray<Row["urgency"]> = ["Overdue", "Imminent", "Approaching", "None"];

/** Most urgent first, then by priority rank, then by title, like the server (§7.18). */
function compareRows(store: FakeProjectStore) {
  const rank = (entry: Row) => {
    const level = priorities(store).find((candidate) => candidate.name === entry.priorityName);
    return level?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  };
  return (left: Row, right: Row) =>
    URGENCY_ORDER.indexOf(left.urgency) - URGENCY_ORDER.indexOf(right.urgency) ||
    rank(left) - rank(right) ||
    left.title.localeCompare(right.title);
}

/** Fake `LoadInProgressItems`. */
export function inProgressHandlers(store: FakeProjectStore) {
  return {
    LoadInProgressItems: () =>
      store.record("LoadInProgressItems").pipe(
        Effect.andThen(() =>
          Effect.sync(() =>
            allItems(store)
              .flatMap((item) => row(store, item) ?? [])
              .toSorted(compareRows(store)),
          ),
        ),
      ),
  };
}
