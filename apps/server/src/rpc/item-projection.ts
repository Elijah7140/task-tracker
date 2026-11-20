import type {
  AreaSnapshot,
  CompletionResult,
  Item,
  ItemEdit,
  RecurrenceRule,
} from "@task-tracker/contracts";
import type {
  CompletionResult as DomainCompletionResult,
  ItemEdit as DomainItemEdit,
  RecurrenceRule as DomainRecurrenceRule,
  TodoItem,
} from "@task-tracker/core";
import type {
  AreaSnapshot as DomainAreaSnapshot,
  ItemNode,
  ItemSiblings,
} from "../services/area-snapshot.js";
import { projectPriorityLevel } from "./priority-level-projection.js";
import { projectEffectiveSettings } from "./settings-projection.js";

/** Parse the schema-validated floating strings for the domain without resolving a time zone. */
export function parseItemEdit(fields: typeof ItemEdit.Type): DomainItemEdit {
  return {
    ...fields,
    dueDate: fields.dueDate === null ? null : Temporal.PlainDate.from(fields.dueDate),
    dueTime: fields.dueTime === null ? null : Temporal.PlainTime.from(fields.dueTime),
    scheduledStart:
      fields.scheduledStart === null ? null : Temporal.PlainDateTime.from(fields.scheduledStart),
    scheduledEnd:
      fields.scheduledEnd === null ? null : Temporal.PlainDateTime.from(fields.scheduledEnd),
  };
}

/** Parse a wire rule's end date as a floating calendar date. */
export function parseRecurrence(
  rule: typeof RecurrenceRule.Type | null,
): DomainRecurrenceRule | null {
  if (rule === null) {
    return null;
  }
  return { ...rule, endDate: rule.endDate === null ? null : Temporal.PlainDate.from(rule.endDate) };
}

function projectRecurrence(rule: DomainRecurrenceRule | null): typeof RecurrenceRule.Type | null {
  return rule === null ? null : { ...rule, endDate: rule.endDate?.toString() ?? null };
}

/** Convert persisted Temporal values to their ISO representation. */
export function projectItem(item: TodoItem): typeof Item.Type {
  const { recurrenceSuccessorCreated: _successorCreated, ...fields } = item;
  return {
    ...fields,
    reminder: item.reminder,
    recurrence: projectRecurrence(item.recurrence),
    dueDate: item.dueDate?.toString() ?? null,
    dueTime: item.dueTime?.toString() ?? null,
    scheduledStart: item.scheduledStart?.toString() ?? null,
    scheduledEnd: item.scheduledEnd?.toString() ?? null,
    completedAtUtc: item.completedAtUtc?.toString() ?? null,
    createdAtUtc: item.createdAtUtc.toString(),
    updatedAtUtc: item.updatedAtUtc.toString(),
    deletedAtUtc: item.deletedAtUtc?.toString() ?? null,
  };
}

type WireItemSiblings = (typeof AreaSnapshot.Type)["items"];
type WireItemNode = WireItemSiblings["open"][number];

function projectItemNode(node: ItemNode): WireItemNode {
  return { ...node, item: projectItem(node.item), children: projectSiblings(node.children) };
}

function projectSiblings(siblings: ItemSiblings): WireItemSiblings {
  return {
    open: siblings.open.map(projectItemNode),
    finished: siblings.finished.map(projectItemNode),
  };
}

/** Convert an area's item tree and resolved settings to JSON-safe values. */
export function projectArea(snapshot: DomainAreaSnapshot): typeof AreaSnapshot.Type {
  return {
    ...snapshot,
    items: projectSiblings(snapshot.items),
    priorityLevels: snapshot.priorityLevels.map(projectPriorityLevel),
    settings: projectEffectiveSettings(snapshot.settings),
  };
}

/**
 * Preserve the approval set and convert applied timestamps for the client, with
 * the repeat messages the workspace shows (§7.11).
 */
export function projectCompletion(result: DomainCompletionResult): typeof CompletionResult.Type {
  if (result.kind !== "applied") {
    return result;
  }
  return {
    kind: "applied",
    changes: result.changes.map(({ itemId, completedAtUtc }) => ({
      itemId,
      completedAtUtc: completedAtUtc?.toString() ?? null,
    })),
    ...(result.lastRepeat === true ? { lastRepeat: true } : {}),
    ...(result.parentKeptOpenMessage === undefined
      ? {}
      : { parentKeptOpenMessage: result.parentKeptOpenMessage }),
  };
}
