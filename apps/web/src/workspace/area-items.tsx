import { useAtomMount, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { AreaSnapshot } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { ListTodo } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { areaAtom, areaKey } from "../rpc/area-queries.js";
import { describeRpcFailure, type RpcFailure } from "../rpc/describe-rpc-failure.js";
import { urgencyRefreshAtom } from "../rpc/urgency-refresh.js";
import { ItemEditor } from "../editor/item-editor.js";
import { useItemEditorStore } from "../state/item-editor-store.js";
import { LoadFailure } from "../ui/load-failure.js";
import type { Folder } from "./folder-outline.js";
import { EMPTY_SIBLINGS, findItemTitle, isEmptyLevel, type ItemSiblings } from "./item-outline.js";
import type { ItemRowLookups } from "./item-row.js";
import { ItemTree } from "./item-tree.js";
import { ItemUndoBanner } from "./item-undo-banner.js";
import { QuickAddRow } from "./quick-add-row.js";
import { type DeletedItemNotice, type ItemActions, useItemActions } from "./use-item-actions.js";
import { useMissingFolderFallback } from "./use-missing-folder-fallback.js";
import { usePendingItemFocus } from "./use-pending-item-focus.js";
import { useWorkspaceShortcuts } from "./use-workspace-shortcuts.js";

/** Props for {@link AreaItems}. */
export interface AreaItemsProps {
  readonly projectId: string;
  readonly projectName: string;
  readonly folderId: string | null;
  readonly areaName: string;
  readonly folders: ReadonlyArray<Folder>;
  readonly timeZone: string;
  /** Focuses quick-add once the area loads, as when a project opens (legacy workspace). */
  readonly focusQuickAddOnLoad?: boolean | undefined;
}

/** A request to focus quick-add once it is rendered. */
interface QuickAddFocusRequest {
  /** Waits until the list has items, as after the first quick-add in an empty area. */
  readonly waitForNonEmpty: boolean;
  /** Drops the request if the user moves focus away from this element first. */
  readonly unlessFocusLeaves?: Element | null;
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
 * Focuses quick-add once it is rendered: when the project opens, and after a
 * quick-add, where the first item in an empty area swaps the empty state for
 * the tree.
 */
function useQuickAddFocus(
  quickAddRef: RefObject<HTMLInputElement | null>,
  focusOnLoad: boolean,
  areaIsEmpty: boolean,
  loaded: boolean,
) {
  const [request, setRequest] = useState<QuickAddFocusRequest | null>(() =>
    focusOnLoad ? { waitForNonEmpty: false, unlessFocusLeaves: document.activeElement } : null,
  );

  useEffect(() => {
    if (request === null || (request.waitForNonEmpty && areaIsEmpty)) {
      return;
    }
    if (quickAddRef.current === null) {
      return;
    }
    const { unlessFocusLeaves } = request;
    if (unlessFocusLeaves === undefined || document.activeElement === unlessFocusLeaves) {
      quickAddRef.current.focus();
    }
    setRequest(null);
  }, [request, areaIsEmpty, loaded, quickAddRef]);

  return setRequest;
}

/**
 * Undo and dismiss for the post-delete banner. Undo restores the batch. When
 * the banner closes while it holds focus, focus moves to quick-add instead of
 * the page body.
 */
function useUndoBannerHandlers(
  batch: DeletedItemNotice | null,
  setBatch: (batch: DeletedItemNotice | null) => void,
  restoreBatch: ItemActions["restoreBatch"],
  focus: Pick<AreaFocus, "quickAddRef" | "bannerRef">,
) {
  const dismiss = () => {
    if (focus.bannerRef.current?.contains(document.activeElement) === true) {
      focus.quickAddRef.current?.focus();
    }
    setBatch(null);
  };
  const undo = async () => {
    if (batch !== null) {
      setBatch(null);
      await restoreBatch(batch);
    }
  };
  return { undo, dismiss };
}

/** The elements and requests that keep keyboard focus in an area. */
type AreaFocus = ReturnType<typeof useAreaFocus>;

function useAreaFocus(items: ItemSiblings, loaded: boolean, focusQuickAddOnLoad: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const quickAddRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const requestQuickAddFocus = useQuickAddFocus(
    quickAddRef,
    focusQuickAddOnLoad,
    isEmptyLevel(items),
    loaded,
  );
  const onFocusItem = usePendingItemFocus({ containerRef, quickAddRef, nodes: items });
  return { containerRef, quickAddRef, bannerRef, requestQuickAddFocus, onFocusItem };
}

interface AreaContentProps {
  readonly area: AsyncResult.AsyncResult<typeof AreaSnapshot.Type, RpcFailure>;
  readonly areaName: string;
  readonly sectionKey: string;
  readonly timeZone: string;
  readonly hasFolders: boolean;
  readonly actions: ItemActions;
  readonly quickAdd: ReactNode;
  readonly onRetry: () => void;
}

/** The loading state, load failure, empty state or item tree of an area. */
function AreaContent({ area, actions, quickAdd, ...props }: AreaContentProps) {
  return AsyncResult.match(area, {
    onInitial: () => <AreaSkeleton />,
    onFailure: (failure) => (
      <LoadFailure
        message={describeRpcFailure(failure.cause)}
        onRetry={props.onRetry}
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
          label={`Items in ${props.areaName}`}
          nodes={value.items}
          sectionKey={props.sectionKey}
          lookups={lookupsFor(value, props.timeZone)}
          actions={actions}
          hasFolders={props.hasFolders}
          quickAdd={quickAdd}
        />
      ),
  });
}

/** Loads an area and keeps its server urgency fresh with a once-a-minute reload. */
function useArea(projectId: string, folderId: string | null) {
  const atom = areaAtom(projectId, folderId);
  const area = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  const key = areaKey(projectId, folderId);
  useAtomMount(urgencyRefreshAtom(key));
  return { area, refresh, key };
}

/**
 * The open area's quick-add line and item tree. Reloads server urgency every
 * minute, supports Ctrl+N / Ctrl+Shift+N workspace shortcuts, and hosts the
 * floating item editor and the post-delete Undo banner. Falls back to the
 * project root when the folder was deleted elsewhere.
 */
export function AreaItems(props: AreaItemsProps) {
  const { projectId, folderId, focusQuickAddOnLoad = false } = props;
  const { area, refresh, key } = useArea(projectId, folderId);
  const leavingMissingFolder = useMissingFolderFallback(area, projectId);
  const loaded = AsyncResult.isSuccess(area);
  const items = loaded ? area.value.items : EMPTY_SIBLINGS;
  const focus = useAreaFocus(items, loaded, focusQuickAddOnLoad);
  const [deletedBatch, setDeletedBatch] = useState<DeletedItemNotice | null>(null);
  const actions = useItemActions({
    ...props,
    items,
    onFocusItem: focus.onFocusItem,
    onDeleted: setDeletedBatch,
  });
  const banner = useUndoBannerHandlers(deletedBatch, setDeletedBatch, actions.restoreBatch, focus);
  useWorkspaceShortcuts({ quickAddRef: focus.quickAddRef, items, addSubItem: actions.addSubItem });

  // The editor belongs to this area; leaving the area closes it.
  useEffect(() => () => useItemEditorStore.getState().close(), []);

  const handleQuickAdd = async (title: string) => {
    const waitForNonEmpty = isEmptyLevel(items);
    const created = await actions.quickAdd(title);
    if (created) {
      focus.requestQuickAddFocus({ waitForNonEmpty });
    }
    return created;
  };

  return (
    <>
      <div ref={focus.containerRef} className="contents">
        {leavingMissingFolder ? (
          <AreaSkeleton />
        ) : (
          <AreaContent
            area={area}
            areaName={props.areaName}
            sectionKey={key}
            timeZone={props.timeZone}
            hasFolders={props.folders.length > 0}
            actions={actions}
            quickAdd={<QuickAddRow inputRef={focus.quickAddRef} onSubmit={handleQuickAdd} />}
            onRetry={refresh}
          />
        )}
      </div>
      {loaded ? <ItemEditor snapshot={area.value} onAddSubItem={actions.addSubItem} /> : null}
      {deletedBatch === null ? null : (
        <ItemUndoBanner
          batch={deletedBatch}
          bannerRef={focus.bannerRef}
          onUndo={banner.undo}
          onDismiss={banner.dismiss}
        />
      )}
    </>
  );
}
