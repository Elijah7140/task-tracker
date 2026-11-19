import { useAtomMount, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { AreaSnapshot } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { ListTodo } from "lucide-react";
import { areaAtom, areaKey } from "../rpc/area-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { urgencyRefreshAtom } from "../rpc/urgency-refresh.js";
import { LoadFailure } from "../ui/load-failure.js";
import { findItemTitle } from "./item-outline.js";
import type { ItemRowLookups } from "./item-row.js";
import { ItemTree } from "./item-tree.js";

/** Props for {@link AreaItems}. */
export interface AreaItemsProps {
  readonly projectId: string;
  readonly folderId: string | null;
  readonly areaName: string;
  readonly timeZone: string;
}

function lookupsFor(snapshot: typeof AreaSnapshot.Type, timeZone: string): ItemRowLookups {
  const types = new Map(snapshot.itemTypes.map((type) => [type.id, type.name]));
  const priorities = new Map(snapshot.priorityLevels.map((level) => [level.id, level.name]));
  return {
    typeName: (typeId) => (typeId === null ? null : (types.get(typeId) ?? null)),
    priorityName: (levelId) => (levelId === null ? null : (priorities.get(levelId) ?? null)),
    itemTitle: (itemId) => findItemTitle(snapshot.items, itemId),
    timeZone,
  };
}

function EmptyArea() {
  return (
    <div
      data-testid="empty-area"
      className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-16 text-center text-fg-muted"
    >
      <ListTodo size={20} aria-hidden="true" />
      <p>No items in this area yet.</p>
    </div>
  );
}

function AreaSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading items"
      data-testid="area-loading"
      className="flex flex-col gap-1"
    >
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="h-9 animate-pulse rounded-control bg-hover" />
      ))}
    </div>
  );
}

/**
 * The open area's item tree. It reloads server urgency every minute while
 * shown, and keeps the last tree on screen while a reload is in flight.
 */
export function AreaItems({ projectId, folderId, areaName, timeZone }: AreaItemsProps) {
  const atom = areaAtom(projectId, folderId);
  const area = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  const key = areaKey(projectId, folderId);
  useAtomMount(urgencyRefreshAtom(key));

  return AsyncResult.match(area, {
    onInitial: () => <AreaSkeleton />,
    onFailure: (failure) => (
      <LoadFailure
        message={describeRpcFailure(failure.cause)}
        onRetry={refresh}
        testId="area-load-failure"
      />
    ),
    onSuccess: ({ value }) =>
      value.items.length === 0 ? (
        <EmptyArea />
      ) : (
        <ItemTree
          label={`Items in ${areaName}`}
          nodes={value.items}
          sectionKey={key}
          lookups={lookupsFor(value, timeZone)}
        />
      ),
  });
}
