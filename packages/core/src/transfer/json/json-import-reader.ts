import type { TransferIssue } from "../transfer-issue.js";
import { EMPTY_TRANSFER_SUMMARY, type TransferSummary } from "../transfer-summary.js";
import { decodeExportDocument } from "./document-decoder.js";
import {
  EXPORT_FORMAT_NAME,
  EXPORT_FORMAT_VERSION,
  type ExportDocument,
  listOf,
} from "./export-document.js";
import { validateImportDocument } from "./import-document-validator.js";
import { findMember, type JsonNode } from "./json-node.js";
import { JsonSyntaxError } from "./json-syntax-error.js";
import { findNullElements } from "./null-element-checker.js";
import { parseRelaxedJson } from "./relaxed-json-parser.js";

/**
 * The result of reading and validating an import file, before anything is
 * written. The file can be imported when `issues` is empty.
 */
export interface JsonImportCheck {
  readonly document: ExportDocument | null;
  readonly issues: readonly TransferIssue[];
  readonly summary: TransferSummary;
}

function failed(issues: readonly TransferIssue[]): JsonImportCheck {
  return { document: null, issues, summary: EMPTY_TRANSFER_SUMMARY };
}

function formatIssues(root: JsonNode): TransferIssue[] {
  const format = findMember(root, "format");
  if (format?.type !== "string" || format.value !== EXPORT_FORMAT_NAME) {
    const message = `This is not a Task Tracker export; 'format' must be "${EXPORT_FORMAT_NAME}".`;
    return [{ path: "$.format", message }];
  }
  return [];
}

function versionIssues(root: JsonNode): TransferIssue[] {
  const version = findMember(root, "version");
  const number =
    version?.type === "number" && /^-?\d+$/.test(version.raw) ? Number(version.raw) : NaN;
  if (!Number.isInteger(number) || number < -(2 ** 31) || number >= 2 ** 31) {
    return [{ path: "$.version", message: "The version must be a whole number." }];
  }
  if (number > EXPORT_FORMAT_VERSION) {
    const message =
      `This file was written by a newer version of Task Tracker (file version ${number}; ` +
      `this version reads version ${EXPORT_FORMAT_VERSION}). Update the application to import it.`;
    return [{ path: "$.version", message }];
  }
  return number < EXPORT_FORMAT_VERSION
    ? [{ path: "$.version", message: `File version ${number} is not supported.` }]
    : [];
}

function headerIssues(root: JsonNode): TransferIssue[] {
  if (root.type !== "object") {
    return [{ path: "$", message: "The file must contain one JSON object." }];
  }
  const issues = formatIssues(root);
  return issues.length > 0 ? issues : versionIssues(root);
}

function summarize(document: ExportDocument): TransferSummary {
  const projects = listOf(document.projects);
  return {
    projects: projects.length,
    folders: projects.reduce((sum, project) => sum + listOf(project.folders).length, 0),
    items: projects.reduce((sum, project) => sum + listOf(project.items).length, 0),
    savedSearches: listOf(document.savedSearches).length,
  };
}

function parse(text: string): JsonNode | TransferIssue {
  try {
    return parseRelaxedJson(text);
  } catch (error) {
    if (error instanceof JsonSyntaxError) {
      return { path: "$", message: error.message };
    }
    throw error;
  }
}

/**
 * Reads import text: a leading byte order mark is ignored, other formats and
 * versions are refused, then the whole document is checked (§7.9).
 */
export function readJsonImport(text: string): JsonImportCheck {
  const root = parse(text.replace(/^\uFEFF+/, ""));
  if ("path" in root) {
    return failed([root]);
  }
  const header = headerIssues(root);
  if (header.length > 0) {
    return failed(header);
  }
  const decoded = decodeExportDocument(root);
  if ("issue" in decoded) {
    return failed([decoded.issue]);
  }
  const nullElements = findNullElements(decoded.document);
  if (nullElements.length > 0) {
    return failed(nullElements);
  }
  const issues = validateImportDocument(decoded.document);
  return { document: decoded.document, issues, summary: summarize(decoded.document) };
}
