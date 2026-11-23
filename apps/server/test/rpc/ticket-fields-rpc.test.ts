import { expect, it } from "@effect/vitest";
import { Effect, type Scope } from "effect";
import { FetchHttpClient } from "effect/http";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { makeRpcClient } from "../../../web/src/rpc-client.js";
import { LoopbackRpc, loopbackRpcLayer } from "../../src/rpc/loopback-rpc.js";
import { ProjectService } from "../../src/services/project-service.js";
import type { UndoService } from "../../src/services/undo-service.js";
import { withSchema } from "../db/store.js";

const timeZone = "America/New_York";
const rendererOrigin = "http://127.0.0.1:5173";
const createdAtUtc = "2026-11-13T12:00:00Z";
const rendererFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("Origin", rendererOrigin);
  return fetch(input, { ...init, headers });
};

const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Temporal.Instant.from(createdAtUtc).epochMilliseconds);
  const project = yield* Effect.flatMap(ProjectService, (projects) =>
    projects.create("Project"),
  ).pipe(Effect.provide(ProjectService.layer(timeZone)));
  const connection = yield* LoopbackRpc;
  const client = yield* makeRpcClient(connection);
  const area = { projectId: project.id.toLowerCase(), folderId: null };
  return { client, area, projectId: project.id };
});

const withItemRpc = <A, E>(
  test: Effect.Effect<A, E, SqlClient.SqlClient | Scope.Scope | LoopbackRpc | UndoService>,
) =>
  withSchema(
    // Pin the clock before the reminder scheduler starts with the server.
    Effect.andThen(
      TestClock.setTime(Temporal.Instant.from(createdAtUtc).epochMilliseconds),
      Effect.scoped(
        test.pipe(
          Effect.provide(loopbackRpcLayer({ rendererOrigin, timeZone })),
          Effect.provideService(FetchHttpClient.Fetch, rendererFetch),
        ),
      ),
    ),
  );

const fields = {
  title: "Employee training conversion data is not correct",
  description: "Going to use a manual sheet import.",
  ticketNumber: "385405",
  itemTypeId: null,
  priorityLevelId: null,
  dueDate: "2026-11-27",
  dueTime: null,
};

const noTicketFields = {
  requestorId: null,
  applicationId: null,
  moduleId: null,
  interfaceId: null,
  dispatchedToId: null,
  pendingPersonId: null,
  ticketTypeId: null,
};

it.effect("Adds a ticket with list entries, reads it back and logs a comment over RPC", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area } = yield* setup;
      const app = yield* client.AddTicketListEntry({
        listKind: "Application",
        parentId: null,
        name: "ClockTower",
      });
      const module = yield* client.AddTicketListEntry({
        listKind: "Module",
        parentId: app.id,
        name: "Train",
      });

      const ticket = yield* client.AddItem({
        ...area,
        parentItemId: null,
        kind: "Ticket",
        fields,
        ticket: { ...noTicketFields, moduleId: module.id },
      });
      const comment = yield* client.AddTicketComment({
        itemId: ticket.id,
        body: "Expecting next week.",
      });
      const loaded = yield* client.LoadTicket({ itemId: ticket.id });
      const lists = yield* client.ListTicketListEntries();

      expect(ticket).toMatchObject({
        kind: "Ticket",
        ticketNumber: "385405",
        dueDate: "2026-11-27",
      });
      expect(loaded).toEqual({
        itemId: ticket.id,
        detail: {
          ...noTicketFields,
          applicationId: app.id,
          moduleId: module.id,
        },
        comments: [comment],
      });
      expect(comment.createdAtUtc).toBe("2026-11-13T12:00:00Z");
      expect(lists.map((entry) => entry.name)).toEqual(["ClockTower", "Train"]);
    }),
  ),
);

it.effect("Reports a ticket without a number as a rule violation and sets a project icon", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area, projectId } = yield* setup;

      const failure = yield* Effect.flip(
        client.AddItem({
          ...area,
          parentItemId: null,
          kind: "Ticket",
          fields: { ...fields, ticketNumber: null },
        }),
      );
      yield* client.SetProjectIcon({ projectId: area.projectId, iconKey: "database" });
      const [summary] = yield* client.ListProjects();

      expect(failure).toMatchObject({
        _tag: "RuleViolation",
        message: "A ticket needs a ticket number.",
      });
      expect(summary?.project).toMatchObject({ id: projectId, iconKey: "database" });
    }),
  ),
);

it.effect("Adds a batch of tickets and names the refused ticket of a batch over RPC", () =>
  withItemRpc(
    Effect.gen(function* () {
      const { client, area } = yield* setup;

      const added = yield* client.AddTickets({
        ...area,
        tickets: [
          { fields, ticket: noTicketFields },
          { fields: { ...fields, ticketNumber: "385406", title: "Badge reader offline" } },
        ],
      });
      const refused = yield* Effect.flip(
        client.AddTickets({
          ...area,
          tickets: [{ fields }, { fields: { ...fields, ticketNumber: null } }],
        }),
      );
      const history = yield* client.GetHistory();
      const loaded = yield* client.LoadArea(area);

      expect(added.map((item) => [item.kind, item.ticketNumber])).toEqual([
        ["Ticket", "385405"],
        ["Ticket", "385406"],
      ]);
      expect(refused).toMatchObject({
        _tag: "TicketRejected",
        index: 1,
        message: "A ticket needs a ticket number.",
      });
      expect(history.undo).toBe("Create 2 tickets");
      expect(loaded.items.open).toHaveLength(2);
    }),
  ),
);
