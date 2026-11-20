import type { IssueList } from "../transfer-issue.js";
import type { FolderDocument } from "./export-document.js";
import { checkId, checkName, guidText, NAME_MAX_LENGTH } from "./import-checks.js";
import { firstById, formsCycle } from "./import-cycles.js";
import { elementPath } from "./json-path.js";
import { checkTimestamp } from "./timestamp-checks.js";

/** Checks one project's folders: names, parents in the same project and no cycles (§5.1). */
export class FolderValidator {
  constructor(
    private readonly issues: IssueList,
    private readonly seenFolderIds: Set<string>,
  ) {}

  validate(folders: readonly FolderDocument[], path: string): void {
    const byId = firstById(folders);
    folders.forEach((folder, position) =>
      this.#validateFolder(folder, elementPath(path, position), byId),
    );
  }

  #validateFolder(folder: FolderDocument, path: string, byId: ReadonlyMap<string, FolderDocument>) {
    checkId(folder.id, `${path}.id`, this.seenFolderIds, this.issues);
    checkName(folder.name, NAME_MAX_LENGTH, `${path}.name`, this.issues);
    checkTimestamp(folder.createdAtUtc, `${path}.createdAtUtc`, this.issues);
    checkTimestamp(folder.updatedAtUtc, `${path}.updatedAtUtc`, this.issues);
    const parentId = folder.parentFolderId;
    if (parentId === null) {
      return;
    }
    if (!byId.has(parentId)) {
      const message = `The parent folder ${guidText(parentId)} is not in this project.`;
      this.issues.add(`${path}.parentFolderId`, message);
    } else if (
      formsCycle(
        folder,
        byId,
        (other) => other.id,
        (other) => other.parentFolderId,
      )
    ) {
      this.issues.add(`${path}.parentFolderId`, "The folder would be inside itself.");
    }
  }
}
