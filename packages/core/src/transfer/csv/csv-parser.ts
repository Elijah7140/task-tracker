import type { TransferIssue } from "../transfer-issue.js";

/** One parsed record. `rowNumber` counts like a spreadsheet: the header is row 1. */
export interface CsvRecord {
  readonly rowNumber: number;
  readonly cells: readonly string[];
}

/** The records of a CSV file (blank lines left out) and the syntax problems found. */
export interface CsvTable {
  readonly records: readonly CsvRecord[];
  readonly issues: readonly TransferIssue[];
}

const isDelimiter = (character: string | undefined) =>
  character === "," || character === "\r" || character === "\n";

/** A cursor over the text of one file, collecting records and syntax issues. */
class CsvCursor {
  readonly issues: TransferIssue[] = [];
  position = 0;
  rowNumber = 0;

  constructor(readonly text: string) {}

  get atEnd(): boolean {
    return this.position >= this.text.length;
  }

  readRecord(): string[] {
    const cells: string[] = [];
    for (;;) {
      cells.push(this.readCell());
      if (this.atEnd) {
        return cells;
      }
      if (this.text[this.position] !== ",") {
        this.skipLineBreak();
        return cells;
      }
      this.position++;
    }
  }

  private readCell(): string {
    if (this.text[this.position] === '"') {
      return this.readQuotedCell();
    }
    const start = this.position;
    while (!this.atEnd && !isDelimiter(this.text[this.position])) {
      this.position++;
    }
    return this.text.slice(start, this.position);
  }

  private readQuotedCell(): string {
    let cell = "";
    this.position++;
    while (!this.atEnd) {
      const character = this.text[this.position++]!;
      if (character !== '"') {
        cell += character;
      } else if (this.text[this.position] === '"') {
        cell += '"';
        this.position++;
      } else {
        this.skipTextAfterClosingQuote();
        return cell;
      }
    }
    this.report("A quoted cell is never closed.");
    return cell;
  }

  private skipTextAfterClosingQuote() {
    if (this.atEnd || isDelimiter(this.text[this.position])) {
      return;
    }
    this.report("Unexpected text after the closing quote of a cell.");
    while (!this.atEnd && !isDelimiter(this.text[this.position])) {
      this.position++;
    }
  }

  private skipLineBreak() {
    const crlf = this.text[this.position] === "\r" && this.text[this.position + 1] === "\n";
    this.position += crlf ? 2 : 1;
  }

  private report(message: string) {
    this.issues.push({ path: `Row ${this.rowNumber}`, message });
  }
}

const isBlankLine = (cells: readonly string[]) => cells.length === 1 && cells[0] === "";

/**
 * Reads RFC 4180 text like the legacy `CsvParser`: quoted cells may hold commas,
 * doubled quotes and line breaks; records end with CRLF, LF or CR; leading byte
 * order marks and blank lines are ignored, though blank lines still count as rows.
 */
export function parseCsv(text: string): CsvTable {
  const cursor = new CsvCursor(text.replace(/^﻿+/, ""));
  const records: CsvRecord[] = [];
  while (!cursor.atEnd) {
    cursor.rowNumber++;
    const cells = cursor.readRecord();
    if (!isBlankLine(cells)) {
      records.push({ rowNumber: cursor.rowNumber, cells });
    }
  }
  return { records, issues: cursor.issues };
}
