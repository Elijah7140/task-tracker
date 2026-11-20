import {
  type ItemRpcs,
  type ProjectWorkspaceRpcs,
  RuleViolation,
  type TicketCommentProjection,
  type TicketDetailInput,
  type TicketListEntryProjection,
  type TicketListRpcs,
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

/** Handlers for AddItem, tickets, ticket lists and project icons, recorded as history steps. */
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
