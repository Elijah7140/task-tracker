import type { FieldDefinition } from "../../fields/field-definition.js";
import type { ItemFieldValue } from "../../fields/item-field-value.js";
import { describeRecurrence } from "../../items/recurrence/recurrence-rule.js";
import type { TodoItem } from "../../items/todo-item.js";
import { priorityLabel } from "../../lookups/priority-level.js";
import { nameKey } from "../../metadata/names.js";
import type { ExportCatalogue, ProjectExportData } from "../json/export-source.js";
import { formatStjDouble } from "../json/stj-number.js";
import {
  formatTransferDate,
  formatTransferLocal,
  formatTransferTime,
  formatTransferUtc,
} from "../transfer-time-format.js";
import { protectCsvCell } from "./csv-cells.js";
import { csvFieldHeader, STANDARD_CSV_COLUMNS } from "./csv-columns.js";
import { orderCsvItems } from "./csv-item-order.js";
import { writeCsvPriorityReference } from "./csv-priority-reference.js";
import { ProjectCsvRows } from "./project-csv-rows.js";
import { writeCsv } from "./csv-writer.js";

/** One custom-field column; fields that share a display name share a column. */
interface FieldColumn {
  readonly header: string;
  readonly fieldIds: ReadonlySet<string>;
}

const optional = <T>(value: T | null, format: (value: T) => string) =>
  value === null ? "" : format(value);

function visibleFields(catalogue: ExportCatalogue, projects: readonly ProjectExportData[]) {
  const projectIds = new Set(projects.map((data) => data.project.id));
  const used = new Set(projects.flatMap((data) => data.values.map((v) => v.fieldDefinitionId)));
  const scopeRank = (field: FieldDefinition) => (field.projectId === null ? 0 : 1);
  return catalogue.fields
    .filter((field) => field.projectId === null || projectIds.has(field.projectId))
    .filter((field) => !field.isArchived || used.has(field.id))
    .toSorted(
      (left, right) => scopeRank(left) - scopeRank(right) || left.sortOrder - right.sortOrder,
    );
}

function fieldColumns(fields: readonly FieldDefinition[]): FieldColumn[] {
  const groups = new Map<string, { header: string; fieldIds: Set<string> }>();
  for (const field of fields) {
    const key = nameKey(field.displayName);
    const group = groups.get(key) ?? {
      header: csvFieldHeader(field.displayName),
      fieldIds: new Set(),
    };
    group.fieldIds.add(field.id);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Writes items as the flat CSV table of §7.9, using the catalogue to name what they reference. */
class CsvExporter {
  readonly #types: ReadonlyMap<string, string>;
  readonly #priorities: ReadonlyMap<string, ExportCatalogue["priorityLevels"][number]>;
  readonly #statuses: ReadonlyMap<string, string>;
  readonly #fields: ReadonlyMap<string, FieldDefinition>;
  readonly #choices: ReadonlyMap<string, string>;

  constructor(catalogue: ExportCatalogue) {
    this.#types = new Map(catalogue.itemTypes.map((type) => [type.id, type.name]));
    this.#priorities = new Map(catalogue.priorityLevels.map((level) => [level.id, level]));
    this.#statuses = new Map(catalogue.statuses.map((status) => [status.id, status.name]));
    this.#fields = new Map(catalogue.fields.map((field) => [field.id, field]));
    this.#choices = new Map(catalogue.choices.map((choice) => [choice.id, choice.label]));
  }

  itemRow(rows: ProjectCsvRows, item: TodoItem, columns: readonly FieldColumn[]): string[] {
    const priority =
      item.priorityLevelId === null ? null : this.#priorities.get(item.priorityLevelId)!;
    const lookup = (names: ReadonlyMap<string, string>, id: string | null) =>
      protectCsvCell(id === null ? "" : names.get(id)!);
    const cells = [
      protectCsvCell(item.title),
      protectCsvCell(item.description ?? ""),
      protectCsvCell(item.ticketNumber ?? ""),
      lookup(this.#types, item.itemTypeId),
      protectCsvCell(priority === null ? "" : priorityLabel(priority)),
      protectCsvCell(writeCsvPriorityReference(priority)),
      lookup(this.#statuses, item.statusId),
      optional(item.dueDate, formatTransferDate),
      optional(item.dueTime, formatTransferTime),
      optional(item.scheduledStart, formatTransferLocal),
      optional(item.scheduledEnd, formatTransferLocal),
      item.completedAtUtc === null ? "no" : "yes",
      optional(item.completedAtUtc, formatTransferUtc),
      protectCsvCell(rows.data.project.name),
      protectCsvCell(rows.folderPath(item)),
      protectCsvCell(rows.parentTitle(item)),
      rows
        .linksOf(item)
        .map((link) => link.url)
        .join(" "),
      optional(item.recurrence, describeRecurrence),
    ];
    return [...cells, ...columns.map((column) => this.#fieldCell(rows, item, column))];
  }

  #fieldCell(rows: ProjectCsvRows, item: TodoItem, column: FieldColumn): string {
    const value = rows.valuesOf(item).find((v) => column.fieldIds.has(v.fieldDefinitionId));
    return value === undefined ? "" : this.#formatValue(value);
  }

  #formatValue(value: ItemFieldValue): string {
    switch (this.#fields.get(value.fieldDefinitionId)!.dataType) {
      case "Text":
        return protectCsvCell(value.textValue ?? "");
      case "Number":
        return formatStjDouble(value.numberValue!);
      case "Date":
        return formatTransferDate(value.dateValue!);
      case "Boolean":
        return value.boolValue === true ? "yes" : "no";
      case "Choice":
        return protectCsvCell(this.#choices.get(value.choiceId!)!);
    }
  }
}

function selectItems(projects: readonly ProjectExportData[], itemOrder: readonly string[] | null) {
  if (itemOrder === null) {
    return projects.flatMap((data) => orderCsvItems(data).map((item) => ({ data, item })));
  }
  const byId = new Map(
    projects.flatMap((data) => data.items.map((item) => [item.id, { data, item }] as const)),
  );
  return itemOrder.flatMap((id) => byId.get(id) ?? []);
}

/**
 * Writes the items of the projects as CSV text (§7.9): the fixed columns, then
 * one column per custom field by display name. With `itemOrder` only those
 * items are written, in that order (a search result); items missing from the
 * projects, such as ones deleted since, are left out. Without it every item is
 * written, project by project, in screen order. Numbers are written like .NET
 * `ToString("R")`, which matches the JSON number format for every double.
 */
export function exportCsv(
  catalogue: ExportCatalogue,
  projects: readonly ProjectExportData[],
  itemOrder: readonly string[] | null,
): string {
  const columns = fieldColumns(visibleFields(catalogue, projects));
  const exporter = new CsvExporter(catalogue);
  const rowsByProject = new Map(
    projects.map((data) => [data.project.id, new ProjectCsvRows(data)]),
  );
  const header = [...STANDARD_CSV_COLUMNS, ...columns.map((column) => column.header)];
  const items = selectItems(projects, itemOrder).map(({ data, item }) =>
    exporter.itemRow(rowsByProject.get(data.project.id)!, item, columns),
  );
  return writeCsv([header, ...items]);
}
