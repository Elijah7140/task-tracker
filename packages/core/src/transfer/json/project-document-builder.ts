import type { ItemFieldValue } from "../../fields/item-field-value.js";
import type { ItemLink } from "../../items/item-link.js";
import type { TodoItem } from "../../items/todo-item.js";
import type { Folder } from "../../projects/folder.js";
import type { TicketComment } from "../../tickets/ticket-comment.js";
import type { TicketDetail } from "../../tickets/ticket-detail.js";
import {
  formatTransferDate,
  formatTransferLocal,
  formatTransferTime,
  formatTransferUtc,
} from "../transfer-time-format.js";
import { exportGuid, optionalString, ordinal, settingsObject } from "./export-values.js";
import type { ExportCatalogue, ProjectExportData } from "./export-source.js";
import {
  jsonArray,
  jsonBoolean,
  jsonDouble,
  jsonInteger,
  jsonObject,
  jsonString,
  type JsonOut,
} from "./json-writer.js";
import { recurrenceDocument } from "./recurrence-document.js";

type Ordered = { sortOrder: number; createdAtUtc: Temporal.Instant; id: string };

/** Sort order, then creation time, then name ordinally, then id: deterministic output. */
function compareRows<T extends Ordered>(nameOf: (row: T) => string) {
  return (left: T, right: T) =>
    left.sortOrder - right.sortOrder ||
    Temporal.Instant.compare(left.createdAtUtc, right.createdAtUtc) ||
    ordinal(nameOf(left), nameOf(right)) ||
    ordinal(left.id.toLowerCase(), right.id.toLowerCase());
}

const utc = (value: Temporal.Instant) => jsonString(formatTransferUtc(value));

function folderDocument(folder: Folder): JsonOut {
  return jsonObject([
    ["id", exportGuid(folder.id)],
    ["parentFolderId", exportGuid(folder.parentFolderId)],
    ["name", jsonString(folder.name)],
    ["sortOrder", jsonInteger(folder.sortOrder)],
    ["createdAtUtc", utc(folder.createdAtUtc)],
    ["updatedAtUtc", utc(folder.updatedAtUtc)],
  ]);
}

class ItemDocuments {
  readonly #fieldKeys: ReadonlyMap<string, string>;
  readonly #choiceLabels: ReadonlyMap<string, string>;
  readonly #typeNames: ReadonlyMap<string, string>;
  readonly #priorityNames: ReadonlyMap<string, string>;

  constructor(catalogue: ExportCatalogue) {
    this.#fieldKeys = new Map(catalogue.fields.map((field) => [field.id, field.key]));
    this.#choiceLabels = new Map(catalogue.choices.map((choice) => [choice.id, choice.label]));
    this.#typeNames = new Map(catalogue.itemTypes.map((type) => [type.id, type.name]));
    this.#priorityNames = new Map(catalogue.priorityLevels.map((level) => [level.id, level.name]));
  }

