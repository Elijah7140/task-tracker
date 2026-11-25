import type { TransferIssue } from "../transfer-issue.js";

/** A row of the import file as written, shown in the preview with whether it has errors. */
export interface CsvPreviewRow {
  readonly rowNumber: number;
  readonly title: string;
  readonly priority: string;
  readonly dueDate: string;
  readonly hasError: boolean;
}

/**
 * What a CSV import would do (§7.9): how many rows, how the columns were
 * understood, the first rows and every problem with its row (the header is row 1).
 */
export interface CsvImportPreview {
  /** The item rows in the file; the header is not counted. */
  readonly rowCount: number;
  /** Header names that map to an item column or a custom field. */
  readonly recognizedColumns: readonly string[];
  /** Header names that match nothing; their cells are ignored. */
  readonly unknownColumns: readonly string[];
  /** Export context columns an import reads past. */
  readonly ignoredColumns: readonly string[];
  /** The first rows, so the user can check that the columns line up. */
  readonly sampleRows: readonly CsvPreviewRow[];
  /** Every problem, ordered by row; nothing is imported while there are any. */
  readonly issues: readonly TransferIssue[];
  /** True when the file has rows and no problems. */
  readonly canImport: boolean;
}
