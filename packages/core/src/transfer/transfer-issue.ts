/** One problem found in an import file, located by a JSON path or a CSV row (§7.9). */
export interface TransferIssue {
  readonly path: string;
  readonly message: string;
}

/** The issue as one line, for dialogs and logs: `path: message`. */
export function describeTransferIssue(issue: TransferIssue): string {
  return `${issue.path}: ${issue.message}`;
}

/** Collects the issues found while validating an import file, in the order found. */
export class IssueList {
  readonly #issues: TransferIssue[] = [];

  /** The issues recorded so far. */
  get items(): readonly TransferIssue[] {
    return this.#issues;
  }

  /** How many issues were recorded. */
  get count(): number {
    return this.#issues.length;
  }

  /** Records one problem at a JSON path. */
  add(path: string, message: string): void {
    this.#issues.push({ path, message });
  }
}
