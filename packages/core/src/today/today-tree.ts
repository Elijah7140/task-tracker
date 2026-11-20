import type { TodayItem } from "./today-item.js";

/**
 * Why a row is on the Today page: completed today, or an ancestor shown as
 * context that is still open or was completed on an earlier day (§7.14).
 */
export type TodayRowState = "completedToday" | "completedEarlier" | "open";

/** One row of a Today area tree. */
export interface TodayRow {
  readonly item: TodayItem;
  readonly state: TodayRowState;
  /** How many of its descendants were completed today, which a collapsed row shows. */
  readonly completedDescendants: number;
  readonly children: ReadonlyArray<TodayRow>;
}

/** An area of a project with the roots of its Today tree. */
export interface TodayArea {
  readonly folderId: string | null;
  readonly path: string;
  readonly rows: ReadonlyArray<TodayRow>;
}

/** One project on the Today page. */
export interface TodayProject {
  readonly projectId: string;
  readonly name: string;
  readonly areas: ReadonlyArray<TodayArea>;
}

/** The Today page: projects with their area trees and the number of today's completions. */
export interface TodayTree {
  readonly completedCount: number;
  readonly projects: ReadonlyArray<TodayProject>;
}

/** Compares display names, such as a culture-aware and case-insensitive collator. */
export type CompareNames = (left: string, right: string) => number;

const compareIds = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

function groupBy<Key>(items: ReadonlyArray<TodayItem>, keyOf: (item: TodayItem) => Key) {
  const groups = new Map<Key, Array<TodayItem>>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()];
}

function rowState(item: TodayItem): TodayRowState {
  if (!item.isCompleted) {
    return "open";
  }
  return item.completedToday ? "completedToday" : "completedEarlier";
}

function buildRow(item: TodayItem, childrenOf: ReadonlyMap<string, TodayItem[]>): TodayRow {
  const children = (childrenOf.get(item.id) ?? []).map((child) => buildRow(child, childrenOf));
  const completedDescendants = children.reduce(
    (total, child) => total + child.completedDescendants + (child.item.completedToday ? 1 : 0),
    0,
  );
  return { item, state: rowState(item), completedDescendants, children };
}

/** The roots of one area's tree. An item whose parent is not listed is a root. */
function buildRows(items: ReadonlyArray<TodayItem>): ReadonlyArray<TodayRow> {
  const ordered = items.toSorted(
    (left, right) => left.sortOrder - right.sortOrder || compareIds(left.id, right.id),
  );
  const ids = new Set(ordered.map((item) => item.id));
  const childrenOf = new Map<string, TodayItem[]>();
  for (const item of ordered) {
    if (item.parentItemId !== null && ids.has(item.parentItemId)) {
      childrenOf.set(item.parentItemId, [...(childrenOf.get(item.parentItemId) ?? []), item]);
    }
  }
  return ordered
    .filter((item) => item.parentItemId === null || !ids.has(item.parentItemId))
    .map((item) => buildRow(item, childrenOf));
}

function buildAreas(items: ReadonlyArray<TodayItem>, compareNames: CompareNames) {
  const areas = groupBy(items, (item) => item.folderId).map((members) => ({
    folderId: members[0]!.folderId,
    path: members[0]!.areaPath,
    rows: buildRows(members),
  }));
  return areas.toSorted(
    (left, right) =>
      Number(left.folderId !== null) - Number(right.folderId !== null) ||
      compareNames(left.path, right.path) ||
      compareIds(left.folderId ?? "", right.folderId ?? ""),
  );
}

function buildProjects(items: ReadonlyArray<TodayItem>, compareNames: CompareNames) {
  const groups = groupBy(items, (item) => item.projectId).toSorted(
    ([left], [right]) =>
      left!.projectOrder - right!.projectOrder ||
      compareNames(left!.projectName, right!.projectName) ||
      compareIds(left!.projectId, right!.projectId),
  );
  return groups.map((members) => ({
    projectId: members[0]!.projectId,
    name: members[0]!.projectName,
    areas: buildAreas(members, compareNames),
  }));
}

/**
 * Arranges today's completions and their context ancestors for the Today page
 * (§7.14): projects in project order, ties by name; within a project the root
 * area first, then folders by breadcrumb; siblings in workspace order. Only
 * today's completions count towards the total.
 */
export function buildTodayTree(
  items: ReadonlyArray<TodayItem>,
  compareNames: CompareNames,
): TodayTree {
  return {
    completedCount: items.filter((item) => item.completedToday).length,
    projects: buildProjects(items, compareNames),
  };
}
