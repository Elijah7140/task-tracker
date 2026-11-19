import { Link } from "@tanstack/react-router";
import type { MouseEvent, ReactNode } from "react";
import type { AppSettingsSearch } from "../app/router.js";
import { useReturnPageStore } from "../state/return-page-store.js";
import type { AreaTarget } from "../workspace/area-route.js";

function leaveCoveringPage(event: MouseEvent<HTMLAnchorElement>) {
  const { busy, uncover } = useReturnPageStore.getState();
  if (busy) {
    event.preventDefault();
  } else {
    uncover();
  }
}

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
}

const ROW_CLASS =
  "flex h-7 min-w-0 items-center gap-2 rounded-control px-2 text-fg-muted transition-colors hover:bg-hover hover:text-fg";

const CURRENT_CLASS =
  "aria-[current=page]:bg-pressed aria-[current=page]:font-medium aria-[current=page]:text-fg";

/** The shared sidebar row style, also used by rows that act instead of navigating. */
export const SIDEBAR_ROW_CLASS = `${ROW_CLASS} ${CURRENT_CLASS}`;

/**
 * A sidebar navigation row. The active route is marked with `aria-current="page"`
 * and highlighted unless a covering page such as Trash hides it. Search params, such as App
 * Settings' return project, do not affect it. Following a link leaves a covering
 * page, even for the route behind it, unless a change there is still running.
 */
export function SidebarLink({ target, icon, children, testId, exact = false }: SidebarLinkProps) {
  const covered = useReturnPageStore((state) => state.covering !== null);
  return (
    <Link
      {...target}
      activeOptions={{ exact, includeSearch: false }}
      onClick={leaveCoveringPage}
      data-testid={testId}
      data-covered={covered ? "" : undefined}
      className={covered ? ROW_CLASS : SIDEBAR_ROW_CLASS}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}
