import { RuleViolation, type TicketBoard, type TicketPosition } from "@task-tracker/contracts";
import { Effect } from "effect";
import type { FakeItemNode } from "./fake-area-items.js";
import type { fakeHistory } from "./fake-history-handlers.js";
import type { FakeProjectStore } from "./fake-task-tracker-server.js";

type Item = FakeItemNode["item"];
type Position = typeof TicketPosition.Type;
type Track = ReturnType<typeof fakeHistory>["track"];

/** Ticket ranks and failures behind the Tickets view, which history captures with the items. */
export class FakeTickets {
  /** `TicketRank` by item ID. A missing entry is a legacy unranked ticket. */
  ranks = new Map<string, number>();
  /** Simulates a failed board load with this message. */
  loadFailure: string | null = null;
}

function collect(nodes: ReadonlyArray<FakeItemNode>): Array<Item> {
  return nodes.flatMap((node) => [node.item, ...collect(node.children)]);
}

/** Open, active numbered items in every active project, as the server lists them. */
function openTickets(store: FakeProjectStore): Array<Item> {
  const projects = new Set(store.summaries.map(({ project }) => project.id));
  const folders = new Set(store.folders.map(({ id }) => id));
  return collect(store.allAreas().flatMap((area) => area.nodes)).filter(
    (item) =>
      item.ticketNumber !== null &&
      item.completedAtUtc === null &&
      item.deletedAtUtc === null &&
      projects.has(item.projectId) &&
      (item.folderId === null || folders.has(item.folderId)),
  );
}

/** Ranked first by rank, then by creation time and ID, like the server. */
function inOrder(store: FakeProjectStore, items: ReadonlyArray<Item>): Array<Item> {
  const rank = (item: Item) => store.tickets.ranks.get(item.id) ?? Number.POSITIVE_INFINITY;
  return items.toSorted(
    (left, right) =>
      rank(left) - rank(right) ||
      left.createdAtUtc.localeCompare(right.createdAtUtc) ||
      left.id.localeCompare(right.id),
  );
}

function board(store: FakeProjectStore, projectId: string | null): typeof TicketBoard.Type {
  const statuses = new Map(store.statuses.ordered().map(({ id, name }) => [id, name]));
  const projects = new Map(store.summaries.map(({ project }) => [project.id, project.name]));
  const tickets = openTickets(store).filter(
    (item) => projectId === null || item.projectId === projectId.toUpperCase(),
  );
  const row = (item: Item) => ({
    itemId: item.id,
    projectId: item.projectId,
    folderId: item.folderId,
    projectName: projects.get(item.projectId) ?? "",
    ticketNumber: item.ticketNumber ?? "",
    title: item.title,
    statusId: item.statusId,
    statusName: item.statusId === null ? null : (statuses.get(item.statusId) ?? null),
    priorityLevelId: item.priorityLevelId,
    dueDate: item.dueDate,
    dueTime: item.dueTime,
  });
  const section = (priorityLevelId: string | null, label: string, isArchived: boolean) => ({
    priorityLevelId,
    label,
    isArchived,
    tickets: inOrder(
      store,
      tickets.filter((item) => item.priorityLevelId === priorityLevelId),
    ).map(row),
  });
  const levels = store.settingsAndLookups.priorityLevels
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((level) => section(level.id, level.label, level.isArchived))
    .filter((entry) => !entry.isArchived || entry.tickets.length > 0);
  const projectRows = store.summaries.map(({ project }) => ({
    id: project.id,
    name: project.name,
  }));
  return { sections: [section(null, "No priority", false), ...levels], projects: projectRows };
}

const refuse = (message: string) => Effect.fail(new RuleViolation({ message }));

/** The destination section order after the move, or null when nothing would change. */
function planMove(store: FakeProjectStore, moving: Item, position: Position, append: boolean) {
  const target = position.priorityLevelId?.toUpperCase() ?? null;
  const section = inOrder(
    store,
    openTickets(store).filter((item) => item.priorityLevelId === target),
  );
  const previous = section.findIndex((item) => item.id === moving.id);
  const others = section.filter((item) => item.id !== moving.id);
  const anchor = others.findIndex((item) => item.id === position.anchorId?.toUpperCase());
  if (!append && position.anchorId !== null && anchor < 0) {
    return refuse("The target ticket has moved or is no longer open.");
  }
  const anchored = position.anchorId === null ? 0 : anchor + (position.after ? 1 : 0);
  const index = append ? others.length : anchored;
  if (index === previous) {
    return Effect.succeed(null);
  }
  others.splice(index, 0, moving);
  return Effect.succeed({ target, order: others });
}

function applyMove(store: FakeProjectStore, itemId: string, position: Position, append: boolean) {
  return Effect.gen(function* () {
    const moving = openTickets(store).find((item) => item.id === itemId.toUpperCase());
    if (moving === undefined) {
      return yield* refuse("This item is no longer an open ticket.");
    }
    const target = position.priorityLevelId?.toUpperCase() ?? null;
    const changes = moving.priorityLevelId !== target;
    if ((append && !changes) || position.anchorId?.toUpperCase() === moving.id) {
      return false;
    }
    const level = store.settingsAndLookups.priorityLevels.find(({ id }) => id === target);
    if (changes && target !== null && (level === undefined || level.isArchived)) {
      return yield* refuse("Choose an active priority level.");
    }
    const plan = yield* planMove(store, moving, position, append);
    if (plan === null) {
      return false;
    }
    if (changes) {
      store.patchItem(moving.id, { priorityLevelId: target, updatedAtUtc: store.nextTimestamp() });
    }
    plan.order.forEach((item, rank) => store.tickets.ranks.set(item.id, rank));
    return true;
  });
}

function titleOf(store: FakeProjectStore, itemId: string) {
  return openTickets(store).find((item) => item.id === itemId.toUpperCase())?.title;
}

/** LoadTickets, MoveTicket and SetTicketPriority over the fake store's items (§7.16). */
export function ticketHandlers(store: FakeProjectStore, track: Track) {
  return {
    LoadTickets: ({ projectId }: { readonly projectId: string | null }) =>
      store
        .record("LoadTickets")
        .pipe(
          Effect.andThen(() =>
            store.tickets.loadFailure === null
              ? Effect.succeed(board(store, projectId))
              : refuse(store.tickets.loadFailure),
          ),
        ),
    MoveTicket: ({
      itemId,
      position,
    }: {
      readonly itemId: string;
      readonly position: Position;
    }) => {
      const title = titleOf(store, itemId);
      const move = store
        .record("MoveTicket")
        .pipe(Effect.andThen(applyMove(store, itemId, position, false)));
      return track(move, (moved) => (moved ? `Move '${title}'` : null));
    },
    SetTicketPriority: ({
      itemId,
      priorityLevelId,
    }: {
      readonly itemId: string;
      readonly priorityLevelId: string | null;
    }) => {
      const title = titleOf(store, itemId);
      const position = { priorityLevelId, anchorId: null, after: false };
      const change = store
        .record("SetTicketPriority")
        .pipe(Effect.andThen(applyMove(store, itemId, position, true)));
      return track(change, (moved) => (moved ? `Set priority of '${title}'` : null));
    },
  };
}
