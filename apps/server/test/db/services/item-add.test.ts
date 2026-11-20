import { expect, it } from "@effect/vitest";
import {
  builtInPriorityLevels,
  MetadataRuleError,
  type ItemEdit,
  type TicketDetailInput,
} from "@task-tracker/core";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { FieldService } from "../../../src/services/field-service.js";
import type { ItemAddInput } from "../../../src/services/item-add-operation.js";
import { ItemService } from "../../../src/services/item-service.js";
import { ProjectService } from "../../../src/services/project-service.js";
import { TicketListService } from "../../../src/services/ticket-list-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { setAutoComplete, withSchema } from "./fixtures.js";
import { roundTrip, snapshotTables } from "./undo-round-trip.js";

/** `ItemService.add`, `edit` with ticket fields, comments and `loadTicket` (§7.19). */

const highId = builtInPriorityLevels[1].id;
const queuedStatusId = "019A0000-0000-7000-8000-000000000201";
const completedStatusId = "019A0000-0000-7000-8000-000000000204";

const services = Layer.mergeAll(
  ProjectService.layer("UTC"),
  ItemService.layer("UTC"),
  FieldService.layer,
  TicketListService.layer,
);

const fields = (overrides: Partial<ItemEdit> = {}): ItemEdit => ({
  title: "Training data is wrong",
  description: null,
  ticketNumber: null,
  itemTypeId: null,
  priorityLevelId: null,
  dueDate: null,
  dueTime: null,
  scheduledStart: null,
  scheduledEnd: null,
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
  version: null,
  estimatedHours: null,
  percentComplete: null,
  isUrgent: false,
  isSystemOutage: false,
};

const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Temporal.Instant.from("2026-11-20T12:00:00Z").epochMilliseconds);
  const projects = yield* ProjectService;
  const items = yield* ItemService;
  const lists = yield* TicketListService;
  const project = yield* projects.create("ClockTower");
  const input = (overrides: Partial<ItemAddInput>): ItemAddInput => ({
    projectId: project.id,
    folderId: null,
    parentItemId: null,
    kind: "Todo",
    fields: fields(),
    customValues: [],
    ticket: null,
    ...overrides,
  });
  const app = yield* lists.add("Application", null, "ClockTower");
  const module = yield* lists.add("Module", app.id, "Train");
  const iface = yield* lists.add("Interface", module.id, "Conversion");
  const person = yield* lists.add("Person", null, "Elijah Harris");
  return { project, items, lists, input, app, module, iface, person };
});

const readTicketRow = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return yield* sql.withTransaction(
      sql`SELECT item.ItemKind, item.TicketNumber, item.TicketRank, item.StatusId,
            detail.ApplicationId, detail.ModuleId, detail.InterfaceId, detail.DispatchedToId,
            detail.EstimatedHours, detail.PercentComplete, detail.IsUrgent
          FROM TodoItem AS item LEFT JOIN TicketDetail AS detail ON detail.ItemId = item.Id
          WHERE item.Id = ${id}`,
    );
  });

