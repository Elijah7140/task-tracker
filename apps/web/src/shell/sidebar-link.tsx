import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cx } from "../ui/class-names.js";
import type { AppSettingsSearch } from "../app/router.js";
import type { AreaTarget } from "../workspace/area-route.js";

/** A route the sidebar can link to. */
export type SidebarTarget =
  | { readonly to: "/" }
  | { readonly to: "/settings"; readonly search: AppSettingsSearch }
  | AreaTarget;

/** Props for {@link SidebarLink}. */
export interface SidebarLinkProps {
  readonly target: SidebarTarget;
  readonly icon: ReactNode;
  readonly children: ReactNode;
  readonly testId?: string | undefined;
  readonly exact?: boolean | undefined;
  /**
   * Marks the link as an item drop area: a folder ID, or `""` for a project
   * root. `dropActive` highlights it while a drag is over it (§7.5).
   */
  readonly dropArea?: string | undefined;
  readonly dropActive?: boolean | undefined;
}

const linkClass =
  "flex h-7 min-w-0 items-center gap-2 rounded-control px-2 text-fg-muted transition-colors hover:bg-hover hover:text-fg aria-[current=page]:bg-pressed aria-[current=page]:font-medium aria-[current=page]:text-fg";

/**
 * A sidebar navigation row. The active route is marked with `aria-current="page"`.
 * Search params, such as App Settings' return project, do not affect it.
 */
export function SidebarLink(props: SidebarLinkProps) {
  const { target, icon, children, testId, exact = false, dropArea, dropActive = false } = props;
  return (
    <Link
      {...target}
      activeOptions={{ exact, includeSearch: false }}
      data-testid={testId}
      data-item-drop-area={dropArea}
      data-drop-active={dropActive ? "true" : undefined}
      className={cx(
        linkClass,
        dropActive && "bg-accent-soft text-fg ring-1 ring-accent ring-inset",
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}
