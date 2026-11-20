import { trimText } from "@task-tracker/contracts";
import type { TransferIssue, TransferSummary } from "@task-tracker/contracts";

type Summary = typeof TransferSummary.Type;
type Issue = typeof TransferIssue.Type;

/** The title of every transfer failure notice. */
export const TRANSFER_TITLE = "Import and export";

/** How many issues a notice lists before it counts the rest (legacy rule). */
export const MAX_LISTED_ISSUES = 15;

const SUMMARY_PARTS: ReadonlyArray<{
  readonly key: keyof Summary;
  readonly singular: string;
  readonly plural: string;
}> = [
  { key: "projects", singular: "project", plural: "projects" },
  { key: "folders", singular: "folder", plural: "folders" },
  { key: "items", singular: "item", plural: "items" },
  { key: "savedSearches", singular: "saved search", plural: "saved searches" },
];

/** Characters Windows and Linux refuse in file names, plus control characters. */
// oxlint-disable-next-line no-control-regex -- control characters are exactly what it removes
const INVALID_FILE_NAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * Describes what an import file holds or an import created, such as
 * "1 project, 2 items". Zero counts are left out; nothing at all is "no data".
 */
export function describeTransferSummary(summary: Summary): string {
  const parts = SUMMARY_PARTS.filter(({ key }) => summary[key] > 0).map(
    ({ key, singular, plural }) => `${summary[key]} ${summary[key] === 1 ? singular : plural}`,
  );
  return parts.length === 0 ? "no data" : parts.join(", ");
}

/**
 * Lists import problems one per line as "path: message". After
 * {@link MAX_LISTED_ISSUES} lines the rest are counted as "...and N more.".
 */
export function describeTransferIssues(issues: ReadonlyArray<Issue>): string {
  const listed = issues
    .slice(0, MAX_LISTED_ISSUES)
    .map(({ path, message }) => `${path}: ${message}`);
  const remaining = issues.length - listed.length;
  return remaining > 0 ? [...listed, `...and ${remaining} more.`].join("\n") : listed.join("\n");
}

/**
 * The file name a project export suggests: the project name with characters
 * that file systems refuse replaced by "-", trimmed, plus ".json" or ".csv".
 */
export function projectExportFileName(
  projectName: string,
  extension: "json" | "csv" = "json",
): string {
  const safe = trimText(projectName.replace(INVALID_FILE_NAME_CHARACTERS, "-"));
  return `${safe === "" ? "project" : safe}.${extension}`;
}

/** The question asked before a JSON import adds a checked file's contents. */
export function importConfirmationMessage(summary: Summary, fileName: string): string {
  return (
    `Import ${describeTransferSummary(summary)} from ${fileName}?\n\n` +
    "Everything is added as new data; nothing you have is changed or overwritten. " +
    "An import can't be undone with Undo, so a backup of your database is saved first."
  );
}
