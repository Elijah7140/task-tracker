import { type TodayRow as WireTodayRow, TodayRpcs } from "@task-tracker/contracts";
import type { TodayRow, TodayTree } from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { TodayService } from "../services/today-service.js";
import { mapOperationError } from "./map-operation-error.js";

function projectRow({ item, state, completedDescendants, children }: TodayRow): WireTodayRow {
  return {
    itemId: item.id,
    projectId: item.projectId,
    folderId: item.folderId,
    title: item.title,
    state,
    completedDescendants,
    hasDates: item.hasDates,
    statusId: item.statusId,
    statusName: item.statusName,
    priorityLevelId: item.priorityLevelId,
    children: children.map(projectRow),
  };
}

function projectToday({ day, completedCount, projects }: TodayTree & { day: Temporal.PlainDate }) {
  return {
    day: day.toString(),
    completedCount,
    projects: projects.map(({ projectId, name, areas }) => ({
      projectId,
      name,
      areas: areas.map(({ folderId, path, rows }) => ({
        folderId,
        path,
        rows: rows.map(projectRow),
      })),
    })),
  };
}

/** Bind the Today RPC to the transactional Today service in the server's zone (§7.14). */
export const todayRpcHandlers = (timeZone: string) =>
  TodayRpcs.toLayer(
    Effect.gen(function* () {
      const today = yield* TodayService;
      return {
        LoadToday: () => today.load.pipe(Effect.map(projectToday), mapOperationError),
      };
    }),
  ).pipe(Layer.provide(TodayService.layer(timeZone)));
