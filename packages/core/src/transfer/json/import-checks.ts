import type { FieldDataType } from "../../fields/field-data-type.js";
import { nameKey } from "../../metadata/names.js";
import { isBlankText, trimText } from "../../text/dotnet-white-space.js";
import type { IssueList } from "../transfer-issue.js";

/** The longest name, title, label or key the domain accepts, measured after trimming. */
export const NAME_MAX_LENGTH = 300;

/** The longest ticket number, measured after trimming. */
export const TICKET_NUMBER_MAX_LENGTH = 100;

/** The longest saved query text. */
export const QUERY_TEXT_MAX_LENGTH = 4000;

/** The shared .NET-style white-space helpers, under the names the validators use. */
export { isBlankText as isBlank, trimText };

/** Case-insensitive ordinal equality of two trimmed or untrimmed texts. */
export function sameText(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return left != null && right != null && nameKey(left) === nameKey(right);
}

/** A GUID as the legacy messages print it: lowercase with hyphens. */
export function guidText(id: string): string {
  return id.toLowerCase();
}

/** Checks that an id is present and unused so far; remembers it in `seen`. */
export function checkId(
  id: string | null,
  path: string,
  seen: Set<string>,
  issues: IssueList,
): void {
  if (id === null) {
    issues.add(path, "An id is required.");
  } else if (seen.has(id)) {
    issues.add(path, `The id ${guidText(id)} is used more than once.`);
  } else {
    seen.add(id);
  }
}

/** Checks a required name: not blank and at most `maxLength` characters once trimmed. */
export function checkName(
  value: string | null,
  maxLength: number,
  path: string,
  issues: IssueList,
): value is string {
  if (isBlankText(value)) {
    issues.add(path, "A value is required.");
    return false;
  }
  if (trimText(value!).length > maxLength) {
    issues.add(path, `The value must be ${maxLength} characters or fewer.`);
    return false;
  }
  return true;
}

const DATA_TYPES: readonly FieldDataType[] = ["Text", "Number", "Date", "Boolean", "Choice"];

/** Reads a field data type name such as `Choice`, ignoring case, or null. */
export function parseDataType(text: string | null): FieldDataType | null {
  return DATA_TYPES.find((type) => sameText(type, text === null ? null : trimText(text))) ?? null;
}

/** The legacy saved search scope names. */
export type ScopeKindName = "AllProjects" | "Project" | "Folder";

const SCOPE_KINDS: readonly ScopeKindName[] = ["AllProjects", "Project", "Folder"];

/** Reads a saved search scope name (AllProjects, Project or Folder), ignoring case, or null. */
export function parseScopeKind(text: string | null): ScopeKindName | null {
  return SCOPE_KINDS.find((kind) => sameText(kind, text === null ? null : trimText(text))) ?? null;
}

/** The legacy data type names in declaration order, for messages. */
export const DATA_TYPE_NAMES = DATA_TYPES.join(", ");
