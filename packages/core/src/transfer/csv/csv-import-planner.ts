import { IssueList, type TransferIssue } from "../transfer-issue.js";
import { CSV_COLUMNS } from "./csv-columns.js";
import { CsvHeader } from "./csv-header.js";
import type { CsvImportContext } from "./csv-import-context.js";
import type { CsvImportPreview, CsvPreviewRow } from "./csv-import-preview.js";
import type { CsvImportRow } from "./csv-import-row.js";
import { parseCsv, type CsvRecord } from "./csv-parser.js";
import { CsvRowReader } from "./csv-row-reader.js";

const SAMPLE_ROW_COUNT = 5;

/** The preview of an import file and the validated rows it would create. */
export interface CsvImportPlan {
  readonly preview: CsvImportPreview;
  readonly rows: readonly CsvImportRow[];
}

/** The row number in a `Row 4, Type` path, or 0 when there is none. */
function rowOf(path: string): number {
  const number = (path.split(" ")[1] ?? "").replace(/,+$/, "");
  return /^\d+$/.test(number) ? Number(number) : 0;
}

function createPreview(
  rowCount: number,
  header: CsvHeader,
  sampleRows: readonly CsvPreviewRow[],
  issues: IssueList,
): CsvImportPreview {
  const ordered: TransferIssue[] = issues.items.toSorted(
    (left, right) => rowOf(left.path) - rowOf(right.path),
  );
  return {
    rowCount,
    recognizedColumns: header.recognized,
    unknownColumns: header.unknown,
    ignoredColumns: header.ignored,
    sampleRows,
    issues: ordered,
    canImport: rowCount > 0 && ordered.length === 0,
  };
}

function sampleRow(record: CsvRecord, header: CsvHeader, isValid: boolean): CsvPreviewRow {
  return {
    rowNumber: record.rowNumber,
    title: header.cellText(record, CSV_COLUMNS.title),
    priority: header.cellText(record, CSV_COLUMNS.priority),
    dueDate: header.cellText(record, CSV_COLUMNS.dueDate),
    hasError: !isValid,
  };
}

function readRows(
  records: readonly CsvRecord[],
  header: CsvHeader,
  context: CsvImportContext,
  now: Temporal.Instant,
  issues: IssueList,
): CsvImportRow[] {
  return records.flatMap((record) => {
    if (record.cells.length > header.columnCount) {
      const counts = `${record.cells.length} cells but the header has ${header.columnCount} columns`;
      issues.add(`Row ${record.rowNumber}`, `The row has ${counts}.`);
    }
    const row = new CsvRowReader(header, context, now, record, issues).read();
    return row === null ? [] : [row];
  });
}

/** Reads the header, then every item row when the header is usable. */
function planRecords(
  records: readonly CsvRecord[],
  context: CsvImportContext,
  now: Temporal.Instant,
  issues: IssueList,
): CsvImportPlan {
  const problemsBeforeHeader = issues.count;
  const header = CsvHeader.read(records[0]!, context, issues);
  const dataRecords = records.slice(1);
  const headerIsValid = issues.count === problemsBeforeHeader;
  const rows = headerIsValid ? readRows(dataRecords, header, context, now, issues) : [];
  if (headerIsValid && dataRecords.length === 0) {
    issues.add("Row 2", "The file has a header but no item rows.");
  }
  const validRows = new Set(rows.map((row) => row.rowNumber));
  const sample = dataRecords
    .slice(0, SAMPLE_ROW_COUNT)
    .map((record) => sampleRow(record, header, validRows.has(record.rowNumber)));
  return { preview: createPreview(dataRecords.length, header, sample, issues), rows };
}

/**
 * Reads CSV import text against a target project like the legacy
 * `CsvImportPlanner` (§7.9): the preview, with every problem ordered by row, and
 * the validated rows to create. `now` completes rows marked completed without a
 * time. Nothing may be imported unless `preview.canImport`.
 */
export function planCsvImport(
  text: string,
  context: CsvImportContext,
  now: Temporal.Instant,
): CsvImportPlan {
  const table = parseCsv(text);
  const issues = new IssueList();
  table.issues.forEach((issue) => issues.add(issue.path, issue.message));
  if (table.records.length === 0) {
    issues.add("Row 1", "The file is empty; it needs a header row.");
    return { preview: createPreview(0, CsvHeader.none(), [], issues), rows: [] };
  }
  return planRecords(table.records, context, now, issues);
}
