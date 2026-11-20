import type { CsvImportPreview, TransferIssue } from "@task-tracker/contracts";

/** How many problems the CSV preview lists before counting the rest (legacy rule). */
export const MAX_PREVIEW_ISSUES = 30;

/** The text lines of the CSV import preview dialog (the legacy CsvImportPreviewViewModel). */
export interface CsvPreviewText {
  readonly heading: string;
  readonly target: string;
  readonly rowSummary: string;
  /** The columns that will be used, such as "Columns used: Title, Type". */
  readonly columns: string;
  /** Columns that match nothing, or null when there are none. */
  readonly unknownColumns: string | null;
  /** Export context columns that are read past, or null when there are none. */
  readonly ignoredColumns: string | null;
  /** The line under the table: ready, or why nothing will be imported. */
  readonly status: string;
  /** One line per problem, "Row 3, Type: …", limited so a bad file stays readable. */
  readonly issueLines: ReadonlyArray<string>;
}

const listed = (prefix: string, names: ReadonlyArray<string>) =>
  names.length === 0 ? null : `${prefix}: ${names.join(", ")}`;

function issueLines(issues: ReadonlyArray<typeof TransferIssue.Type>): string[] {
  const lines = issues
    .slice(0, MAX_PREVIEW_ISSUES)
    .map(({ path, message }) => `${path}: ${message}`);
  const rest = issues.length - lines.length;
  return rest > 0 ? [...lines, `...and ${rest} more.`] : lines;
}

/** Describes a CSV import preview for the target project (and folder) it would fill. */
export function csvPreviewText(
  preview: typeof CsvImportPreview.Type,
  targetName: string,
): CsvPreviewText {
  const rowSummary = preview.rowCount === 1 ? "1 row" : `${preview.rowCount} rows`;
  const columns =
    preview.recognizedColumns.length === 0 ? "none" : preview.recognizedColumns.join(", ");
  return {
    heading: `Import ${preview.fileName}`,
    target: `Into ${targetName}`,
    rowSummary,
    columns: `Columns used: ${columns}`,
    unknownColumns: listed("Not recognised and ignored", preview.unknownColumns),
    ignoredColumns: listed("Not imported (context only)", preview.ignoredColumns),
    status: preview.canImport
      ? `Ready to import ${rowSummary} as new items.`
      : "Nothing will be imported until the problems below are fixed in the file.",
    issueLines: issueLines(preview.issues),
  };
}
