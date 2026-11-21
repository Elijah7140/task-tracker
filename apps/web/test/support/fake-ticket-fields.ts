import {
  type ItemRpcs,
  type NotFound,
  type ProjectWorkspaceRpcs,
  RuleViolation,
  type TicketCommentProjection,
  type TicketDetailInput,
  type TicketListEntryProjection,
  type TicketListRpcs,
  TicketRejected,
} from "@task-tracker/contracts";
import { Effect } from "effect";
import type { Rpc } from "effect/rpc";
import {
  applyCreateItem,
  type FakeAreaState,
  type FakeItemStoreContext,
  mapTree,
} from "./fake-item-operations.js";

type Entry = typeof TicketListEntryProjection.Type;
type Detail = typeof TicketDetailInput.Type;
type Comment = typeof TicketCommentProjection.Type;
type Payload<Group, Tag extends string> = Group extends {
  readonly requests: ReadonlyMap<string, infer R>;
}
  ? Extract<R, { readonly _tag: Tag }> extends Rpc.Any
    ? Rpc.Payload<Extract<R, { readonly _tag: Tag }>>
    : never
  : never;
type AddItemPayload = Payload<typeof ItemRpcs, "AddItem">;
type AddTicketsPayload = Payload<typeof ItemRpcs, "AddTickets">;
type SetIconPayload = Payload<typeof ProjectWorkspaceRpcs, "SetProjectIcon">;
type AddEntryPayload = Payload<typeof TicketListRpcs, "AddTicketListEntry">;

