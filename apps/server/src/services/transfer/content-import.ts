import {
  CompletionService,
  completionStatus,
  DEFAULT_REMINDER,
  FolderTree,
  ItemTree,
  isBlankText,
  LinkPolicy,
  listOf,
  nameKey,
  parseTransferDate,
  parseTransferLocal,
  parseTransferTime,
  parseTransferUtc,
  trimText,
  type FieldValueDocument,
  type Folder,
  type FolderDocument,
  type ItemDocument,
  type RecurrenceRule,
  type ReminderChoice,
  type TodoItem,
} from "@task-tracker/core";
import { type ImportContext, importTimestamps } from "./import-plan.js";
import type { ImportedProject } from "./project-import.js";

/**
 * Orders documents so every parent comes before its children, breadth first from
 * the roots, keeping file order among siblings. Validation already ruled out
 * cycles and missing parents.
 */
function parentFirst<T>(
  documents: readonly T[],
  idOf: (value: T) => string | null,
  parentOf: (value: T) => string | null,
) {
  const children = Map.groupBy(documents, parentOf);
  const ordered: T[] = [];
  const waiting = [...(children.get(null) ?? [])];
  for (let next = waiting.shift(); next !== undefined; next = waiting.shift()) {
    ordered.push(next);
    waiting.push(...(children.get(idOf(next)) ?? []));
  }
  return ordered;
}

function reminderChoice(document: ItemDocument): ReminderChoice {
  if (document.reminderMode === "none") {
    return { kind: "none" };
  }
  return document.reminderMode === "offset"
    ? { kind: "offset", minutes: document.reminderOffsetMinutes! }
    : DEFAULT_REMINDER;
}

/** Plans the folders, items, values and links of the imported projects with new ids (§7.9). */
class ContentImport {
  constructor(private readonly context: ImportContext) {}

  run(imported: ImportedProject): { folders: number; items: TodoItem[] } {
    const projectId = imported.project.id;
    const folders = this.#folders(listOf(imported.document.folders), projectId);
    const items = this.#items(listOf(imported.document.items), projectId);
    const reconciled =
      imported.settings?.autoCompleteParents.value === true
        ? this.#reconcile(projectId, folders, items)
        : items;
    this.context.plan.folders.push(...folders);
    this.context.plan.items.push(...reconciled);
    return { folders: folders.length, items: reconciled };
  }

