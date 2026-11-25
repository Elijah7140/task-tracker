import { recurrenceErrors, type RecurrenceRule } from "../../items/recurrence/recurrence-rule.js";
import { REMINDER_OFFSET_MINUTES } from "../../reminders/reminder-choice.js";
import { parseTransferDate, parseTransferTime } from "../transfer-time-format.js";
import type { IssueList } from "../transfer-issue.js";
import type { ItemDocument, ProjectDocument } from "./export-document.js";
import { listOf } from "./export-document.js";
import {
  checkId,
  checkName,
  guidText,
  isBlank,
  NAME_MAX_LENGTH,
  TICKET_NUMBER_MAX_LENGTH,
  trimText,
} from "./import-checks.js";
import { firstById, formsCycle } from "./import-cycles.js";
import type { ImportIndex } from "./import-index.js";
import { validateItemLinks } from "./item-link-validator.js";
import { ItemValueValidator } from "./item-value-validator.js";
import { elementPath } from "./json-path.js";
import { readStatusKind } from "./lookup-validator.js";
import { checkTimestamp } from "./timestamp-checks.js";
import { type TicketEntryKinds, validateItemTicket } from "./ticket-validator.js";

const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

/** True when a reminder mode and offset form a valid choice (§7.12). */
export function isValidReminder(mode: string | null, minutes: number | null): boolean {
  if (mode === null || mode === "none") {
    return minutes === null;
  }
  return minutes !== null && (REMINDER_OFFSET_MINUTES as readonly number[]).includes(minutes);
}

/**
 * Checks one project's items: required fields, §5.1 hierarchy invariants,
 * lookup references, status, date, repeat and reminder rules, values and links.
 */
export class ItemValidator {
  readonly #values: ItemValueValidator;

  constructor(
    private readonly index: ImportIndex,
    private readonly issues: IssueList,
    private readonly seenItemIds: Set<string>,
    private readonly ticketEntries: TicketEntryKinds = new Map(),
  ) {
    this.#values = new ItemValueValidator(index, issues);
  }

  validate(project: ProjectDocument, path: string): void {
    const items = listOf(project.items);
    const folderIds = new Set(listOf(project.folders).flatMap((folder) => folder.id ?? []));
    const byId = firstById(items);
    items.forEach((item, position) => {
      const itemPath = elementPath(path, position);
      this.#validateIdentity(item, itemPath);
      this.#validateLookups(item, itemPath);
      this.#validateStatus(item, itemPath);
      this.#validateDue(item, itemPath);
      this.#validateRecurrence(item, itemPath);
      if (!isValidReminder(item.reminderMode, item.reminderOffsetMinutes)) {
        const message = "Choose a supported offset for offset mode only.";
        this.issues.add(`${itemPath}.reminderOffsetMinutes`, message);
      }
      this.#validatePlacement(item, itemPath, folderIds, byId);
      this.#values.validate(listOf(item.fieldValues), project.id, `${itemPath}.fieldValues`);
      validateItemLinks(item.links, `${itemPath}.links`, this.issues);
      validateItemTicket(item, itemPath, this.ticketEntries, this.issues);
    });
  }

  #validateIdentity(item: ItemDocument, path: string): void {
    checkId(item.id, `${path}.id`, this.seenItemIds, this.issues);
    checkName(item.title, NAME_MAX_LENGTH, `${path}.title`, this.issues);
    if (
      item.ticketNumber !== null &&
      trimText(item.ticketNumber).length > TICKET_NUMBER_MAX_LENGTH
    ) {
      const message = `The ticket number must be ${TICKET_NUMBER_MAX_LENGTH} characters or fewer.`;
      this.issues.add(`${path}.ticketNumber`, message);
    }
    checkTimestamp(item.createdAtUtc, `${path}.createdAtUtc`, this.issues);
    checkTimestamp(item.updatedAtUtc, `${path}.updatedAtUtc`, this.issues);
    checkTimestamp(item.completedAtUtc, `${path}.completedAtUtc`, this.issues);
  }

  #validateLookups(item: ItemDocument, path: string): void {
    const hasPriority = item.priorityLevelId !== null || !isBlank(item.priority);
    if (hasPriority && this.index.findPriority(item) === undefined) {
      this.issues.add(`${path}.priority`, "The priority is not in this file's priority levels.");
    }
  }

  /** The status must agree with completion; a remembered Open status needs a completed item (§7.15). */
  #validateStatus(item: ItemDocument, path: string): void {
    const completed = item.completedAtUtc !== null;
    const kindOf = (id: string) => readStatusKind(this.index.findStatus(id)?.kind ?? null);
    if (item.statusId !== null && kindOf(item.statusId) !== (completed ? "Done" : "Open")) {
      const kind = completed ? "a Done" : "an Open";
      this.issues.add(`${path}.statusId`, `Expected ${kind} status in this file.`);
    }
    if (item.reopenStatusId !== null && (!completed || kindOf(item.reopenStatusId) !== "Open")) {
      const message = "Only completed items can remember an Open status from this file.";
      this.issues.add(`${path}.reopenStatusId`, message);
    }
  }

  #validateRecurrence(item: ItemDocument, path: string): void {
    const series = item.recurrenceSeriesId;
    if (series === EMPTY_GUID || (item.recurrence === null && series !== null)) {
      const message = "A series ID must be nonempty and belong to a repeat rule.";
      this.issues.add(`${path}.recurrenceSeriesId`, message);
    }
    const rule = item.recurrence;
    if (rule === null) {
      return;
    }
    if (item.dueDate === null) {
      this.issues.add(`${path}.recurrence`, "A repeating item needs a due date.");
    }
    for (const error of recurrenceErrors(rule as unknown as RecurrenceRule)) {
      this.issues.add(`${path}.recurrence.${error.property}`, error.message);
    }
  }

  #validateDue(item: ItemDocument, path: string): void {
    if (item.dueDate !== null && parseTransferDate(item.dueDate) === null) {
      this.issues.add(`${path}.dueDate`, "Expected a date such as 2026-11-13.");
    }
    if (item.dueTime !== null && parseTransferTime(item.dueTime) === null) {
      this.issues.add(`${path}.dueTime`, "Expected a time such as 15:00:00.");
    }
    if (item.dueTime !== null && item.dueDate === null) {
      this.issues.add(`${path}.dueTime`, "A due time needs a due date.");
    }
  }

  #validatePlacement(
    item: ItemDocument,
    path: string,
    folderIds: ReadonlySet<string>,
    byId: ReadonlyMap<string, ItemDocument>,
  ): void {
    if (item.folderId !== null && !folderIds.has(item.folderId)) {
      this.issues.add(
        `${path}.folderId`,
        `The folder ${guidText(item.folderId)} is not in this project.`,
      );
    }
    const parentId = item.parentItemId;
    const parent = parentId === null ? undefined : byId.get(parentId);
    if (parentId === null) {
      return;
    }
    if (parent === undefined) {
      const message = `The parent item ${guidText(parentId)} is not in this project.`;
      this.issues.add(`${path}.parentItemId`, message);
    } else if (
      formsCycle(
        item,
        byId,
        (other) => other.id,
        (other) => other.parentItemId,
      )
    ) {
      this.issues.add(`${path}.parentItemId`, "The item would be a sub-item of itself.");
    } else if (parent.folderId !== item.folderId) {
      const message = "A sub-item must be in the same folder as its parent item.";
      this.issues.add(`${path}.folderId`, message);
    }
  }
}
