import { useAtomMount, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { AreaSnapshot } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { ListTodo } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { areaAtom, areaKey } from "../rpc/area-queries.js";
import { describeRpcFailure } from "../rpc/describe-rpc-failure.js";
import { urgencyRefreshAtom } from "../rpc/urgency-refresh.js";
import { dialogStore } from "../state/dialog-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { LoadFailure } from "../ui/load-failure.js";
import type { Folder } from "./folder-outline.js";
import {
  EMPTY_SIBLINGS,
  findItemNode,
  findItemTitle,
  isEmptyLevel,
  type ItemFocusRequest,
} from "./item-outline.js";
import type { ItemRowLookups } from "./item-row.js";
import { ItemTree } from "./item-tree.js";
import { ItemUndoBanner } from "./item-undo-banner.js";
import { QuickAddRow } from "./quick-add-row.js";
import { type DeletedItemNotice, useItemActions } from "./use-item-actions.js";

/** Props for {@link AreaItems}. */
export interface AreaItemsProps {
  readonly projectId: string;
  readonly projectName: string;
  readonly folderId: string | null;
  readonly areaName: string;
  readonly folders: ReadonlyArray<Folder>;
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
 * The open area's quick-add line and item tree. Reloads server urgency every
 * minute, supports Ctrl+N / Ctrl+Shift+N workspace shortcuts, and hosts the
 * post-delete Undo banner.
 */
export function AreaItems({
  projectId,
  projectName,
  folderId,
  areaName,
  folders,
  timeZone,
}: AreaItemsProps) {
  const atom = areaAtom(projectId, folderId);
  const area = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  const key = areaKey(projectId, folderId);
  useAtomMount(urgencyRefreshAtom(key));

  const quickAddRef = useRef<HTMLInputElement>(null);
  const [pendingFocus, setPendingFocus] = useState<ItemFocusRequest | null>(null);
  const [pendingQuickAddFocus, setPendingQuickAddFocus] = useState<{
    readonly waitForNonEmpty: boolean;
  } | null>(null);
  const [deletedBatch, setDeletedBatch] = useState<DeletedItemNotice | null>(null);
  const items = AsyncResult.isSuccess(area) ? area.value.items : EMPTY_SIBLINGS;
  const areaIsEmpty = isEmptyLevel(items);

  const clearPendingFocus = useCallback(() => setPendingFocus(null), []);
  const actions = useItemActions({
    projectId,
    projectName,
    folderId,
    areaName,
    folders,
    items,
    onFocusItem: setPendingFocus,
    onDeleted: setDeletedBatch,
  });

  const latestItemsRef = useRef(items);
  latestItemsRef.current = items;
  const latestActionsRef = useRef(actions);
  latestActionsRef.current = actions;

  useEffect(() => {
    if (pendingQuickAddFocus === null || (pendingQuickAddFocus.waitForNonEmpty && areaIsEmpty)) {
      return;
    }
    if (quickAddRef.current !== null) {
      quickAddRef.current.focus();
      setPendingQuickAddFocus(null);
    }
  }, [pendingQuickAddFocus, areaIsEmpty]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || !(event.ctrlKey || event.metaKey)) {
        return;
      }
      if (dialogStore.getState().queue.length > 0 || event.key.toLowerCase() !== "n") {
        return;
      }
      if (event.shiftKey) {
        const selectedId = useWorkspaceStore.getState().selectedItemId;
        const selected =
          selectedId === null ? undefined : findItemNode(latestItemsRef.current, selectedId);
        if (selected !== undefined) {
          event.preventDefault();
          void latestActionsRef.current.addSubItem(selected);
        }
        return;
      }
      event.preventDefault();
      quickAddRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleQuickAdd = async (title: string) => {
    const waitForNonEmpty = areaIsEmpty;
    const created = await actions.quickAdd(title);
    if (created) {
      setPendingQuickAddFocus({ waitForNonEmpty });
    }
    return created;
  };

  const quickAdd = <QuickAddRow inputRef={quickAddRef} onSubmit={handleQuickAdd} />;

  return (
    <>
      {AsyncResult.match(area, {
        onInitial: () => <AreaSkeleton />,
        onFailure: (failure) => (
          <LoadFailure
            message={describeRpcFailure(failure.cause)}
            onRetry={refresh}
            testId="area-load-failure"
          />
        ),
        onSuccess: ({ value }) =>
          isEmptyLevel(value.items) ? (
            <div className="flex flex-col gap-3">
              {quickAdd}
              <EmptyArea />
            </div>
          ) : (
            <ItemTree
              label={`Items in ${areaName}`}
              nodes={value.items}
              sectionKey={key}
              lookups={lookupsFor(value, timeZone)}
              actions={actions}
              hasFolders={folders.length > 0}
              quickAdd={quickAdd}
              pendingFocus={pendingFocus}
              onFocusApplied={clearPendingFocus}
            />
          ),
      })}
      {deletedBatch === null ? null : (
        <ItemUndoBanner
          batch={deletedBatch}
          onUndo={async () => {
            const batch = deletedBatch;
            setDeletedBatch(null);
            await actions.restoreBatch(batch);
          }}
          onDismiss={() => setDeletedBatch(null)}
        />
      )}
    </>
  );
}