it.effect("Adds a ticket with its fields, levels and rank as one undo step", () =>
  withSchema(
    Effect.gen(function* () {
      const { items, input, app, module, iface, person } = yield* setup;
      const ticketFields = {
        ...noTicketFields,
        interfaceId: iface.id,
        dispatchedToId: person.id,
        estimatedHours: 16,
        percentComplete: 50,
        isUrgent: true,
      };
      const add = items.add(
        input({
          kind: "Ticket",
          fields: fields({ ticketNumber: "385405", priorityLevelId: highId }),
          ticket: ticketFields,
        }),
      );

      const { label, after, undone, redone } = yield* roundTrip(add, ["TodoItem", "TicketDetail"]);
      const [ticket] = after[0]!;
      const saved = yield* readTicketRow(String(ticket!["Id"]));

      expect(label).toBe("Create 'Training data is wrong'");
      expect(saved).toEqual([
        {
          ItemKind: "Ticket",
          TicketNumber: "385405",
          TicketRank: 0,
          StatusId: null,
          ApplicationId: app.id,
          ModuleId: module.id,
          InterfaceId: iface.id,
          DispatchedToId: person.id,
          EstimatedHours: 16,
          PercentComplete: 50,
          IsUrgent: 1,
        },
      ]);
      expect(undone).toEqual([[], []]);
      expect(redone).toEqual(after);
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Adds a ToDo with an open status, due date and reminder under a parent", () =>
  withSchema(
    Effect.gen(function* () {
      const { items, input } = yield* setup;
      const parent = yield* items.add(input({ fields: fields({ title: "Parent" }) }));

      const child = yield* items.add(
        input({
          parentItemId: parent.id,
          fields: {
            ...fields({ title: "Call Melissa", dueDate: Temporal.PlainDate.from("2026-11-27") }),
            statusId: queuedStatusId,
            reminder: { kind: "offset", minutes: 30 },
          },
        }),
      );

      expect(child).toMatchObject({
        kind: "Todo",
        parentItemId: parent.id,
        statusId: queuedStatusId,
        reminder: { kind: "offset", minutes: 30 },
      });
      expect(child.dueDate?.toString()).toBe("2026-11-27");
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Adding an open child reopens a completed parent in the same step", () =>
  withSchema(
    Effect.gen(function* () {
      yield* setAutoComplete(true);
      const { project, items, input } = yield* setup;
      const parent = yield* items.add(input({ fields: fields({ title: "Parent" }) }));
      yield* items.setCompleted(project.id, null, parent.id, true);

      yield* items.add(
        input({ parentItemId: parent.id, kind: "Ticket", fields: fields({ ticketNumber: "1" }) }),
      );
      const area = yield* items.loadArea(project.id, null);

      expect(area.items.open[0]?.item).toMatchObject({ id: parent.id, completedAtUtc: null });
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Refuses a ticket without a number, a Done status and mixed-kind fields", () =>
  withSchema(
    Effect.gen(function* () {
      const { items, input } = yield* setup;
      const before = yield* snapshotTables(["TodoItem", "TicketDetail"]);

      const unnumbered = yield* Effect.flip(items.add(input({ kind: "Ticket" })));
      const done = yield* Effect.flip(
        items.add(input({ fields: { ...fields(), statusId: completedStatusId } })),
      );
      const ticketOnTodo = yield* Effect.flip(items.add(input({ ticket: noTicketFields })));
      const valuesOnTicket = yield* Effect.flip(
        items.add(
          input({
            kind: "Ticket",
            fields: fields({ ticketNumber: "1" }),
            customValues: [{ fieldDefinitionId: queuedStatusId, textValue: "x" }],
          }),
        ),
      );

      expect(
        [unnumbered, done, ticketOnTodo, valuesOnTicket].map((error) => error.message),
      ).toEqual([
        "A ticket needs a ticket number.",
        "Choose an open status when adding an item.",
        "Ticket fields apply to tickets only.",
        "Custom fields apply to ToDos only.",
      ]);
      expect(unnumbered).toBeInstanceOf(MetadataRuleError);
      expect(yield* snapshotTables(["TodoItem", "TicketDetail"])).toEqual(before);
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Edits a ticket's fields as one step and keeps an archived person already on it", () =>
  withSchema(
    Effect.gen(function* () {
      const { items, lists, input, person, module } = yield* setup;
      const ticket = yield* items.add(
        input({
          kind: "Ticket",
          fields: fields({ ticketNumber: "385405" }),
          ticket: { ...noTicketFields, requestorId: person.id },
        }),
      );
      yield* lists.archive(person.id);
      const edit = items.edit(
        ticket.id,
        fields({ ticketNumber: "385405" }),
        [],
        undefined,
        undefined,
        { ...noTicketFields, requestorId: person.id, moduleId: module.id, version: " 1.0.0 " },
      );

      const { label, undone, before } = yield* roundTrip(edit, ["TicketDetail"]);
      const loaded = yield* items.loadTicket(ticket.id);
      const refused = yield* Effect.flip(
        items.edit(ticket.id, fields({ ticketNumber: "385405" }), [], undefined, undefined, {
          ...noTicketFields,
          dispatchedToId: person.id,
        }),
      );

      expect(label).toBe("Edit 'Training data is wrong'");
      expect(undone).toEqual(before);
      expect(loaded.detail).toMatchObject({ moduleId: module.id, version: "1.0.0" });
      expect(refused.message).toBe("Dispatched to 'Elijah Harris' is archived.");
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Adds comments newest first and refuses comments and ticket fields on a ToDo", () =>
  withSchema(
    Effect.gen(function* () {
      const { items, input } = yield* setup;
      const ticket = yield* items.add(
        input({ kind: "Ticket", fields: fields({ ticketNumber: "385405" }) }),
      );
      const todo = yield* items.add(input({ fields: fields({ title: "Plain" }) }));

      yield* items.addComment(ticket.id, "Expecting to get onto this next week.");
      yield* TestClock.adjust("1 minute");
      yield* items.addComment(ticket.id, "  Pending Wayne's discussion.  ");
      const loaded = yield* items.loadTicket(ticket.id);
      const onTodo = yield* Effect.flip(items.addComment(todo.id, "Nope"));
      const blank = yield* Effect.flip(items.addComment(ticket.id, "   "));

      expect(loaded.comments.map((comment) => comment.body)).toEqual([
        "Pending Wayne's discussion.",
        "Expecting to get onto this next week.",
      ]);
      expect(onTodo.message).toBe("Only tickets have ticket fields.");
      expect(blank.message).toBe("A comment needs some text.");
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Undo refuses to remove a created ticket once it has a newer comment", () =>
  withSchema(
    Effect.gen(function* () {
      const { items, input } = yield* setup;
      const undo = yield* UndoService;
      const sql = yield* SqlClient.SqlClient;
      const ticket = yield* items.add(
        input({ kind: "Ticket", fields: fields({ ticketNumber: "385405" }) }),
      );
      yield* sql.withTransaction(
        sql`INSERT INTO TicketComment (Id, ItemId, Body, CreatedAtUtc)
          VALUES ('019A0000-0000-7000-8000-00000000C0DE', ${ticket.id}, 'Imported', '2026-11-20 12:00:00')`,
      );

      const refusal = yield* Effect.flip(undo.apply("undo"));
      const remaining = yield* snapshotTables(["TodoItem"]);

      expect(refusal.message).toBe(
        "Other data still depends on this item; can't undo its removal.",
      );
      expect(remaining[0]).toHaveLength(1);
    }).pipe(Effect.provide(services)),
  ),
);
