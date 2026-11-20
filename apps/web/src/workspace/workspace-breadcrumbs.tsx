import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { type AreaTarget, areaTarget, type ItemTarget, itemTarget } from "./area-route.js";
import { type Folder, folderPath } from "./folder-outline.js";

/** Props for {@link WorkspaceBreadcrumbs}. */
export interface WorkspaceBreadcrumbsProps {
  readonly projectId: string;
  readonly projectName: string;
  readonly folders: ReadonlyArray<Folder>;
  readonly folderId: string | null;
  /** The drilled-in item and its ancestors, top-level first (§7.19). */
  readonly itemPath?: ReadonlyArray<{ readonly id: string; readonly title: string }> | undefined;
}

interface Crumb {
  readonly key: string;
  readonly name: string;
  readonly target: AreaTarget | ItemTarget | { readonly to: "/" };
}

const linkClass = "truncate rounded-[0.25rem] px-1 hover:bg-hover hover:text-fg";

function crumbs({
  projectId,
  projectName,
  folders,
  folderId,
  itemPath = [],
}: WorkspaceBreadcrumbsProps) {
  const path = folderId === null ? [] : folderPath(folders, folderId);
  const items = itemPath.map((item) => ({
    key: item.id,
    name: item.title,
    target: itemTarget(projectId, folderId, item.id),
  }));
  return [
    { key: "home", name: "Projects", target: { to: "/" } },
    { key: projectId, name: projectName, target: areaTarget(projectId, null) },
    ...path.map((folder) => ({
      key: folder.id,
      name: folder.name,
      target: areaTarget(projectId, folder.id),
    })),
    ...items,
  ] satisfies ReadonlyArray<Crumb>;
}

/**
 * The path to the open area: Projects, the project root, each folder, then each drilled-in
 * item (§7.19). Every segment except the current one opens its area or item.
 */
export function WorkspaceBreadcrumbs(props: WorkspaceBreadcrumbsProps) {
  const segments: ReadonlyArray<Crumb> = crumbs(props);
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 text-[13px] text-fg-subtle">
      <ol className="flex min-w-0 items-center gap-1">
        {segments.map((segment, index) => (
          <li key={segment.key} className="flex min-w-0 items-center gap-1">
            {index === 0 ? null : (
              <ChevronRight size={13} aria-hidden="true" className="shrink-0" />
            )}
            {index === segments.length - 1 ? (
              <span aria-current="page" className="truncate px-1 text-fg-muted">
                {segment.name}
              </span>
            ) : (
              <Link
                {...segment.target}
                data-testid={index === 0 ? "breadcrumb-projects" : "breadcrumb-link"}
                className={linkClass}
              >
                {segment.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
