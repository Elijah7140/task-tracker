import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { parseJson } from "./transfer-json.js";
import { projectId } from "./transfer-rows.js";
import { emptyWorld, readRows, type TransferWorld } from "./transfer-world.js";

/** Tickets, ticket lists and project icons in JSON and CSV transfer (§7.19). */

const APP = "019A0000-0000-7000-8000-0000000E0001";
const MODULE = "019A0000-0000-7000-8000-0000000E0002";
const PERSON = "019A0000-0000-7000-8000-0000000E0003";

const ticketFile = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: "task-tracker",
    version: 1,
    // Item types were removed on 25 Nov 2026 (§12); an older file's list is ignored.
    itemTypes: [
      {
        id: "019A0000-0000-7000-8000-000000000001",
        name: "Change",
        isBuiltIn: true,
        isArchived: false,
        sortOrder: 0,
      },
    ],
    ticketLists: [
      {
        id: APP,
        listKind: "Application",
        parentId: null,
        name: "ClockTower",
        isArchived: false,
        sortOrder: 0,
      },
      {
        id: MODULE,
        listKind: "Module",
        parentId: APP,
        name: "Train",
        isArchived: false,
        sortOrder: 0,
      },
      {
        id: PERSON,
        listKind: "Person",
        parentId: null,
        name: "Harris, Elijah",
        isArchived: false,
        sortOrder: 0,
      },
    ],
    projects: [
      {
        id: "019A0000-0000-7000-8000-0000000AC001",
        name: "ClockTower",
        iconKey: "database",
        items: [
          {
            id: "019A0000-0000-7000-8000-0000000AC101",
            title: "Training data",
            description: "Qualifications are missing.",
            notes: "Asked HR for the sheet.",
            ticketNumber: "385405",
            kind: "Ticket",
            ticket: {
              applicationId: APP,
              moduleId: MODULE,
              dispatchedToId: PERSON,
              parentTicketNumber: " 385400 ",
              showDetailOnCard: false,
              // Fields removed on 23 Nov 2026, which older files still carry and import ignores.
              version: "1.0.0",
              estimatedHours: 16,
              percentComplete: 50,
              isUrgent: true,
              isSystemOutage: false,
            },
            itemTypeId: "019A0000-0000-7000-8000-000000000001",
            itemType: "Change",
            // Comments were removed on 25 Nov 2026 (§12); an older file's are ignored.
            comments: [
              {
                body: "Expecting to get onto this next week.",
                createdAtUtc: "2026-11-19T12:32:26Z",
              },
            ],
          },
          {
            id: "019A0000-0000-7000-8000-0000000AC102",
            title: "Plain ToDo",
            description: "Older files keep a ToDo's notes here.",
          },
        ],
        ...overrides,
      },
    ],
  });

interface TicketRow {
  readonly ItemKind: string;
  readonly Description: string | null;
  readonly Notes: string | null;
  readonly TicketNumber: string | null;
  readonly Module: string | null;
  readonly Application: string | null;
  readonly DispatchedTo: string | null;
  readonly ParentTicketNumber: string | null;
}

const readTickets = (world: TransferWorld, project: string) =>
  readRows<TicketRow & { readonly Title: string }>(
    world,
    `SELECT item.Title, item.ItemKind, item.Description, item.Notes, item.TicketNumber,
        (SELECT Name FROM TicketListEntry WHERE Id = detail.ModuleId) AS Module,
        (SELECT Name FROM TicketListEntry WHERE Id = detail.ApplicationId) AS Application,
        (SELECT Name FROM TicketListEntry WHERE Id = detail.DispatchedToId) AS DispatchedTo,
        detail.ParentTicketNumber
      FROM TodoItem AS item LEFT JOIN TicketDetail AS detail ON detail.ItemId = item.Id
      WHERE item.ProjectId = ? ORDER BY item.Title`,
    project,
  );

const readCardChoices = (world: TransferWorld, project: string) =>
  readRows<{ readonly ShowDetailOnCard: number | null }>(
    world,
    `SELECT detail.ShowDetailOnCard FROM TicketDetail AS detail
      JOIN TodoItem AS item ON item.Id = detail.ItemId WHERE item.ProjectId = ?`,
    project,
  );

const expectedTickets = [
  {
    Title: "Plain ToDo",
    ItemKind: "Todo",
    Description: null,
    Notes: "Older files keep a ToDo's notes here.",
    TicketNumber: null,
    Module: null,
    Application: null,
    DispatchedTo: null,
    ParentTicketNumber: null,
  },
  {
    Title: "Training data",
    ItemKind: "Ticket",
    Description: "Qualifications are missing.",
    Notes: "Asked HR for the sheet.",
    TicketNumber: "385405",
    Module: "Train",
    Application: "ClockTower",
    DispatchedTo: "Harris, Elijah",
    ParentTicketNumber: "385400",
  },
];

