import {
  IssueList,
  ImportIndex,
  MetadataRuleError,
  type ExportDocument,
  type TransferSummary,
} from "@task-tracker/core";
import { importContents } from "./content-import.js";
import { importFields } from "./field-import.js";
import {
  type ImportContext,
  type ImportExisting,
  ImportMap,
  type ImportOutcome,
  type ImportPlan,
} from "./import-plan.js";
import { importLookups } from "./lookup-import.js";
import { importProjects } from "./project-import.js";
import { importSavedSearches } from "./saved-search-import.js";
import { importTicketLists } from "./ticket-list-import.js";

function emptyPlan(): ImportPlan {
  return {
    itemTypes: [],
    priorityLevels: [],
    statuses: [],
    projects: [],
    settings: [],
    fields: [],
    choices: [],
    folders: [],
    items: [],
    values: [],
    links: [],
    savedSearches: [],
    ticketLists: [],
    ticketDetails: [],
    comments: [],
  };
}

function planAll(context: ImportContext, existing: ImportExisting): TransferSummary | null {
  importLookups(context, existing);
  const projects = importProjects(context, existing);
  importFields(context, existing);
  importTicketLists(context, existing);
  if (context.issues.count > 0) {
    return null;
  }
  const contents = importContents(context, projects);
  const savedSearches = importSavedSearches(context, existing);
  return {
    projects: projects.length,
    folders: contents.reduce((sum, content) => sum + content.folders, 0),
    items: contents.reduce((sum, content) => sum + content.items.length, 0),
    savedSearches,
  };
}

/**
 * Plans a validated document as new rows against the existing ones (§7.9). Problems
 * that depend on this database, such as a field key used with another type or
 * thresholds made invalid by this computer's global settings, refuse the import.
 */
export function planJsonImport(
  document: ExportDocument,
  existing: ImportExisting,
  now: Temporal.Instant,
  newId: () => string,
): ImportOutcome {
  const issues = new IssueList();
  const context: ImportContext = {
    document,
    index: new ImportIndex(document),
    map: new ImportMap(),
    issues,
    plan: emptyPlan(),
    now,
    newId,
  };
  try {
    const summary = planAll(context, existing);
    return summary === null || issues.count > 0
      ? { kind: "refused", issues: issues.items }
      : { kind: "planned", plan: context.plan, summary };
  } catch (error) {
    if (error instanceof MetadataRuleError || error instanceof RangeError) {
      return { kind: "refused", issues: [{ path: "$", message: error.message }] };
    }
    throw error;
  }
}
