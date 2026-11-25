/*
 * The frozen legacy-final fixtures still carry the item schedule that §7.4 removed.
 * These helpers take it out of a fixture's expected output, leaving every other byte
 * as legacy-final wrote it, so the parity tests keep checking everything else.
 */

const SCHEDULE_COLUMNS = ["Scheduled start", "Scheduled end"];

/** Splits CSV text into fields with their separators, leaving quoted line breaks inside fields. */
function* csvFields(text: string) {
  let start = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && (character === "," || character === "\r" || character === "\n")) {
      const separator = character === "\r" && text[index + 1] === "\n" ? "\r\n" : character!;
      yield { field: text.slice(start, index), separator };
      index += separator.length - 1;
      start = index + 1;
    }
  }
  if (start < text.length) {
    yield { field: text.slice(start), separator: "" };
  }
}

/** A CSV record as fields with the separator that ends each. */
export type CsvRecord = Array<{ field: string; separator: string }>;

/** Splits CSV text into records, keeping every field's separator so it can be rejoined. */
export function csvRecords(text: string): CsvRecord[] {
  const records: CsvRecord[] = [[]];
  for (const part of csvFields(text)) {
    records.at(-1)!.push(part);
    if (part.separator !== ",") {
      records.push([]);
    }
  }
  return records.filter((record) => record.length > 0);
}

/** Gives a repeating row with only a schedule its start date as the due date, as the migration did. */
function dateScheduleOnlyRepeat(record: CsvRecord, header: readonly string[]) {
  const cell = (name: string) => record[header.indexOf(name)];
  const [due, start, repeats] = [cell("Due date"), cell("Scheduled start"), cell("Repeats")];
  if (due?.field === "" && start?.field && repeats?.field) {
    due.field = start.field.slice(0, 10);
  }
}

/**
 * The CSV text as TypeScript writes it now: no schedule columns, and a repeating
 * row with only a schedule due on its start date. The BOM, quoting and line ends stay.
 */
export function withoutScheduleColumns(text: string): string {
  const [headerRecord, ...rows] = csvRecords(text);
  const header = headerRecord!.map(({ field }) => field.replace(/^\uFEFF/, ""));
  const dropped = new Set(SCHEDULE_COLUMNS.map((name) => header.indexOf(name)));
  return [headerRecord!, ...rows]
    .map((record, index) => {
      if (index > 0) {
        dateScheduleOnlyRepeat(record, header);
      }
      const kept = record.filter((_part, column) => !dropped.has(column));
      // A dropped last column ends the record: keep its line end on the new last field.
      kept.at(-1)!.separator = record.at(-1)!.separator;
      return kept.map(({ field, separator }) => field + separator).join("");
    })
    .join("");
}

const SCHEDULE_PROPERTY = /^( *)"scheduled(?:Start|End)": "([^"]*)",\r?\n/;

/** The lines of the object around line `at`, whose properties are indented by `indent`. */
function objectLines(lines: readonly string[], at: number, indent: string) {
  const opening = `${indent.slice(2)}{`;
  let first = at;
  while (first > 0 && !lines[first]!.startsWith(opening)) {
    first--;
  }
  let last = at;
  while (last < lines.length - 1 && !lines[last]!.startsWith(`${indent.slice(2)}}`)) {
    last++;
  }
  return lines.slice(first, last + 1);
}

/**
 * Exported JSON as TypeScript writes it now: no schedule properties (never the
 * last in an item), and a repeating item with only a schedule due on its start date.
 */
export function withoutScheduleProperties(text: string): string {
  const lines = text.split(/(?<=\n)/);
  return lines
    .map((line, at) => {
      const match = SCHEDULE_PROPERTY.exec(line);
      if (match === null) {
        return line;
      }
      const [, indent, value] = match as unknown as [string, string, string];
      const item = objectLines(lines, at, indent);
      const isUndatedRepeat =
        line.includes('"scheduledStart"') &&
        !item.some((other) => other.startsWith(`${indent}"dueDate"`)) &&
        item.some((other) => other.startsWith(`${indent}"recurrence": {`));
      const ending = line.endsWith("\r\n") ? "\r\n" : "\n";
      return isUndatedRepeat ? `${indent}"dueDate": "${value.slice(0, 10)}",${ending}` : "";
    })
    .join("");
}

interface PreviewIssue {
  readonly path: string;
}

interface Preview {
  readonly recognizedColumns: readonly string[];
  readonly unknownColumns: readonly string[];
  readonly sampleRows: ReadonlyArray<{ readonly rowNumber: number; readonly hasError: boolean }>;
  readonly issues: readonly PreviewIssue[];
}

const isScheduleIssue = ({ path }: PreviewIssue) =>
  SCHEDULE_COLUMNS.some((column) => path.endsWith(`, ${column}`));

const rowHasIssue = (issues: readonly PreviewIssue[], row: number) =>
  issues.some(({ path }) => path === `Row ${row}` || path.startsWith(`Row ${row},`));

/**
 * A legacy preview as it reads now: the schedule columns are unknown and their
 * cells raise no issues. In these inputs they precede every other unknown column.
 */
export function withoutSchedulePreview<T extends Preview>(preview: T): T {
  const issues = preview.issues.filter((issue) => !isScheduleIssue(issue));
  const schedule = preview.recognizedColumns.filter((name) => SCHEDULE_COLUMNS.includes(name));
  return {
    ...preview,
    recognizedColumns: preview.recognizedColumns.filter((name) => !schedule.includes(name)),
    unknownColumns: [...schedule, ...preview.unknownColumns],
    sampleRows: preview.sampleRows.map((row) => ({
      ...row,
      hasError:
        row.hasError &&
        (rowHasIssue(issues, row.rowNumber) || !rowHasIssue(preview.issues, row.rowNumber)),
    })),
    issues,
  };
}
