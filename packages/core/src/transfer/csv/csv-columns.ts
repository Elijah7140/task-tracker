import { nameKey } from "../../metadata/names.js";

/** The fixed column headers of the CSV format (§7.9); custom fields add columns by display name. */
export const CSV_COLUMNS = {
  title: "Title",
  description: "Description",
  ticket: "Ticket",
  type: "Type",
  priority: "Priority",
  priorityReference: "Priority reference",
  status: "Status",
  dueDate: "Due date",
  dueTime: "Due time",
  scheduledStart: "Scheduled start",
  scheduledEnd: "Scheduled end",
  completed: "Completed",
  completedAt: "Completed at",
  project: "Project",
  folderPath: "Folder path",
  parentTitle: "Parent title",
  links: "Links",
  repeats: "Repeats",
} as const;

/** Every fixed column, in the order an export writes them. */
export const STANDARD_CSV_COLUMNS: readonly string[] = Object.values(CSV_COLUMNS);

/** Columns an export writes for context that an import recognises but does not use. */
export const CSV_COLUMNS_IGNORED_ON_IMPORT: readonly string[] = [
  CSV_COLUMNS.project,
  CSV_COLUMNS.folderPath,
  CSV_COLUMNS.parentTitle,
  CSV_COLUMNS.repeats,
];

const FIELD_SUFFIX = " (field)";

/** The fixed column a header names, ignoring case, or undefined. */
export function standardCsvColumn(name: string): string | undefined {
  const key = nameKey(name);
  return STANDARD_CSV_COLUMNS.find((column) => nameKey(column) === key);
}

function withoutFieldSuffixes(displayName: string): string {
  let baseName = displayName;
  while (nameKey(baseName).endsWith(nameKey(FIELD_SUFFIX))) {
    baseName = baseName.slice(0, -FIELD_SUFFIX.length);
  }
  return baseName;
}

/**
 * The header of a custom field's column. A display name that is a fixed column
 * name, or one followed by `(field)` suffixes, gets one more suffix, so every
 * field keeps the same header whichever other fields an export includes.
 */
export function csvFieldHeader(displayName: string): string {
  const isFixed = standardCsvColumn(withoutFieldSuffixes(displayName)) !== undefined;
  return isFixed ? displayName + FIELD_SUFFIX : displayName;
}
