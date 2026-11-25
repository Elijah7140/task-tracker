/*
 * The frozen legacy-final fixtures still carry item types, which the owner removed on
 * 25 Nov 2026 (§12). These helpers take them out of a fixture's expected output, leaving
 * every other byte as legacy-final wrote it, so the parity tests keep checking the rest.
 */
import { csvRecords } from "./dropped-schedule.js";

const TYPE_COLUMN = "Type";

/** The CSV text without its Type column. The BOM, quoting and line ends stay. */
export function withoutTypeColumn(text: string): string {
  const [headerRecord, ...rows] = csvRecords(text);
  const header = headerRecord!.map(({ field }) => field.replace(/^﻿/, ""));
  const dropped = header.indexOf(TYPE_COLUMN);
  if (dropped < 0) {
    return text;
  }
  return [headerRecord!, ...rows]
    .map((record) => {
      const kept = record.filter((_part, column) => column !== dropped);
      if (dropped === 0 && kept[0] !== undefined) {
        kept[0].field = record[0]!.field.startsWith("﻿") ? `﻿${kept[0].field}` : kept[0].field;
      }
      kept.at(-1)!.separator = record.at(-1)!.separator;
      return kept.map(({ field, separator }) => field + separator).join("");
    })
    .join("");
}

/** The header names of a CSV file, in order. */
export function csvHeader(text: string): string[] {
  const [headerRecord] = csvRecords(text);
  return (headerRecord ?? []).map(({ field }) => field.replace(/^﻿/, "").trim());
}

/**
 * Exported JSON without item types: no root `itemTypes` list and no item `itemTypeId`
 * or `itemType`, neither of which is ever the last property of its object.
 */
export function withoutItemTypeProperties(text: string): string {
  const lines = text.split(/(?<=\n)/);
  const kept: string[] = [];
  let skippingUntil: string | null = null;
  for (const line of lines) {
    if (skippingUntil !== null) {
      if (line.startsWith(skippingUntil)) {
        skippingUntil = null;
      }
      continue;
    }
    if (/^ {2}"itemTypes": \[\],?\r?\n$/.test(line)) {
      continue;
    }
    if (/^ {2}"itemTypes": \[\r?\n$/.test(line)) {
      skippingUntil = "  ]";
      continue;
    }
    if (/^ *"itemType(?:Id)?": (?:"[^"]*"|null),\r?\n$/.test(line)) {
      continue;
    }
    kept.push(line);
  }
  return kept.join("");
}

interface PreviewIssue {
  readonly path: string;
}

interface Preview {
  readonly recognizedColumns: readonly string[];
  readonly ignoredColumns: readonly string[];
  readonly sampleRows: ReadonlyArray<{
    readonly rowNumber: number;
    readonly hasError: boolean;
    readonly type?: string;
  }>;
  readonly issues: readonly PreviewIssue[];
}

const isTypeIssue = ({ path }: PreviewIssue) => path.endsWith(`, ${TYPE_COLUMN}`);

const rowHasIssue = (issues: readonly PreviewIssue[], row: number) =>
  issues.some(({ path }) => path === `Row ${row}` || path.startsWith(`Row ${row},`));

/**
 * A legacy preview as it reads now: Type is an ignored column whose cells raise no issue,
 * listed among the ignored columns in header order, and sample rows show no type.
 */
export function withoutTypePreview<T extends Preview>(preview: T, header: readonly string[]): T {
  if (!preview.recognizedColumns.includes(TYPE_COLUMN)) {
    return {
      ...preview,
      sampleRows: preview.sampleRows.map(({ type: _type, ...row }) => row),
    };
  }
  const issues = preview.issues.filter((issue) => !isTypeIssue(issue));
  const position = (name: string) =>
    header.findIndex((cell) => cell.toLowerCase() === name.toLowerCase());
  return {
    ...preview,
    recognizedColumns: preview.recognizedColumns.filter((name) => name !== TYPE_COLUMN),
    ignoredColumns: [...preview.ignoredColumns, TYPE_COLUMN].toSorted(
      (left, right) => position(left) - position(right),
    ),
    sampleRows: preview.sampleRows.map(({ type: _type, ...row }) => ({
      ...row,
      hasError:
        row.hasError &&
        (rowHasIssue(issues, row.rowNumber) || !rowHasIssue(preview.issues, row.rowNumber)),
    })),
    issues,
  };
}
