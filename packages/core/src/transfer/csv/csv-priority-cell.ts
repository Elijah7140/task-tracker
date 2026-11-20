import { priorityLabel } from "../../lookups/priority-level.js";
import { trimMetadataText as trim } from "../../metadata/names.js";
import { CSV_COLUMNS } from "./csv-columns.js";
import type { CsvImportContext } from "./csv-import-context.js";
import {
  matchCsvPriorityLabel,
  matchCsvPriorityReference,
  writeCsvPriorityReference,
} from "./csv-priority-reference.js";

type Fail = (column: string, message: string) => void;

/**
 * Reads a row's priority (§7.15): the Priority reference cell when it has text,
 * otherwise the legacy Priority cell by name or label. An ambiguous, unknown or
 * archived priority records a problem; the result is the matched level's id.
 */
export function readCsvPriority(
  textCell: (column: string) => string,
  context: CsvImportContext,
  fail: Fail,
): string | null {
  const reference = trim(textCell(CSV_COLUMNS.priorityReference));
  const byReference = reference.length > 0;
  const column = byReference ? CSV_COLUMNS.priorityReference : CSV_COLUMNS.priority;
  const cell = byReference ? reference : trim(textCell(CSV_COLUMNS.priority));
  if (cell.length === 0) {
    return null;
  }
  const levels = context.priorityLevels;
  const matches = byReference
    ? matchCsvPriorityReference(cell, levels)
    : matchCsvPriorityLabel(cell, levels);
  if (matches.length > 1) {
    const advice = "In the Priority reference column, use #number or #name: followed by the name.";
    fail(column, `'${cell}' matches more than one priority. ${advice}`);
  } else if (matches.length === 0) {
    const active = levels.filter((level) => !level.isArchived);
    const valid = active.map(byReference ? writeCsvPriorityReference : priorityLabel);
    fail(column, `There is no priority matching '${cell}'. Use one of: ${valid.join(", ")}.`);
  } else if (matches[0]!.isArchived) {
    fail(column, `The priority '${cell}' is archived.`);
  }
  return matches.length === 1 ? matches[0]!.id : null;
}