  build(item: TodoItem, extras: ItemExtras): JsonOut {
    const { values, links } = extras;
    return jsonObject([
      ...this.#identity(item),
      ...this.#dates(item),
      ["sortOrder", jsonInteger(item.sortOrder)],
      ["createdAtUtc", utc(item.createdAtUtc)],
      ["updatedAtUtc", utc(item.updatedAtUtc)],
      ["fieldValues", jsonArray(this.#values(values))],
      ...reminderMembers(item),
      ["recurrence", item.recurrence === null ? null : recurrenceDocument(item.recurrence)],
      ["recurrenceSeriesId", exportGuid(item.recurrenceSeriesId)],
      ["recurrenceSuccessorCreated", item.recurrenceSuccessorCreated ? jsonBoolean(true) : null],
      ["links", linksDocument(links)],
      ...ticketMembers(item, extras),
    ]);
  }

  #identity(item: TodoItem) {
    const name = (names: ReadonlyMap<string, string>, id: string | null) =>
      id === null ? null : jsonString(names.get(id)!);
    return [
      ["id", exportGuid(item.id)],
      ["folderId", exportGuid(item.folderId)],
      ["parentItemId", exportGuid(item.parentItemId)],
      ["title", jsonString(item.title)],
      ["description", optionalString(item.description)],
      ["ticketNumber", optionalString(item.ticketNumber)],
      ["itemTypeId", exportGuid(item.itemTypeId)],
      ["itemType", name(this.#typeNames, item.itemTypeId)],
      ["priorityLevelId", exportGuid(item.priorityLevelId)],
      ["priority", name(this.#priorityNames, item.priorityLevelId)],
      ["statusId", exportGuid(item.statusId)],
      ["reopenStatusId", exportGuid(item.reopenStatusId)],
    ] as const;
  }

  #dates(item: TodoItem) {
    const text = <T>(value: T | null, format: (value: T) => string) =>
      value === null ? null : jsonString(format(value));
    return [
      ["dueDate", text(item.dueDate, formatTransferDate)],
      ["dueTime", text(item.dueTime, formatTransferTime)],
      ["scheduledStart", text(item.scheduledStart, formatTransferLocal)],
      ["scheduledEnd", text(item.scheduledEnd, formatTransferLocal)],
      ["completedAtUtc", text(item.completedAtUtc, formatTransferUtc)],
    ] as const;
  }

  #values(values: readonly ItemFieldValue[]): JsonOut[] {
    const keyOf = (value: ItemFieldValue) => this.#fieldKeys.get(value.fieldDefinitionId)!;
    return values
      .toSorted((left, right) => ordinal(keyOf(left), keyOf(right)))
      .map((value) => this.#value(keyOf(value), value));
  }

  #value(key: string, value: ItemFieldValue): JsonOut {
    return jsonObject([
      ["fieldKey", jsonString(key)],
      ["text", optionalString(value.textValue)],
      ["number", value.numberValue === null ? null : jsonDouble(value.numberValue)],
      ["date", value.dateValue === null ? null : jsonString(formatTransferDate(value.dateValue))],
      ["boolean", value.boolValue === null ? null : jsonBoolean(value.boolValue)],
      ["choiceId", exportGuid(value.choiceId)],
      [
        "choiceLabel",
        value.choiceId === null ? null : jsonString(this.#choiceLabels.get(value.choiceId)!),
      ],
    ]);
  }
}

/** The rows that belong to one item besides the item itself. */
interface ItemExtras {
  readonly values: readonly ItemFieldValue[];
  readonly links: readonly ItemLink[];
  readonly ticket: TicketDetail | undefined;
  readonly comments: readonly TicketComment[];
}

const optionalId = (id: string | null) => exportGuid(id);

function ticketDocument(detail: TicketDetail): JsonOut {
  return jsonObject([
    ["requestorId", optionalId(detail.requestorId)],
    ["applicationId", optionalId(detail.applicationId)],
    ["moduleId", optionalId(detail.moduleId)],
    ["interfaceId", optionalId(detail.interfaceId)],
    ["dispatchedToId", optionalId(detail.dispatchedToId)],
    ["pendingPersonId", optionalId(detail.pendingPersonId)],
    ["ticketTypeId", optionalId(detail.ticketTypeId)],
  ]);
}

/** The comment log oldest first, or null when there is none so the property is left out. */
function commentsDocument(comments: readonly TicketComment[]): JsonOut | null {
  const documents = comments
    .toSorted((left, right) => Temporal.Instant.compare(left.createdAtUtc, right.createdAtUtc))
    .map((comment) =>
      jsonObject([
        ["body", jsonString(comment.body)],
        ["createdAtUtc", utc(comment.createdAtUtc)],
      ]),
    );
  return documents.length === 0 ? null : jsonArray(documents);
}

/**
 * A ticket's kind, fixed fields and comments (§7.19). A ToDo writes none of them, so exports
 * without tickets keep their earlier form.
 */
function ticketMembers(item: TodoItem, extras: ItemExtras) {
  if (item.kind !== "Ticket") {
    return [];
  }
  return [
    ["kind", jsonString("Ticket")],
    ["ticket", extras.ticket === undefined ? null : ticketDocument(extras.ticket)],
    ["comments", commentsDocument(extras.comments)],
  ] as const;
}

function reminderMembers(item: TodoItem) {
  const { reminder } = item;
  const mode = reminder.kind === "default" ? null : jsonString(reminder.kind);
  const minutes = reminder.kind === "offset" ? jsonInteger(reminder.minutes) : null;
  return [
    ["reminderMode", mode],
    ["reminderOffsetMinutes", minutes],
  ] as const;
}

/** The links in order, or null when there are none so the property is left out. */
function linksDocument(links: readonly ItemLink[]): JsonOut | null {
  const documents = links
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .map((link) =>
      jsonObject([
        ["url", jsonString(link.url)],
        ["title", optionalString(link.title)],
      ]),
    );
  return documents.length === 0 ? null : jsonArray(documents);
}

/** Turns one project's rows into its document, in a stable order. */
export function buildProjectDocument(data: ProjectExportData, catalogue: ExportCatalogue): JsonOut {
  const { project } = data;
  const items = new ItemDocuments(catalogue);
  const valuesByItem = Map.groupBy(data.values, (value) => value.itemId);
  const linksByItem = Map.groupBy(data.links, (link) => link.itemId);
  const ticketsByItem = new Map(data.ticketDetails.map((detail) => [detail.itemId, detail]));
  const commentsByItem = Map.groupBy(data.comments, (comment) => comment.itemId);
  const folders = data.folders.toSorted(compareRows((folder: Folder) => folder.name));
  const ordered = data.items.toSorted(compareRows((item: TodoItem) => item.title));
  return jsonObject([
    ["id", exportGuid(project.id)],
    ["name", jsonString(project.name)],
    ["description", optionalString(project.description)],
    ["iconKey", optionalString(project.iconKey)],
    ["sortOrder", jsonInteger(project.sortOrder)],
    ["createdAtUtc", utc(project.createdAtUtc)],
    ["updatedAtUtc", utc(project.updatedAtUtc)],
    ["settings", settingsObject(data.settings)],
    ["folders", jsonArray(folders.map(folderDocument))],
    [
      "items",
      jsonArray(
        ordered.map((item) =>
          items.build(item, {
            values: valuesByItem.get(item.id) ?? [],
            links: linksByItem.get(item.id) ?? [],
            ticket: ticketsByItem.get(item.id),
            comments: commentsByItem.get(item.id) ?? [],
          }),
        ),
      ),
    ],
  ]);
}