/** Empty ticket fields, as the server sends for a ticket saved without any. */
export const NO_TICKET_FIELDS: Detail = {
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

/** People, ticket types, levels, ticket fields and comments for the web tests (§7.19). */
export class FakeTicketFields {
  entries: Array<Entry> = [];
  readonly details = new Map<string, Detail>();
  readonly comments = new Map<string, Array<Comment>>();
  /** The last AddItem payload, so tests can assert what a dialog sent. */
  lastAdd: AddItemPayload | null = null;

  /** The last AddTickets payload, so tests can assert what the tray's batch sent. */
  lastBatch: AddTicketsPayload | null = null;

  /** A refusal the next AddTickets returns for one ticket, as the server's rules would. */
  rejectNextBatch: { readonly index: number; readonly message: string } | null = null;

  /** The ticket fields the last editor save sent, or undefined when it sent none. */
  lastEditTicket: Detail | undefined = undefined;

  constructor(private readonly nextId: () => string) {}

  /** Records an editor save's ticket fields and keeps LoadTicket in step with them. */
  saveEdit(itemId: string, ticket: Detail | undefined) {
    this.lastEditTicket = ticket;
    if (ticket !== undefined) {
      this.details.set(itemId, ticket);
    }
  }

  /** Seeds an entry directly, as App Settings would have saved it. */
  seed(listKind: Entry["listKind"], name: string, parentId: string | null = null): Entry {
    const siblings = this.entries.filter(
      (entry) => entry.listKind === listKind && entry.parentId === parentId,
    );
    const entry = {
      id: this.nextId(),
      listKind,
      parentId,
      name,
      isArchived: false,
      sortOrder: siblings.length,
    };
    this.entries.push(entry);
    return entry;
  }
}

/** The fake store parts the ticket handlers use. */
export interface TicketFieldsStore extends FakeItemStoreContext {
  readonly ticketFields: FakeTicketFields;
  readonly setProjectIcon: (
    projectId: string,
    iconKey: string | null,
  ) => Effect.Effect<void, never>;
}

function applyAddedFields(area: FakeAreaState, id: string, payload: AddItemPayload) {
  const { fields, kind } = payload;
  area.nodes = mapTree(area.nodes, (node) =>
    node.item.id === id
      ? {
          ...node,
          item: {
            ...node.item,
            kind,
            description: fields.description,
            ticketNumber: fields.ticketNumber?.trim() || null,
            priorityLevelId: fields.priorityLevelId,
            itemTypeId: fields.itemTypeId,
            dueDate: fields.dueDate,
            dueTime: fields.dueTime,
            statusId: fields.statusId ?? null,
          },
        }
      : node,
  );
}

function addItem(store: TicketFieldsStore, record: (tag: string) => Effect.Effect<unknown>) {
  return (payload: AddItemPayload) =>
    record("AddItem").pipe(
      Effect.andThen(() => {
        store.ticketFields.lastAdd = payload;
        if (payload.kind === "Ticket" && !payload.fields.ticketNumber?.trim()) {
          return Effect.fail(new RuleViolation({ message: "A ticket needs a ticket number." }));
        }
        return store.requireArea(payload.projectId, payload.folderId);
      }),
      Effect.flatMap((area) =>
        applyCreateItem(
          store,
          area,
          payload.projectId,
          payload.folderId,
          payload.parentItemId,
          payload.fields.title,
        ).pipe(
          Effect.map((item) => {
            applyAddedFields(area, item.id, payload);
            if (payload.kind === "Ticket") {
              store.ticketFields.details.set(item.id, payload.ticket ?? NO_TICKET_FIELDS);
            }
            return { ...item, kind: payload.kind, ticketNumber: payload.fields.ticketNumber };
          }),
        ),
      ),
    );
}

/** The first ticket of a batch the fake refuses, with the server's message. */
function batchRejection(data: FakeTicketFields, payload: AddTicketsPayload) {
  const planned = data.rejectNextBatch;
  data.rejectNextBatch = null;
  if (planned !== null) {
    return new TicketRejected(planned);
  }
  const index = payload.tickets.findIndex((ticket) => !ticket.fields.ticketNumber?.trim());
  return index === -1
    ? null
    : new TicketRejected({ index, message: "A ticket needs a ticket number." });
}

/** Adds every ticket in order to the area's top level, or nothing when one is refused. */
function addTickets(store: TicketFieldsStore, record: (tag: string) => Effect.Effect<unknown>) {
  const add = addItem(store, () => Effect.void);
  return (payload: AddTicketsPayload) =>
    record("AddTickets").pipe(
      Effect.andThen((): Effect.Effect<unknown, TicketRejected | RuleViolation | NotFound> => {
        store.ticketFields.lastBatch = payload;
        const rejection = batchRejection(store.ticketFields, payload);
        if (rejection !== null) {
          return Effect.fail(rejection);
        }
        return store.requireArea(payload.projectId, payload.folderId);
      }),
      Effect.andThen(() =>
        Effect.forEach(payload.tickets, ({ fields, ticket }) =>
          add({
            projectId: payload.projectId,
            folderId: payload.folderId,
            parentItemId: null,
            kind: "Ticket",
            fields,
            ...(ticket === undefined ? {} : { ticket }),
          }),
        ),
      ),
    );
}

/** "Create ⟨title⟩" for one ticket, or "Create n tickets", as the server labels a batch. */
function batchLabel(payload: AddTicketsPayload) {
  const [first] = payload.tickets;
  return payload.tickets.length === 1 && first !== undefined
    ? `Create '${first.fields.title.trim()}'`
    : `Create ${payload.tickets.length} tickets`;
}

function listHandlers(store: TicketFieldsStore, record: (tag: string) => Effect.Effect<unknown>) {
  const data = store.ticketFields;
  const update = (id: string, change: Partial<Entry>) => {
    data.entries = data.entries.map((entry) => (entry.id === id ? { ...entry, ...change } : entry));
  };
  return {
    ListTicketListEntries: () =>
      record("ListTicketListEntries").pipe(Effect.map(() => [...data.entries])),
    AddTicketListEntry: ({ listKind, parentId, name }: AddEntryPayload) =>
      record("AddTicketListEntry").pipe(
        Effect.map(() => data.seed(listKind, name.trim(), parentId)),
      ),
    RenameTicketListEntry: ({ id, name }: { readonly id: string; readonly name: string }) =>
      record("RenameTicketListEntry").pipe(Effect.map(() => update(id, { name: name.trim() }))),
    ArchiveTicketListEntry: ({ id }: { readonly id: string }) =>
      record("ArchiveTicketListEntry").pipe(Effect.map(() => update(id, { isArchived: true }))),
    RestoreTicketListEntry: ({ id }: { readonly id: string }) =>
      record("RestoreTicketListEntry").pipe(Effect.map(() => update(id, { isArchived: false }))),
    ReorderTicketListEntries: ({ ids }: { readonly ids: ReadonlyArray<string> }) =>
      record("ReorderTicketListEntries").pipe(
        Effect.map(() => ids.forEach((id, sortOrder) => update(id, { sortOrder }))),
      ),
  };
}

/** Handlers for AddItem, AddTickets, tickets, ticket lists and project icons, recorded as history steps. */
export function ticketFieldHandlers(
  store: TicketFieldsStore,
  record: (tag: string) => Effect.Effect<unknown>,
  track: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    label: (result: A) => string | null,
  ) => Effect.Effect<A, E, R>,
) {
  const data = store.ticketFields;
  return {
    ...listHandlers(store, record),
    AddItem: (payload: AddItemPayload) =>
      track(addItem(store, record)(payload), () => `Create '${payload.fields.title.trim()}'`),
    AddTickets: (payload: AddTicketsPayload) =>
      track(addTickets(store, record)(payload), () => batchLabel(payload)),
    LoadTicket: ({ itemId }: { readonly itemId: string }) =>
      record("LoadTicket").pipe(
        Effect.map(() => ({
          itemId,
          detail: data.details.get(itemId) ?? NO_TICKET_FIELDS,
          comments: [...(data.comments.get(itemId) ?? [])],
        })),
      ),
    AddTicketComment: ({ itemId, body }: { readonly itemId: string; readonly body: string }) =>
      record("AddTicketComment").pipe(
        Effect.map(() => {
          const comment = {
            id: store.nextId(),
            itemId,
            body: body.trim(),
            createdAtUtc: store.nextTimestamp(),
          };
          data.comments.set(itemId, [comment, ...(data.comments.get(itemId) ?? [])]);
          return comment;
        }),
      ),
    SetProjectIcon: ({ projectId, iconKey }: SetIconPayload) =>
      record("SetProjectIcon").pipe(Effect.andThen(store.setProjectIcon(projectId, iconKey))),
  };
}
