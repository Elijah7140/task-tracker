/** The projects and area included in a search (§7.2). */
export type SearchScope =
  | { readonly kind: "allProjects" }
  | { readonly kind: "project"; readonly projectId: string }
  | {
      readonly kind: "area";
      readonly projectId: string;
      readonly folderId: string | null;
      readonly includeSubfolders: boolean;
    };

/** Returns the project targeted by `scope`, or null for an all-projects search. */
export function scopeProjectId(scope: SearchScope): string | null {
  return scope.kind === "allProjects" ? null : scope.projectId;
}
