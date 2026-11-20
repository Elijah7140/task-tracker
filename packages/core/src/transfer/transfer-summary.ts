/** How much data an import file holds, or how much an import created (§7.9). */
export interface TransferSummary {
  readonly projects: number;
  readonly folders: number;
  readonly items: number;
  readonly savedSearches: number;
}

/** A summary with nothing in it. */
export const EMPTY_TRANSFER_SUMMARY: TransferSummary = {
  projects: 0,
  folders: 0,
  items: 0,
  savedSearches: 0,
};

function countPart(count: number, singular: string, plural: string): string[] {
  return count > 0 ? [`${count} ${count === 1 ? singular : plural}`] : [];
}

/** Describes a summary for messages: "2 projects, 3 folders, 5 items", or "no data". */
export function describeTransferSummary(summary: TransferSummary): string {
  const parts = [
    ...countPart(summary.projects, "project", "projects"),
    ...countPart(summary.folders, "folder", "folders"),
    ...countPart(summary.items, "item", "items"),
    ...countPart(summary.savedSearches, "saved search", "saved searches"),
  ];
  return parts.length === 0 ? "no data" : parts.join(", ");
}
