import { expect, it } from "@effect/vitest";
import type { TicketDetailInput } from "@task-tracker/core";
import { Effect } from "effect";
import { TicketListService } from "../../../src/services/ticket-list-service.js";
import {
  editFields,
  filter,
  query,
  sortedTitles,
  text,
  withSearchServices,
  type SearchServices,
} from "./search-fixtures.js";

/** Searching by item kind and the fixed ticket fields (§7.19). */

const noTicketFields: TicketDetailInput = {
  requestorId: null,
  applicationId: null,
  moduleId: null,
  interfaceId: null,
  dispatchedToId: null,
  pendingPersonId: null,
  ticketTypeId: null,
};

const seed = (svc: SearchServices) =>
  Effect.gen(function* () {
    const lists = yield* TicketListService;
    const project = yield* svc.projects.create("ClockTower");
    const app = yield* lists.add("Application", null, "ClockTower");
    const train = yield* lists.add("Module", app.id, "Train");
    const elijah = yield* lists.add("Person", null, "Harris, Elijah");
    const add = (title: string, ticketNumber: string, ticket: Partial<TicketDetailInput>) =>
      svc.items.add({
        projectId: project.id,
        folderId: null,
        parentItemId: null,
        kind: "Ticket",
        fields: editFields(title, { ticketNumber }),
        customValues: [],
        ticket: { ...noTicketFields, ...ticket },
      });
    const training = yield* add("Training data", "385405", {
      moduleId: train.id,
      dispatchedToId: elijah.id,
    });
    yield* add("Payroll export", "385500", {});
    yield* svc.items.create(project.id, null, null, "Plain ToDo");
    yield* svc.items.addComment(training.id, "Waiting on Wayne's discussion");
  }).pipe(Effect.provide(TicketListService.layer));

const titlesFor = (svc: SearchServices, filters: Parameters<typeof query>[0]) =>
  svc.search.search(query(filters)).pipe(Effect.map(sortedTitles));

it.effect("Finds tickets or ToDos by kind", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      yield* seed(svc);

      const tickets = yield* titlesFor(svc, [filter("kind", "equals", text("ticket"))]);
      const todos = yield* titlesFor(svc, [filter("kind", "equals", text("Todo"))]);

      expect(tickets).toEqual(["Payroll export", "Training data"]);
      expect(todos).toEqual(["Plain ToDo"]);
    }),
  ),
);

it.effect("Matches people and levels by name, and an implied application", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      yield* seed(svc);

      const dispatched = yield* titlesFor(svc, [filter("dispatched", "contains", text("elijah"))]);
      const module = yield* titlesFor(svc, [filter("module", "equals", text("train"))]);
      const application = yield* titlesFor(svc, [
        filter("application", "equals", text("ClockTower")),
      ]);
      const noModule = yield* titlesFor(svc, [filter("module", "isEmpty", null)]);

      expect(dispatched).toEqual(["Training data"]);
      expect(module).toEqual(["Training data"]);
      expect(application).toEqual(["Training data"]);
      expect(noModule).toEqual(["Payroll export", "Plain ToDo"]);
    }),
  ),
);

it.effect("Matches ticket comments", () =>
  withSearchServices((svc) =>
    Effect.gen(function* () {
      yield* seed(svc);

      const commented = yield* titlesFor(svc, [filter("comment", "contains", text("wayne"))]);

      expect(commented).toEqual(["Training data"]);
    }),
  ),
);
