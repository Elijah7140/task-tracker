import {
  RuleViolation,
  type TodayRow as TodayRowSchema,
  type TodaySnapshot,
} from "@task-tracker/contracts";
import { Effect } from "effect";
import type { FakeItemNode } from "./fake-area-items.js";
import type { FakeProjectStore } from "./fake-task-tracker-server.js";

type TodayRow = typeof TodayRowSchema.Type;
type Area = (typeof TodaySnapshot.Type)["projects"][number]["areas"][number];

/** The server's local day and failure state for Today tests. The fake server's zone is UTC. */
export class FakeToday {
  /** The local date `LoadToday` reports. Completions on this UTC date count as today's. */
  day = "2026-11-13";
  /** A simulated load failure message for `LoadToday`. */
  loadFailure: string | null = null;
}

function rowState(item: FakeItemNode["item"], day: string): TodayRow["state"] {
  if (item.completedAtUtc === null) {
    return "open";
  }
  return item.completedAtUtc.startsWith(day) ? "completedToday" : "completedEarlier";
}

/** A node with today's completions in its subtree, or null when nothing below it counts. */
function todayRow(
  node: FakeItemNode,
  day: string,
  statusName: (id: string | null) => string | null,
): TodayRow | null {
  const children: Array<TodayRow> = node.children
    .filter(({ item }) => item.deletedAtUtc === null)
    .flatMap((child) => todayRow(child, day, statusName) ?? []);
  const state = rowState(node.item, day);
  if (state !== "completedToday" && children.length === 0) {
    return null;
  }
  const { item } = node;
  return {
    itemId: item.id,
    projectId: item.projectId,
    folderId: item.folderId,
    title: item.title,
    state,
    completedDescendants: children.reduce(
      (total, child) =>
        total + child.completedDescendants + Number(child.state === "completedToday"),
      0,
    ),
    hasDates: item.dueDate !== null || item.scheduledStart !== null,
    statusId: item.statusId,
    statusName: statusName(item.statusId),
    priorityLevelId: item.priorityLevelId,
    children,
  };
}

function countToday(rows: ReadonlyArray<TodayRow>): number {
  return rows.reduce(
    (total, row) => total + Number(row.state === "completedToday") + countToday(row.children),
    0,
  );
}

/** The project name and folder breadcrumb of an area, such as "Billing DB › dbo". */
function areaPath(store: FakeProjectStore, projectName: string, folderId: string | null): string {
  const names: Array<string> = [];
  for (let id = folderId; id !== null;) {
    const folder = store.folders.find((candidate) => candidate.id === id);
    names.unshift(folder?.name ?? "");
    id = folder?.parentFolderId ?? null;
  }
  return [projectName, ...names].join(" › ");
}

function projectAreas(store: FakeProjectStore, projectId: string, projectName: string) {
  const statusName = (id: string | null) =>
    store.statuses.ordered().find((status) => status.id === id)?.name ?? null;
  const folderIds = [
    null,
    ...store.folders.filter((f) => f.projectId === projectId).map((f) => f.id),
  ];
  return folderIds.flatMap((folderId): Array<Area> => {
    const nodes = Effect.runSync(Effect.option(store.requireArea(projectId, folderId)));
    const rows =
      nodes._tag === "None"
        ? []
        : nodes.value.nodes
            .filter(({ item }) => item.deletedAtUtc === null)
            .flatMap((node) => todayRow(node, store.today.day, statusName) ?? []);
    return rows.length === 0
      ? []
      : [{ folderId, path: areaPath(store, projectName, folderId), rows }];
  });
}

/** Fake `LoadToday`: today's completions with context ancestors, in project and area order. */
export function todayHandlers(store: FakeProjectStore) {
  return {
    LoadToday: () =>
      store.record("LoadToday").pipe(
        Effect.andThen(() => {
          if (store.today.loadFailure !== null) {
            return Effect.fail(new RuleViolation({ message: store.today.loadFailure }));
          }
          const projects = store.summaries
            .toSorted((left, right) => left.project.sortOrder - right.project.sortOrder)
            .map(({ project }) => ({
              projectId: project.id,
              name: project.name,
              areas: projectAreas(store, project.id, project.name),
            }))
            .filter((project) => project.areas.length > 0);
          const completedCount = projects
            .flatMap((project) => project.areas)
            .reduce((total, area) => total + countToday(area.rows), 0);
          return Effect.succeed({ day: store.today.day, completedCount, projects });
        }),
      ),
  };
}
