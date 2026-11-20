import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

it.effect(
  "Loads today's completions in the server zone with context and rolls over at midnight",
  () =>
    withRendererRpc(
      Effect.gen(function* () {
        const client = yield* connectRenderer;
        const project = yield* client.CreateProject({ name: "Billing DB" });
        const folder = yield* client.CreateFolder({
          projectId: project.id,
          parentFolderId: null,
          name: "dbo",
        });
        const create = (title: string, parentItemId: string | null) =>
          client.CreateItem({ projectId: project.id, folderId: folder.id, parentItemId, title });
        const root = yield* create("Prepare release", null);
        const notes = yield* create("Write release notes", root.id);
        yield* create("Deploy to production", root.id);
        yield* client.SetItemCompleted({
          projectId: project.id,
          folderId: folder.id,
          itemId: notes.id,
          completed: true,
        });

        const snapshot = yield* client.LoadToday();

        expect(snapshot.day).toBe("2026-11-13");
        expect(snapshot.completedCount).toBe(1);
        expect(snapshot.projects).toEqual([
          {
            projectId: project.id,
            name: "Billing DB",
            areas: [
              {
                folderId: folder.id,
                path: "Billing DB › dbo",
                rows: [
                  expect.objectContaining({
                    itemId: root.id,
                    state: "open",
                    completedDescendants: 1,
                    children: [
                      expect.objectContaining({
                        itemId: notes.id,
                        projectId: project.id,
                        folderId: folder.id,
                        title: "Write release notes",
                        state: "completedToday",
                        statusName: "Completed",
                        hasDates: false,
                        children: [],
                      }),
                    ],
                  }),
                ],
              },
            ],
          },
        ]);

        // 12:00 UTC is 07:00 in New York, so local midnight is 17 hours away.
        yield* TestClock.adjust("17 hours");
        const tomorrow = yield* client.LoadToday();

        expect(tomorrow).toEqual({ day: "2026-11-14", completedCount: 0, projects: [] });
      }),
    ),
);