describe("Ticket transfer", () => {
  it.effect(
    "Imports tickets, lists and the icon, ignores comments and types, and round-trips them",
    () =>
      emptyWorld((world) =>
        Effect.gen(function* () {
          const first = yield* world.importJson(ticketFile());
          const original = yield* projectId(world, "ClockTower");
          const exported = yield* world.exportJson({ kind: "project", projectId: original });
          const second = yield* world.importJson(exported);
          const copy = yield* projectId(world, "ClockTower (imported)");

          expect(first.kind).toBe("imported");
          expect(second.kind).toBe("imported");
          for (const project of [original, copy]) {
            expect(yield* readTickets(world, project)).toEqual(expectedTickets);
            expect(yield* readCardChoices(world, project)).toEqual([{ ShowDetailOnCard: 0 }]);
          }
          const icons = yield* readRows<{ IconKey: string | null }>(
            world,
            "SELECT IconKey FROM Project ORDER BY SortOrder",
          );
          expect(icons).toEqual([{ IconKey: "database" }, { IconKey: "database" }]);
          const entries = yield* readRows<{ Count: number }>(
            world,
            "SELECT count(*) AS Count FROM TicketListEntry",
          );
          expect(entries).toEqual([{ Count: 3 }]);
        }),
      ),
  );

  it.effect("Restores legacy parent ticket numbers and preserves blanks in newer exports", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const parentId = "019A0000-0000-7000-8000-0000000AC101";
        const legacy = ticketFile({
          items: [
            { id: parentId, title: "Parent", kind: "Ticket", ticketNumber: "385400" },
            {
              id: "019A0000-0000-7000-8000-0000000AC102",
              parentItemId: parentId,
              title: "Child",
              kind: "Ticket",
              ticketNumber: "385405",
            },
          ],
        });
        const current = legacy.replace('"itemTypes":', '"ignoredItemTypes":');

        yield* world.importJson(legacy);
        yield* world.importJson(current);
        const legacyProject = yield* projectId(world, "ClockTower");
        const currentProject = yield* projectId(world, "ClockTower (imported)");

        const legacyRows = yield* readTickets(world, legacyProject);
        const currentRows = yield* readTickets(world, currentProject);
        expect(legacyRows[0]).toMatchObject({ Title: "Child", ParentTicketNumber: "385400" });
        expect(currentRows[0]).toMatchObject({ Title: "Child", ParentTicketNumber: null });
      }),
    ),
  );

  it.effect("Writes ticket members only for tickets, so a ToDo keeps its earlier form", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        yield* world.importJson(ticketFile());
        const project = yield* projectId(world, "ClockTower");

        const document = parseJson(
          yield* world.exportJson({ kind: "project", projectId: project }),
        ) as {
          projects: { iconKey: string; items: Record<string, unknown>[] }[];
          ticketLists: unknown[];
        };
        const [ticket, todo] = document.projects[0]!.items.toSorted((left, right) =>
          String(left["title"]).localeCompare(String(right["title"])),
        ).reverse();

        expect(document.projects[0]!.iconKey).toBe("database");
        expect(document.ticketLists).toHaveLength(3);
        expect(ticket).toMatchObject({
          description: "Qualifications are missing.",
          notes: "Asked HR for the sheet.",
          kind: "Ticket",
          ticket: { dispatchedToId: expect.any(String) },
        });
        expect(todo).toMatchObject({ description: "Older files keep a ToDo's notes here." });
        expect(Object.keys(todo!)).not.toContain("notes");
        expect(Object.keys(ticket!["ticket"] as object)).not.toContain("version");
        expect(ticket!["ticket"]).toMatchObject({
          parentTicketNumber: "385400",
          showDetailOnCard: false,
        });
        expect(Object.keys(ticket!)).not.toContain("comments");
        expect(Object.keys(ticket!)).not.toContain("itemType");
        expect(Object.keys(todo!)).not.toContain("kind");
        expect(Object.keys(todo!)).not.toContain("ticket");
      }),
    ),
  );

  it.effect("Refuses a ticket without a number and a reference to a missing list entry", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        const file = JSON.parse(ticketFile()) as {
          projects: { items: Record<string, unknown>[] }[];
        };
        const ticket = file.projects[0]!.items[0]!;
        ticket["ticketNumber"] = null;
        (ticket["ticket"] as Record<string, unknown>)["requestorId"] =
          "019A0000-0000-7000-8000-00000000FFFF";

        const result = yield* world.importJson(JSON.stringify(file));

        expect(result.kind).toBe("refused");
        const messages =
          result.kind === "refused" ? result.issues.map((issue) => issue.message) : [];
        expect(messages).toContain("A ticket needs a ticket number.");
        expect(messages.some((message) => message.includes("is not a Person entry"))).toBe(true);
      }),
    ),
  );

  it.effect("Exports tickets to CSV with Kind and ticket columns and imports them back", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        yield* world.importJson(ticketFile());
        const project = yield* projectId(world, "ClockTower");
        const csv = yield* world.exportProjectCsv(project);
        yield* world.importJson(
          JSON.stringify({
            format: "task-tracker",
            version: 1,
            projects: [{ id: "019A0000-0000-7000-8000-0000000AC009", name: "Target" }],
          }),
        );
        const target = yield* projectId(world, "Target");

        const result = yield* world.importCsv(csv, target);

        const header = csv.split("\r\n")[0]!;
        expect(header).toContain("Kind,Requestor,Application,Module,Interface,Dispatched to");
        expect(header).toContain("Ticket type,Parent ticket,Ticket notes");
        expect(result.kind).toBe("imported");
        expect(yield* readTickets(world, target)).toEqual(expectedTickets);
      }),
    ),
  );

  it.effect("Keeps the CSV header unchanged when an export holds no tickets", () =>
    emptyWorld((world) =>
      Effect.gen(function* () {
        yield* world.importJson(
          JSON.stringify({
            format: "task-tracker",
            version: 1,
            projects: [
              {
                id: "019A0000-0000-7000-8000-0000000AC009",
                name: "Plain",
                items: [{ id: "019A0000-0000-7000-8000-0000000AC109", title: "Task" }],
              },
            ],
          }),
        );
        const project = yield* projectId(world, "Plain");

        const csv = yield* world.exportProjectCsv(project);

        expect(csv).not.toContain("Kind");
      }),
    ),
  );
});