  #folders(documents: readonly FolderDocument[], projectId: string): Folder[] {
    return parentFirst(
      documents,
      (folder) => folder.id,
      (folder) => folder.parentFolderId,
    ).map((document) => {
      const folder: Folder = {
        id: this.context.newId(),
        projectId,
        parentFolderId:
          document.parentFolderId === null
            ? null
            : this.context.map.folders.get(document.parentFolderId)!,
        name: trimText(document.name!),
        sortOrder: document.sortOrder ?? 0,
        ...importTimestamps(document.createdAtUtc, document.updatedAtUtc, this.context.now),
        deletedAtUtc: null,
        deletionBatchId: null,
      };
      this.context.map.folders.set(document.id!, folder.id);
      return folder;
    });
  }

  #items(documents: readonly ItemDocument[], projectId: string): TodoItem[] {
    return parentFirst(
      documents,
      (item) => item.id,
      (item) => item.parentItemId,
    ).map((document) => {
      const item = this.#item(document, projectId);
      this.context.map.items.set(document.id!, item.id);
      this.#values(item.id, listOf(document.fieldValues));
      this.#links(item.id, document);
      this.#ticket(item, document);
      return item;
    });
  }

  #item(document: ItemDocument, projectId: string): TodoItem {
    const { map } = this.context;
    return {
      id: this.context.newId(),
      projectId,
      folderId: document.folderId === null ? null : map.folders.get(document.folderId)!,
      parentItemId: document.parentItemId === null ? null : map.items.get(document.parentItemId)!,
      kind: document.kind === "Ticket" ? "Ticket" : "Todo",
      title: trimText(document.title!),
      description: document.description,
      ticketNumber: isBlankText(document.ticketNumber) ? null : trimText(document.ticketNumber!),
      itemTypeId: this.#lookupId(document, "type"),
      priorityLevelId: this.#lookupId(document, "priority"),
      dueDate: parseTransferDate(document.dueDate),
      dueTime: parseTransferTime(document.dueTime),
      scheduledStart: parseTransferLocal(document.scheduledStart),
      scheduledEnd: parseTransferLocal(document.scheduledEnd),
      ...this.#completion(document),
      recurrence: document.recurrence as RecurrenceRule | null,
      recurrenceSeriesId:
        document.recurrence === null ? null : this.#series(document.recurrenceSeriesId),
      recurrenceSuccessorCreated: document.recurrenceSuccessorCreated,
      reminder: reminderChoice(document),
      sortOrder: document.sortOrder ?? 0,
      ...importTimestamps(document.createdAtUtc, document.updatedAtUtc, this.context.now),
      deletedAtUtc: null,
      deletionBatchId: null,
    };
  }

  /** Only an item that names a type or priority gets one, as validation checked. */
  #lookupId(document: ItemDocument, lookup: "type" | "priority"): string | null {
    const { index, map } = this.context;
    if (lookup === "type") {
      const named = document.itemTypeId !== null || !isBlankText(document.itemType);
      const found = named ? index.findItemType(document) : undefined;
      return found === undefined ? null : map.itemTypes.get(found.id!)!;
    }
    const named = document.priorityLevelId !== null || !isBlankText(document.priority);
    const found = named ? index.findPriority(document) : undefined;
    return found === undefined ? null : map.priorityLevels.get(found.id!)!;
  }

  /**
   * A completed item gets the file's Done status (the first Done status for files
   * without statuses) and its remembered Open status; an open item its Open status.
   */
  #completion(document: ItemDocument) {
    const { map } = this.context;
    const status = (id: string | null) => (id === null ? null : map.statuses.get(id)!);
    const completedAtUtc = parseTransferUtc(document.completedAtUtc);
    if (completedAtUtc === null) {
      return { completedAtUtc, statusId: status(document.statusId), reopenStatusId: null };
    }
    const statusId = status(document.statusId) ?? map.firstDoneStatusId;
    return { completedAtUtc, statusId, reopenStatusId: status(document.reopenStatusId) };
  }

  /** Occurrences of one series in the file share one new series id. */
  #series(original: string | null): string {
    const { recurrenceSeries } = this.context.map;
    if (original === null) {
      return this.context.newId();
    }
    if (!recurrenceSeries.has(original)) {
      recurrenceSeries.set(original, this.context.newId());
    }
    return recurrenceSeries.get(original)!;
  }

  #values(itemId: string, values: readonly FieldValueDocument[]): void {
    for (const value of values) {
      const field = this.context.map.fields.get(nameKey(trimText(value.fieldKey!)))!;
      const fieldDocument = this.context.index.findField(value.fieldKey)!;
      const choice =
        field.dataType === "Choice"
          ? this.context.index.findChoice(fieldDocument, value)
          : undefined;
      this.context.plan.values.push({
        itemId,
        fieldDefinitionId: field.id,
        textValue: value.text,
        numberValue: value.number,
        dateValue: parseTransferDate(value.date),
        boolValue: value.boolean,
        choiceId: choice === undefined ? null : this.context.map.choices.get(choice.id!)!,
      });
    }
  }

  #links(itemId: string, document: ItemDocument): void {
    listOf(document.links).forEach((link, position) => {
      this.context.plan.links.push({
        id: this.context.newId(),
        itemId,
        url: LinkPolicy.normalizeUrl(link.url),
        title: LinkPolicy.normalizeTitle(link.title),
        sortOrder: position,
        createdAtUtc: this.context.now,
      });
    });
  }

  /** A ticket's fixed fields with its list entries mapped, and its comment log (§7.19). */
  #ticket(item: TodoItem, document: ItemDocument): void {
    if (item.kind !== "Ticket") {
      return;
    }
    const entry = (id: string | null) =>
      id === null ? null : (this.context.map.ticketEntries.get(id) ?? null);
    const ticket = document.ticket;
    if (ticket !== null) {
      this.context.plan.ticketDetails.push({
        itemId: item.id,
        requestorId: entry(ticket.requestorId),
        applicationId: entry(ticket.applicationId),
        moduleId: entry(ticket.moduleId),
        interfaceId: entry(ticket.interfaceId),
        dispatchedToId: entry(ticket.dispatchedToId),
        pendingPersonId: entry(ticket.pendingPersonId),
        ticketTypeId: entry(ticket.ticketTypeId),
        version: isBlankText(ticket.version) ? null : trimText(ticket.version!),
        estimatedHours: ticket.estimatedHours,
        percentComplete: ticket.percentComplete,
        isUrgent: ticket.isUrgent === true,
        isSystemOutage: ticket.isSystemOutage === true,
      });
    }
    for (const comment of listOf(document.comments)) {
      this.context.plan.comments.push({
        id: this.context.newId(),
        itemId: item.id,
        body: trimText(comment.body!),
        createdAtUtc: parseTransferUtc(comment.createdAtUtc) ?? this.context.now,
      });
    }
  }

  /** Applies automatic completion (§6.1) so data exported with it off satisfies it here. */
  #reconcile(
    projectId: string,
    folders: readonly Folder[],
    items: readonly TodoItem[],
  ): TodoItem[] {
    const { now, map } = this.context;
    const folderTree = new FolderTree(projectId, folders);
    const changes = new Map<string, Temporal.Instant | null>();
    for (const [folderId, rows] of Map.groupBy(items, (item) => item.folderId)) {
      const tree = new ItemTree(projectId, folderId, rows, folderTree);
      for (const change of CompletionService.reconcileAll(tree, now).changes) {
        changes.set(change.itemId, change.completedAtUtc);
      }
    }
    return items.map((item) => {
      if (!changes.has(item.id)) {
        return item;
      }
      const completedAtUtc = changes.get(item.id)!;
      const status = completionStatus(item, completedAtUtc, map.firstDoneStatusId);
      return { ...item, ...status, completedAtUtc, updatedAtUtc: now };
    });
  }
}

/** Plans each imported project's contents and returns the folder count and added items. */
export function importContents(context: ImportContext, projects: readonly ImportedProject[]) {
  const content = new ContentImport(context);
  return projects.map((imported) => content.run(imported));
}
