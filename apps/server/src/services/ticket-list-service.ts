import {
  archiveTicketListEntry,
  createTicketListEntry,
  MetadataRuleError,
  renameTicketListEntry,
  reorderTicketListEntries,
  restoreTicketListEntry,
  ticketListNoun,
  type TicketListEntry,
  type TicketListKind,
} from "@task-tracker/core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { ticketListRepository } from "../db/repositories/ticket-list-repository.js";
import { Guid } from "../db/storage-codecs.js";
import { checkRules } from "./check-rules.js";
import { newId } from "./new-id.js";
import { operationTime } from "./operation-time.js";
import { UndoService, undoLabel } from "./undo-service.js";

const decodeId = Schema.decodeEffect(Guid);
const decodeNullableId = Schema.decodeEffect(Schema.NullOr(Guid));
const decodeIds = Schema.decodeEffect(Schema.Array(Guid));

/** How a reorder names each list in its undo label, such as "Reorder people". */
const pluralNouns: Readonly<Record<TicketListKind, string>> = {
  Person: "people",
  TicketType: "ticket types",
  Application: "applications",
  Module: "modules",
  Interface: "interfaces",
};

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const undo = yield* UndoService;
  const store = ticketListRepository(sql);

  const capture = (verb: string, entry: TicketListEntry) =>
    undo.capture(undoLabel(`${verb} ${ticketListNoun(entry.listKind)}`, entry.name), [
      { table: "TicketListEntry", where: sql`Id = ${entry.id}` },
    ]);

  const add = Effect.fnUntraced(function* (
    kind: TicketListKind,
    parent: string | null,
    name: string,
  ) {
    const parentId = yield* decodeNullableId(parent);
    const rows = yield* store.list();
    const now = yield* operationTime;
    const entry = yield* checkRules(() =>
      createTicketListEntry(newId(now), kind, parentId, name, rows),
    );
    yield* capture("Add", entry);
    yield* store.insert(entry);
    return entry;
  }, undo.record);

  const edit = Effect.fnUntraced(function* (
    id: string,
    verb: string,
    change: (entry: TicketListEntry, rows: readonly TicketListEntry[]) => TicketListEntry,
  ) {
    const key = yield* decodeId(id);
    const rows = yield* store.list();
    const entry = rows.find((row) => row.id === key);
    if (entry === undefined) {
      return yield* Effect.fail(new MetadataRuleError("List entry was not found."));
    }
    const updated = yield* checkRules(() => change(entry, rows));
    yield* capture(verb, updated);
    yield* store.update(updated);
  }, undo.record);

  const reorder = Effect.fnUntraced(function* (
    kind: TicketListKind,
    parent: string | null,
    ids: readonly string[],
  ) {
    const parentId = yield* decodeNullableId(parent);
    const orderedIds = yield* decodeIds(ids);
    const rows = yield* store.list();
    const ordered = yield* checkRules(() =>
      reorderTicketListEntries(rows, kind, parentId, orderedIds),
    );
    const label = `Reorder ${pluralNouns[kind]}`;
    yield* undo.capture(label, [
      {
        table: "TicketListEntry",
        where: sql`ListKind = ${kind} AND ParentId IS ${parentId}`,
      },
    ]);
    yield* Effect.forEach(ordered, store.update, { discard: true });
  }, undo.record);

  return {
    /** Every entry of every list, archived ones included, in list order. */
    list: () => sql.withTransaction(store.list()),
    add,
    rename: (id: string, name: string) =>
      edit(id, "Rename", (entry, rows) => renameTicketListEntry(entry, name, rows)),
    archive: (id: string) => edit(id, "Archive", archiveTicketListEntry),
    restore: (id: string) => edit(id, "Restore", restoreTicketListEntry),
    reorder,
  };
});

/** Transactional management of People, Ticket types and the ticket levels tree (§7.19). */
export class TicketListService extends Context.Service<TicketListService>()(
  "@task-tracker/server/TicketListService",
  { make },
) {
  static readonly layer = Layer.effect(this, make);
}
