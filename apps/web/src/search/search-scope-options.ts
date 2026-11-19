import type { SearchScope } from "@task-tracker/contracts";

/** How widely a search looks from the Search page (§7.2). */
export type SearchScopeKind = "all" | "project" | "root" | "folder";

/** A selectable scope option for the Search scope combobox. */
export interface SearchScopeOption {
  readonly value: SearchScopeKind;
  readonly label: string;
}

/** Builds the scope options available from the originating workspace context. */
export function buildSearchScopeOptions(
  originProjectId: string | null,
  originFolderId: string | null,
): ReadonlyArray<SearchScopeOption> {
  const options: Array<SearchScopeOption> = [{ value: "all", label: "All projects" }];
  if (originProjectId !== null) {
    options.push({ value: "project", label: "This project" });
    options.push({ value: "root", label: "Project root only" });
  }
  if (originProjectId !== null && originFolderId !== null) {
    options.push({ value: "folder", label: "This folder" });
  }
  return options;
}

/** Chooses the starting scope: folder > project > all projects (§7.2). */
export function defaultSearchScopeKind(
  originProjectId: string | null,
  originFolderId: string | null,
): SearchScopeKind {
  if (originProjectId === null) {
    return "all";
  }
  return originFolderId === null ? "project" : "folder";
}

/** Converts the UI scope selection into a wire {@link SearchScope}. */
export function toSearchScope(
  kind: SearchScopeKind,
  originProjectId: string | null,
  originFolderId: string | null,
  includeSubfolders: boolean,
): typeof SearchScope.Type {
  if (kind === "project" && originProjectId !== null) {
    return { kind: "project", projectId: originProjectId };
  }
  if (kind === "root" && originProjectId !== null) {
    return {
      kind: "area",
      projectId: originProjectId,
      folderId: null,
      includeSubfolders: false,
    };
  }
  if (kind === "folder" && originProjectId !== null && originFolderId !== null) {
    return {
      kind: "area",
      projectId: originProjectId,
      folderId: originFolderId,
      includeSubfolders,
    };
  }
  return { kind: "allProjects" };
}
