import type { AreaSnapshot, CompletionResult, Item, ItemEdit } from "@task-tracker/contracts";
import type {
  CompletionResult as DomainCompletionResult,
  ItemEdit as DomainItemEdit,
  TodoItem,
} from "@task-tracker/core";
import type { AreaSnapshot as DomainAreaSnapshot, ItemNode } from "../services/area-snapshot.js";
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

/** Convert persisted Temporal values to their ISO representation. */
export function projectItem(item: TodoItem): typeof Item.Type {
  return {
    ...item,
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

type WireItemNode = (typeof AreaSnapshot.Type)["items"][number];

function projectItemNode(node: ItemNode): WireItemNode {
  return { ...node, item: projectItem(node.item), children: node.children.map(projectItemNode) };
}

/** Convert an area's item tree and resolved settings to JSON-safe values. */
export function projectArea(snapshot: DomainAreaSnapshot): typeof AreaSnapshot.Type {
  return {
    ...snapshot,
    items: snapshot.items.map(projectItemNode),
    settings: projectEffectiveSettings(snapshot.settings),
  };
}

/** Preserve the approval set and convert applied timestamps for the client. */
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
  };
}
