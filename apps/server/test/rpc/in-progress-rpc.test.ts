import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { connectRenderer, withRendererRpc } from "./support/renderer-rpc.js";

const TESTING_STATUS_ID = "019A0000-0000-7000-8000-000000000203";

it.effect("Lists items whose status is marked In progress over RPC", () =>
  withRendererRpc(
    Effect.gen(function* () {
      const client = yield* connectRenderer;
      const project = yield* client.CreateProject({ name: "Release" });
      const item = yield* client.CreateItem({
        projectId: project.id,
        folderId: null,
        parentItemId: null,
        title: "Review release notes",
      });
      const before = yield* client.LoadInProgressItems();

      yield* client.SetStatusInProgress({ id: TESTING_STATUS_ID, isInProgress: true });
      yield* client.EditItem({
        itemId: item.id,
        fields: {
          title: item.title,
          description: null,
          ticketNumber: null,
          itemTypeId: null,
          priorityLevelId: null,
          dueDate: null,
          dueTime: null,
          statusId: TESTING_STATUS_ID,
        },
      });

      expect(before).toEqual([]);
      expect(yield* client.LoadInProgressItems()).toEqual([
        {
          itemId: item.id,
          projectId: project.id,
          folderId: null,
          itemKind: "Todo",
          ticketNumber: null,
          title: "Review release notes",
          areaPath: "Release",
          statusName: "Testing",
          priorityName: null,
          dueDate: null,
          dueTime: null,
          urgency: "None",
        },
      ]);
    }),
  ),
);
