import type { FieldDefinition } from "../../fields/field-definition.js";
import { nameKey, trimMetadataText } from "../../metadata/names.js";
import type { IssueList } from "../transfer-issue.js";
import {
  CSV_COLUMNS,
  CSV_COLUMNS_IGNORED_ON_IMPORT,
  csvFieldHeader,
  standardCsvColumn,
} from "./csv-columns.js";
import type { CsvImportContext } from "./csv-import-context.js";
import type { CsvRecord } from "./csv-parser.js";

/** A custom field's column in an import file. */
export interface CsvFieldColumn {
  readonly index: number;
  readonly field: FieldDefinition;
}

/** Maps the header row of an import file to item columns and custom fields, ignoring case. */
export class CsvHeader {
  readonly #standard = new Map<string, number>();
  readonly fieldColumns: CsvFieldColumn[] = [];
  readonly recognized: string[] = [];
  readonly unknown: string[] = [];
  readonly ignored: string[] = [];

  /**
   * @param columnCount The cells in the header row, blank ones included.
   * @param hasCustomLinksField True when a legacy export could have used the unsuffixed
   * Links column for a custom field.
   */
  private constructor(
    readonly columnCount: number,
    readonly hasCustomLinksField: boolean,
  ) {}

  /** A header with no columns, for a file without one. */
  static none(): CsvHeader {
    return new CsvHeader(0, false);
  }

  /** Reads the header record; problems are added to `issues` at Row 1. */
  static read(record: CsvRecord, context: CsvImportContext, issues: IssueList): CsvHeader {
    const linksKey = nameKey(CSV_COLUMNS.links);
    const hasLinksField = context.fields.some((field) => nameKey(field.displayName) === linksKey);
    const header = new CsvHeader(record.cells.length, hasLinksField);
    const seen = new Set<string>();
    record.cells.forEach((cell, index) => {
      const name = trimMetadataText(cell);
      if (name.length > 0) {
        header.#addColumn(name, index, context, seen, issues);
      }
    });
    if (header.indexOf(CSV_COLUMNS.title) < 0) {
      issues.add("Row 1", `The header needs a '${CSV_COLUMNS.title}' column.`);
    }
    return header;
  }

  /** The cell position of a fixed column, or -1 when the file lacks it. */
  indexOf(column: string): number {
    return this.#standard.get(column) ?? -1;
  }

  /** The untrimmed cell of a fixed column, or empty when the file lacks the column or cell. */
  cell(record: CsvRecord, column: string): string {
    const index = this.indexOf(column);
    return index >= 0 && index < record.cells.length ? record.cells[index]! : "";
  }

  /** The trimmed cell of a fixed column, as the preview shows it. */
  cellText(record: CsvRecord, column: string): string {
    return trimMetadataText(this.cell(record, column));
  }

  #addColumn(
    name: string,
    index: number,
    context: CsvImportContext,
    seen: Set<string>,
    issues: IssueList,
  ) {
    const key = nameKey(name);
    if (seen.has(key)) {
      issues.add("Row 1", `The column '${name}' appears more than once.`);
      return;
    }
    seen.add(key);
    const standard = standardCsvColumn(name);
    const field = context.fields.find(
      (candidate) => nameKey(csvFieldHeader(candidate.displayName)) === key,
    );
    if (standard !== undefined) {
      this.#addStandard(standard, index);
    } else if (field !== undefined) {
      this.fieldColumns.push({ index, field });
      this.recognized.push(name);
    } else {
      this.unknown.push(name);
    }
  }

  #addStandard(standard: string, index: number) {
    this.#standard.set(standard, index);
    const list = CSV_COLUMNS_IGNORED_ON_IMPORT.includes(standard) ? this.ignored : this.recognized;
    list.push(standard);
  }
}
