/**
 * Spreadsheet formula injection guards for text cells (§7.9). Excel runs a cell
 * that starts with `=`, `+`, `-`, `@`, a tab or a carriage return as a formula,
 * so an export puts an apostrophe in front and an import takes exactly that
 * apostrophe off again.
 */
const APOSTROPHE = "'";
const FORMULA_STARTS = "=+-@\t\r";

function isRisky(text: string): boolean {
  const rest = text.replace(/^'+/, "");
  return rest.length > 0 && FORMULA_STARTS.includes(rest[0]!);
}

/** Prefixes an apostrophe when the text, ignoring leading apostrophes, starts like a formula. */
export function protectCsvCell(text: string): string {
  return isRisky(text) ? APOSTROPHE + text : text;
}

/**
 * Removes the one apostrophe {@link protectCsvCell} adds. A leading apostrophe
 * not followed by a formula start (ignoring further apostrophes) is the user's own.
 */
export function unprotectCsvCell(text: string): string {
  const removable = text.length > 1 && text.startsWith(APOSTROPHE) && isRisky(text.slice(1));
  return removable ? text.slice(1) : text;
}
