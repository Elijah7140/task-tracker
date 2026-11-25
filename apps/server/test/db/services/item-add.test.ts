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
import { SettingsService } from "../../../src/services/settings-service.js";
import { TicketListService } from "../../../src/services/ticket-list-service.js";
import { UndoService } from "../../../src/services/undo-service.js";
import { setAutoComplete, withSchema } from "./fixtures.js";
import { roundTrip, snapshotTables } from "./undo-round-trip.js";

/** `ItemService.add`, `edit` with ticket fields, `loadTicket` and the card's Detail (§7.19). */

const highId = builtInPriorityLevels[1].id;
const queuedStatusId = "019A0000-0000-7000-8000-000000000201";
const completedStatusId = "019A0000-0000-7000-8000-000000000204";

const services = Layer.mergeAll(
  ProjectService.layer("UTC"),
  ItemService.layer("UTC"),
  FieldService.layer,
  TicketListService.layer,
  SettingsService.layer,
);

const fields = (overrides: Partial<ItemEdit> = {}): ItemEdit => ({
  title: "Training data is wrong",
  description: null,
  ticketNumber: null,
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
            detail.ParentTicketNumber, detail.ShowDetailOnCard
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
        parentTicketNumber: " 385400 ",
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
          ParentTicketNumber: "385400",
          ShowDetailOnCard: null,
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
        { ...noTicketFields, requestorId: person.id, moduleId: module.id },
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
      expect(loaded).toMatchObject({ requestorId: person.id, moduleId: module.id });
      expect(refused.message).toBe("Dispatched to 'Elijah Harris' is archived.");
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Shows and hides a ticket's Detail on its card as labelled undo steps", () =>
  withSchema(
    Effect.gen(function* () {
      const { items, input } = yield* setup;
      const ticket = yield* items.add(
        input({ kind: "Ticket", fields: fields({ ticketNumber: "385405" }) }),
      );
      const todo = yield* items.add(input({ fields: fields({ title: "Plain" }) }));

      const hide = yield* roundTrip(items.setDetailOnCard(ticket.id, false), ["TicketDetail"]);
      const hidden = yield* items.loadTicket(ticket.id);
      const show = yield* roundTrip(items.setDetailOnCard(ticket.id, true), ["TicketDetail"]);
      yield* items.edit(ticket.id, fields({ ticketNumber: "385405" }), [], undefined, undefined, {
        ...noTicketFields,
        parentTicketNumber: "385400",
      });
      const afterEdit = yield* readTicketRow(ticket.id);
      const onTodo = yield* Effect.flip(items.setDetailOnCard(todo.id, true));

      expect(hide.label).toBe("Hide description of 'Training data is wrong'");
      expect(hidden.showDetailOnCard).toBe(false);
      expect(show.label).toBe("Show description of 'Training data is wrong'");
      expect(show.undone).toEqual(hide.after);
      expect(afterEdit[0]).toMatchObject({ ParentTicketNumber: "385400", ShowDetailOnCard: 1 });
      expect(onTodo.message).toBe("Only tickets have ticket fields.");
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Each card follows the setting unless its ticket chose otherwise", () =>
  withSchema(
    Effect.gen(function* () {
      const { project, items, input } = yield* setup;
      const shown = yield* items.add(
        input({ kind: "Ticket", fields: fields({ ticketNumber: "1", title: "Shown" }) }),
      );
      const hidden = yield* items.add(
        input({ kind: "Ticket", fields: fields({ ticketNumber: "2", title: "Hidden" }) }),
      );
      yield* items.add(input({ fields: fields({ title: "Plain" }) }));
      yield* items.setDetailOnCard(hidden.id, false);
      const readFlags = () =>
        items
          .loadArea(project.id, null)
          .pipe(
            Effect.map((area) =>
              area.items.open.map((node) => [node.item.title, node.showsDetailOnCard] as const),
            ),
          );

      const byDefault = yield* readFlags();
      const sql = yield* SqlClient.SqlClient;
      yield* sql.withTransaction(
        sql`INSERT INTO GlobalSetting (Key, Value) VALUES ('showTicketDetailOnCards', 'false')`,
      );
      yield* items.setDetailOnCard(shown.id, true);
      const settingOff = yield* readFlags();

      expect(byDefault).toEqual([
        ["Shown", true],
        ["Hidden", false],
        ["Plain", false],
      ]);
      expect(settingOff).toEqual([
        ["Shown", true],
        ["Hidden", false],
        ["Plain", false],
      ]);
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Finds an item by ticket number, a ticket first and then the latest", () =>
  withSchema(
    Effect.gen(function* () {
      const { project, items, input } = yield* setup;
      const sql = yield* SqlClient.SqlClient;
      const older = yield* items.add(
        input({ kind: "Ticket", fields: fields({ ticketNumber: "JIRA-9", title: "Older" }) }),
      );
      yield* TestClock.adjust("1 minute");
      const newer = yield* items.add(
        input({ kind: "Ticket", fields: fields({ ticketNumber: "JIRA-9", title: "Newer" }) }),
      );
      const legacy = yield* items.add(input({ fields: fields({ title: "Legacy" }) }));
      yield* sql.withTransaction(
        sql`UPDATE TodoItem SET TicketNumber = 'JIRA-7', UpdatedAtUtc = '2027-01-01 00:00:00'
          WHERE Id = ${legacy.id}`,
      );

      const found = yield* items.findTicketByNumber(" jira-9 ");
      const todoOnly = yield* items.findTicketByNumber("JIRA-7");
      yield* items.delete(project.id, null, newer.id);
      const afterDelete = yield* items.findTicketByNumber("JIRA-9");
      const missing = yield* items.findTicketByNumber("NOPE-1");

      expect(found).toEqual({
        itemId: newer.id,
        projectId: project.id,
        folderId: null,
        title: "Newer",
      });
      expect(todoOnly?.itemId).toBe(legacy.id);
      expect(afterDelete?.itemId).toBe(older.id);
      expect(missing).toBeNull();
    }).pipe(Effect.provide(services)),
  ),
);

/** Reads a stored item's status and completion through a fresh operation. */
const readCompletion = (id: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const [row] = yield* sql.withTransaction(
      sql<{ StatusId: string | null; Completed: number }>`
        SELECT StatusId, CompletedAtUtc IS NOT NULL AS Completed FROM TodoItem WHERE Id = ${id}`,
    );
    return row!;
  });

/** Adds a ticket under `parentItemId` with the given ToDo children, completing the chosen ones. */
const ticketWithChildren = Effect.fnUntraced(function* (
  { project, items, input }: Effect.Success<typeof setup>,
  children: readonly ("open" | "done")[],
  parentItemId: string | null = null,
) {
  const ticketFields = fields({ ticketNumber: "385405", statusId: queuedStatusId });
  const ticket = yield* items.add(
    input({ kind: "Ticket", parentItemId, fields: ticketFields, ticket: noTicketFields }),
  );
  const childIds: string[] = [];
  for (const [index, state] of children.entries()) {
    const child = yield* items.add(
      input({ parentItemId: ticket.id, fields: fields({ title: `Child ${index}` }) }),
    );
    if (state === "done") {
      yield* items.setCompleted(project.id, null, child.id, true);
    }
    childIds.push(child.id);
  }
  /** Saves the editor with only the status changed, as the ticket editor sends it. */
  const saveStatus = (statusId: string) =>
    items.edit(ticket.id, { ...ticketFields, statusId }, [], undefined, undefined, noTicketFields);
  return { ticket, childIds, saveStatus };
});

it.effect.each([
  ["no sub-items", []],
  ["an open sub-item", ["open"]],
  ["only completed sub-items", ["done", "done"]],
] as const)("Saving only a ticket's status completes and reopens it with %s", ([, children]) =>
  withSchema(
    Effect.gen(function* () {
      yield* setAutoComplete(true);
      const { ticket, childIds, saveStatus } = yield* ticketWithChildren(yield* setup, children);
      const childrenBefore = yield* Effect.forEach(childIds, readCompletion);

      const completed = yield* saveStatus(completedStatusId);
      const afterComplete = yield* readCompletion(ticket.id);
      const reopened = yield* saveStatus(queuedStatusId);

      expect(completed.kind).toBe("applied");
      expect(afterComplete).toEqual({ StatusId: completedStatusId, Completed: 1 });
      expect(reopened.kind).toBe("applied");
      expect(yield* readCompletion(ticket.id)).toEqual({ StatusId: queuedStatusId, Completed: 0 });
      expect(yield* Effect.forEach(childIds, readCompletion)).toEqual(childrenBefore);
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Completing a ticket's last sub-item leaves the ticket open with its status", () =>
  withSchema(
    Effect.gen(function* () {
      yield* setAutoComplete(true);
      const context = yield* setup;
      const { ticket, childIds } = yield* ticketWithChildren(context, ["done", "open"]);

      yield* context.items.setCompleted(context.project.id, null, childIds[1]!, true);

      expect(yield* readCompletion(ticket.id)).toEqual({ StatusId: queuedStatusId, Completed: 0 });
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("A ToDo above a ticket completes when the ticket's status is set to Done", () =>
  withSchema(
    Effect.gen(function* () {
      yield* setAutoComplete(true);
      const context = yield* setup;
      const parent = yield* context.items.add(
        context.input({ fields: fields({ title: "Parent" }) }),
      );
      const { ticket, saveStatus } = yield* ticketWithChildren(context, ["open"], parent.id);

      yield* saveStatus(completedStatusId);
      const parentDone = yield* readCompletion(parent.id);
      yield* saveStatus(queuedStatusId);

      expect(parentDone.Completed).toBe(1);
      expect((yield* readCompletion(parent.id)).Completed).toBe(0);
      expect((yield* readCompletion(ticket.id)).Completed).toBe(0);
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Undo and redo replay a ticket completed over an open sub-item", () =>
  withSchema(
    Effect.gen(function* () {
      yield* setAutoComplete(true);
      const undo = yield* UndoService;
      const { ticket, saveStatus } = yield* ticketWithChildren(yield* setup, ["open"]);
      yield* saveStatus(completedStatusId);

      yield* undo.apply("undo");
      const undone = yield* readCompletion(ticket.id);
      yield* undo.apply("redo");

      expect(undone).toEqual({ StatusId: queuedStatusId, Completed: 0 });
      expect(yield* readCompletion(ticket.id)).toEqual({
        StatusId: completedStatusId,
        Completed: 1,
      });
    }).pipe(Effect.provide(services)),
  ),
);

it.effect("Turning auto-complete on leaves ticket parents to their statuses", () =>
  withSchema(
    Effect.gen(function* () {
      yield* setAutoComplete(false);
      const settings = yield* SettingsService;
      const context = yield* setup;
      const finished = yield* ticketWithChildren(context, ["done"]);
      const completedOverOpen = yield* ticketWithChildren(context, ["open"]);
      yield* completedOverOpen.saveStatus(completedStatusId);

      const preview = yield* settings.previewGlobalAutoComplete();

      expect(preview).toMatchObject({ parentsToComplete: 0, parentsToReopen: 0 });
      expect(yield* readCompletion(finished.ticket.id)).toEqual({
        StatusId: queuedStatusId,
        Completed: 0,
      });
    }).pipe(Effect.provide(services)),
  ),
);
