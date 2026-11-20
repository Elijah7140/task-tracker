import { parseTransferUtc } from "../transfer-time-format.js";
import type { IssueList } from "../transfer-issue.js";

/** An absent timestamp is fine (the import time is used); a present one must be UTC with a trailing Z. */
export function checkTimestamp(text: string | null, path: string, issues: IssueList): void {
  if (text !== null && parseTransferUtc(text) === null) {
    issues.add(path, "Expected a UTC timestamp such as 2026-11-13T12:00:00Z.");
  }
}
