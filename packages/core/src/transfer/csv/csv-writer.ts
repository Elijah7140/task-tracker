/** Writes rows as RFC 4180 text: comma separated, CRLF line ends, quotes doubled (§7.9). */
const LINE_END = "\r\n";

function needsQuotes(cell: string): boolean {
  if (cell.length === 0) {
    return false;
  }
  const hasSpecialCharacter = /[,"\r\n]/.test(cell);
  const hasEdgeWhitespace = /^[ \t]|[ \t]$/.test(cell);
  return hasSpecialCharacter || hasEdgeWhitespace;
}

/**
 * Quotes a cell that holds a comma, quote or line break, or starts or ends with
 * a space or tab (which a reader might otherwise trim).
 */
export function escapeCsvCell(cell: string): string {
  return needsQuotes(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

/** Writes every row, each ending with CRLF. */
export function writeCsv(rows: Iterable<readonly string[]>): string {
  let text = "";
  for (const row of rows) {
    text += row.map(escapeCsvCell).join(",") + LINE_END;
  }
  return text;
}
