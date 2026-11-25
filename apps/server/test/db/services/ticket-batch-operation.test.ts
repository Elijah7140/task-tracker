import { expect, it } from "@effect/vitest";
import {
  builtInPriorityLevels,
  EntityMissing,
  type ItemEdit,
  type TicketDetailInput,
} from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { FolderService } from "../../../src/services/folder-service.js";
import { ItemService } from "../../../src/services/item-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { TicketBatchRejection } from "../../../src/services/ticket-batch-operation.js";
import { TicketListService } from "../../../src/services/ticket-list-service.js";
import { withSchema } from "./fixtures.js";
import { roundTrip, snapshotTables } from "./undo-round-trip.js";

/** `ItemService.addTickets`, the tray's multi-ticket add (§7.20). */

const highId = builtInPriorityLevels[1].id;
const missingProjectId = "019A0000-0000-7000-8000-0000000009FF";

const services = Layer.mergeAll(
  ProjectService.layer("UTC"),
  FolderService.layer,
  ItemService.layer("UTC"),
  TicketListService.layer,
);

const fields = (ticketNumber: string, title: string, overrides: Partial<ItemEdit> = {}) => ({
  title,
  description: null,
  ticketNumber,
  priorityLevelId: null,
  dueDate: null,
  dueTime: null,
  ...overrides,
});

const noTicketFields: TicketDetailInput = {
  requestorId: null,
  applicationId: null,
  moduleId: null,
  interfaceId: null,
  dispatchedToId: null,
  pendingPersonId: null,
  ticketTypeId: null,
  parentTicketNumber: null,
};

const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Temporal.Instant.from("2026-11-21T12:00:00Z").epochMilliseconds);
  const projects = yield* ProjectService;
  const items = yield* ItemService;
  const lists = yield* TicketListService;
  const project = yield* projects.create("ClockTower");
  const app = yield* lists.add("Application", null, "ClockTower");
  const module = yield* lists.add("Module", app.id, "Train");
  const iface = yield* lists.add("Interface", module.id, "Conversion");
  const person = yield* lists.add("Person", null, "Elijah Harris");
  return { project, items, lists, app, module, iface, person };
});

type Tables = ReadonlyArray<ReadonlyArray<Readonly<Record<string, unknown>>>>;

/** Each table's rows by key, since a redo may insert them in another rowid order. */
const byKey = (tables: Tables) =>
  tables.map((rows) =>
    rows.toSorted((left, right) =>
      String(left["Id"] ?? left["ItemId"]).localeCompare(String(right["Id"] ?? right["ItemId"])),
    ),
  );

/** The saved tickets in tree order, with the columns the batch writes. */
const readTickets = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    sql`SELECT item.Title, item.TicketNumber, item.ItemKind, item.ParentItemId, item.FolderId,
          item.TicketRank, item.PriorityLevelId, detail.InterfaceId, detail.DispatchedToId
        FROM TodoItem AS item LEFT JOIN TicketDetail AS detail ON detail.ItemId = item.Id
        ORDER BY item.SortOrder`,
  );
});

it.effect("Adds tickets in order to the area's top level as one undo step", () =>
  withSchema(
    Effect.gen(function* () {
      const { project, items, iface, person } = yield* setup;
      const add = items.addTickets({
        projectId: project.id,
        folderId: null,
        tickets: [
          {
            fields: fields("385405", "Training data is wrong"),
            ticket: { ...noTicketFields, interfaceId: iface.id, dispatchedToId: person.id },
          },
          { fields: fields("385406", "Badge reader offline"), ticket: null },
        ],
      });

      const { label, after, undone, redone } = yield* roundTrip(add, ["TodoItem", "TicketDetail"]);
      const saved = yield* readTickets;

      expect(label).toBe("Create 2 tickets");
      expect(saved).toEqual([
        {
          Title: "Training data is wrong",
          TicketNumber: "385405",
          ItemKind: "Ticket",
          ParentItemId: null,
          FolderId: null,
          TicketRank: 0,
          PriorityLevelId: null,
          InterfaceId: iface.id,
          DispatchedToId: person.id,
        },
        {
          Title: "Badge reader offline",
          TicketNumber: "385406",
          ItemKind: "Ticket",
          ParentItemId: null,
          FolderId: null,
          TicketRank: 1,
          PriorityLevelId: null,
          InterfaceId: null,
          DispatchedToId: null,
        },
      ]);
      expect(undone).toEqual([[], []]);
      expect(byKey(redone)).toEqual(byKey(after));
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Names a single ticket in the undo label and adds it to a folder", () =>
  withSchema(
    Effect.gen(function* () {
      const { project, items } = yield* setup;
      const folder = yield* Effect.flatMap(FolderService, (folders) =>
        folders.create(project.id, null, "Plant"),
      );

      const { label } = yield* roundTrip(
        items.addTickets({
          projectId: project.id,
          folderId: folder.id,
          tickets: [
            { fields: fields("7", "Replace scanner", { priorityLevelId: highId }), ticket: null },
          ],
        }),
        ["TodoItem"],
      );
      const [saved] = yield* readTickets;

      expect(label).toBe("Create 'Replace scanner'");
      expect(saved).toMatchObject({ FolderId: folder.id, PriorityLevelId: highId });
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Saves nothing and names the ticket when a rule refuses one of the batch", () =>
  withSchema(
    Effect.gen(function* () {
      const { project, items, lists, iface } = yield* setup;
      yield* lists.archive(iface.id);
      const before = yield* snapshotTables(["TodoItem", "TicketDetail"]);

      const archived = yield* Effect.flip(
        items.addTickets({
          projectId: project.id,
          folderId: null,
          tickets: [
            { fields: fields("1", "First"), ticket: null },
            { fields: fields("2", "Second"), ticket: { ...noTicketFields, interfaceId: iface.id } },
          ],
        }),
      );
      const unnumbered = yield* Effect.flip(
        items.addTickets({
          projectId: project.id,
          folderId: null,
          tickets: [{ fields: fields(" ", "No number"), ticket: null }],
        }),
      );

      expect(archived).toBeInstanceOf(TicketBatchRejection);
      expect(archived).toMatchObject({ index: 1, message: "Interface 'Conversion' is archived." });
      expect(unnumbered).toMatchObject({ index: 0, message: "A ticket needs a ticket number." });
      expect(yield* snapshotTables(["TodoItem", "TicketDetail"])).toEqual(before);
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Refuses an empty batch and reports a missing project as missing", () =>
  withSchema(
    Effect.gen(function* () {
      const { project, items } = yield* setup;

      const empty = yield* Effect.flip(
        items.addTickets({ projectId: project.id, folderId: null, tickets: [] }),
      );
      const missing = yield* Effect.flip(
        items.addTickets({
          projectId: missingProjectId,
          folderId: null,
          tickets: [{ fields: fields("1", "Lost"), ticket: null }],
        }),
      );

      expect(empty.message).toBe("Add at least one ticket.");
      expect(empty).not.toBeInstanceOf(TicketBatchRejection);
      expect(missing).toBeInstanceOf(EntityMissing);
    }).pipe(Effect.provide(services)),
  ),
);
