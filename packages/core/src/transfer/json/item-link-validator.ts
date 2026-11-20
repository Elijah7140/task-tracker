import { MAX_LINKS_PER_ITEM, validate } from "../../items/link-policy.js";
import type { IssueList } from "../transfer-issue.js";
import type { DocumentList, ItemLinkDocument } from "./export-document.js";
import { listOf } from "./export-document.js";
import { elementPath } from "./json-path.js";

/** Checks the optional links of one item with the editor's rules (§7.10). */
export function validateItemLinks(
  links: DocumentList<ItemLinkDocument>,
  path: string,
  issues: IssueList,
): void {
  const documents = listOf(links);
  if (documents.length > MAX_LINKS_PER_ITEM) {
    issues.add(path, `An item may have at most ${MAX_LINKS_PER_ITEM} links.`);
    return;
  }
  documents.forEach((link, position) => {
    const problem = validate(link.url, link.title);
    if (problem !== null) {
      issues.add(elementPath(path, position), problem);
    }
  });
}
