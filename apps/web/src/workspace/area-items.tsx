import { useAtomMount, useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { AreaSnapshot } from "@task-tracker/contracts";
import { AsyncResult } from "effect/reactivity";
import { ListTodo } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { areaAtom, areaKey } from "../rpc/area-queries.js";
import { describeRpcFailure, type RpcFailure } from "../rpc/describe-rpc-failure.js";
import { globalSettingsAtom } from "../rpc/settings-queries.js";
import { urgencyRefreshAtom } from "../rpc/urgency-refresh.js";
import { Navigate } from "@tanstack/react-router";
import { AddItemDialog } from "../add/add-item-dialog.js";
import { useAddItemStore } from "../add/add-item-store.js";
import { ItemEditor } from "../editor/item-editor.js";
import { clearCompletedHere, useCompletedHereStore } from "../state/completed-here-store.js";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { closeItemEditorWithArea, dropStrayCarriedEditor } from "../state/item-editor-store.js";
import { LoadFailure } from "../ui/load-failure.js";
import { areaTarget } from "./area-route.js";
import type { Folder } from "./folder-outline.js";
import { ItemDetailsPanel } from "./item-details-panel.js";
import {
  EMPTY_SIBLINGS,
  findItemNode,
  findItemTitle,
  isEmptyLevel,
  itemAncestorIds,
  type ItemFocusRequest,
  type ItemSiblings,
} from "./item-outline.js";
import type { ItemRowLookups } from "./item-parts.js";
import { ItemTree } from "./item-tree.js";
import { ItemUndoBanner } from "./item-undo-banner.js";
import { keepCompletedInPlace } from "./keep-completed-in-place.js";
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
  /** The drilled-in item whose children show as cards, or null for the area (§7.19). */
  readonly itemId?: string | null | undefined;
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
  const priorities = new Map(snapshot.priorityLevels.map((level) => [level.id, level.label]));
  return {
    typeName: (typeId) => (typeId === null ? null : (types.get(typeId) ?? null)),
    priorityLevels: snapshot.priorityLevels,
    statuses: snapshot.statuses,
    priorityName: (levelId) => (levelId === null ? null : (priorities.get(levelId) ?? null)),
    itemTitle: (itemId) => findItemTitle(snapshot.items, itemId),
    timeZone,
  };
}

function EmptyArea({ drilledIn = false }: { readonly drilledIn?: boolean }) {
  return (
    <div
      data-testid="empty-area"
      className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-16 text-center text-fg-muted"
    >
      <ListTodo size={20} aria-hidden="true" />
      <p>{drilledIn ? "Nothing under this item yet." : "No items in this area yet."}</p>
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
  readonly folderId: string | null;
  readonly itemId: string | null;
  readonly area: AsyncResult.AsyncResult<typeof AreaSnapshot.Type, RpcFailure>;
  readonly areaName: string;
  readonly sectionKey: string;
  readonly timeZone: string;
  readonly hasFolders: boolean;
  readonly actions: ItemActions;
  readonly quickAdd: ReactNode;
  readonly onRetry: () => void;
}

/** The card grid for one level: the area's top level, or a drilled-in item's children. */
function LevelTree({
  snapshot,
  nodes,
  levelParentId,
  actions,
  quickAdd,
  ...props
}: Omit<AreaContentProps, "area" | "itemId" | "onRetry"> & {
  readonly snapshot: typeof AreaSnapshot.Type;
  readonly nodes: ItemSiblings;
  readonly levelParentId: string | null;
}) {
  if (isEmptyLevel(nodes)) {
    return (
      <div className="flex flex-col gap-3">
        {quickAdd}
        <EmptyArea drilledIn={levelParentId !== null} />
      </div>
    );
  }
  return (
    <ItemTree
      label={`Items in ${props.areaName}`}
      folderId={props.folderId}
      nodes={nodes}
      allNodes={snapshot.items}
      levelParentId={levelParentId}
      sectionKey={
        levelParentId === null ? props.sectionKey : `${props.sectionKey}:${levelParentId}`
      }
      cardColumns={snapshot.settings.workspaceCardColumns.value}
      lookups={lookupsFor(snapshot, props.timeZone)}
      actions={actions}
      hasFolders={props.hasFolders}
      quickAdd={quickAdd}
    />
  );
}

/**
 * A drilled-in item (§7.19): its children as the card grid and its details beside them. An
 * item that left the area, such as one deleted or moved elsewhere, returns to the area.
 */
function DrilledInItem(props: AreaContentProps & { readonly snapshot: typeof AreaSnapshot.Type }) {
  const { snapshot, itemId } = props;
  const node = itemId === null ? undefined : findItemNode(snapshot.items, itemId);
  if (node === undefined) {
    return <Navigate {...areaTarget(snapshot.projectId, snapshot.folderId)} replace />;
  }
  return (
    <div
      data-testid="drilled-in-item"
      className="grid grid-cols-[minmax(0,1fr)_22rem] items-start gap-6"
    >
      <LevelTree {...props} nodes={node.children} levelParentId={node.item.id} />
      <ItemDetailsPanel
        node={node}
        lookups={lookupsFor(snapshot, props.timeZone)}
        actions={props.actions}
      />
    </div>
  );
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
      props.itemId === null ? (
        <LevelTree
          {...props}
          snapshot={value}
          nodes={value.items}
          levelParentId={null}
          actions={actions}
          quickAdd={quickAdd}
        />
      ) : (
        <DrilledInItem
          {...props}
          area={area}
          snapshot={value}
          actions={actions}
          quickAdd={quickAdd}
        />
      ),
  });
}

/** Focuses a row that a move or search activation followed into this area, once rendered. */
function useFollowedRowFocus(
  key: string,
  items: ItemSiblings,
  onFocusItem: (request: ItemFocusRequest) => void,
) {
  const pending = useWorkspaceStore((state) => state.pendingRowFocus);
  useEffect(() => {
    if (pending === null || pending.areaKey !== key) {
      return;
    }
    const node = findItemNode(items, pending.itemId);
    if (node === undefined) {
      return;
    }
    const store = useWorkspaceStore.getState();
    store.setPendingRowFocus(null);
    for (const ancestorId of itemAncestorIds(items, node.item.id)) {
      const ancestor = findItemNode(items, ancestorId);
      if (ancestor?.isFinished) {
        store.setCompletedExpanded(ancestor.item.parentItemId ?? key, true);
      }
      store.setItemExpanded(ancestorId, true);
    }
    if (node.isFinished) {
      store.setCompletedExpanded(node.item.parentItemId ?? key, true);
    }
    store.selectItem(node.item.id);
    onFocusItem({ id: node.item.id });
  }, [pending, key, items, onFocusItem]);
}

/** The inline failure of the last pointer drop in this area (§7.5). */
function MoveError({ message }: { readonly message: string | null }) {
  if (message === null) {
    return null;
  }
  return (
    <p
      role="alert"
      data-testid="item-move-error"
      className="mb-2 rounded-control bg-danger-soft px-3 py-2 text-[13px] text-danger"
    >
      {message}
    </p>
  );
}

/** Loads an area and keeps its server urgency fresh with a once-a-minute reload. */
function useArea(projectId: string, folderId: string | null, itemId: string | null) {
  const atom = areaAtom(projectId, folderId);
  const loaded = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  const key = areaKey(projectId, folderId);
  useAtomMount(urgencyRefreshAtom(key));
  const area = useCompletedInPlace(loaded, `${key}:${itemId ?? ""}`);
  return { area, refresh, key };
}

/**
 * With Auto-hide completed off, keeps ToDos completed in this view in the open list
 * through later reloads (§6.2). Entering or leaving the view, such as drilling in or
 * out, forgets them, so they then show in Completed.
 */
function useCompletedInPlace(
  area: AsyncResult.AsyncResult<typeof AreaSnapshot.Type, RpcFailure>,
  viewKey: string,
) {
  const settings = useAtomValue(globalSettingsAtom);
  const autoHide = !AsyncResult.isSuccess(settings) || (settings.value.autoHideCompleted ?? true);
  const heldIds = useCompletedHereStore((state) => state.ids);
  useEffect(() => {
    clearCompletedHere();
    return clearCompletedHere;
  }, [viewKey]);
  return useMemo(
    () =>
      autoHide
        ? area
        : AsyncResult.map(area, (snapshot) => ({
            ...snapshot,
            items: keepCompletedInPlace(snapshot.items, heldIds),
          })),
    [area, autoHide, heldIds],
  );
}

/**
 * The open area's quick-add line and item tree. Reloads server urgency every
 * minute, supports Ctrl+N / Ctrl+Shift+N workspace shortcuts, and hosts the
 * floating item editor and the post-delete Undo banner. Falls back to the
 * project root when the folder was deleted elsewhere.
 */
export function AreaItems(props: AreaItemsProps) {
  const { projectId, folderId, focusQuickAddOnLoad = false } = props;
  const itemId = props.itemId ?? null;
  const { area, refresh, key } = useArea(projectId, folderId, itemId);
  const leavingMissingFolder = useMissingFolderFallback(area, projectId);
  const loaded = AsyncResult.isSuccess(area);
  const items = loaded ? area.value.items : EMPTY_SIBLINGS;
  const priorityLevels = loaded ? area.value.priorityLevels : [];
  const focus = useAreaFocus(items, loaded, focusQuickAddOnLoad);
  const [deletedBatch, setDeletedBatch] = useState<DeletedItemNotice | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const actions = useItemActions({
    ...props,
    levelParentId: itemId,
    items,
    priorityLevels,
    onFocusItem: focus.onFocusItem,
    onDeleted: setDeletedBatch,
    onMoveError: setMoveError,
  });
  useFollowedRowFocus(key, items, focus.onFocusItem);
  const banner = useUndoBannerHandlers(deletedBatch, setDeletedBatch, actions.restoreBatch, focus);
  useWorkspaceShortcuts({
    quickAddRef: focus.quickAddRef,
    items,
    addSubItem: actions.addSubItem,
    moveItemToArea: actions.moveItemToArea,
    pushBack: actions.pushBack,
  });

  const { quickAddRef } = focus;
  const observedDeletion = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded) {
      return;
    }
    const { selectedItemId, selectItem } = useWorkspaceStore.getState();
    if (selectedItemId !== null && findItemNode(items, selectedItemId) === undefined) {
      selectItem(null);
      if (document.activeElement === document.body) {
        quickAddRef.current?.focus();
      }
    }
  }, [loaded, items, quickAddRef]);

  useEffect(() => {
    if (!loaded || deletedBatch === null) {
      return;
    }
    // A delete can return before the area refresh removes its row.
    if (findItemNode(items, deletedBatch.itemId) === undefined) {
      observedDeletion.current = deletedBatch.batchId;
    } else if (observedDeletion.current === deletedBatch.batchId) {
      banner.dismiss();
    }
  }, [loaded, items, deletedBatch, banner]);

  // The editor belongs to this area; leaving the area closes it unless a move carries it along.
  useEffect(() => {
    dropStrayCarriedEditor(key);
    return () => closeItemEditorWithArea();
  }, [key]);

  // An add dialog adds to this area, so leaving it discards the dialog.
  useEffect(() => () => useAddItemStore.getState().close(), [key]);

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
      <MoveError message={moveError} />
      <div ref={focus.containerRef} className="contents">
        {leavingMissingFolder ? (
          <AreaSkeleton />
        ) : (
          <AreaContent
            folderId={folderId}
            itemId={itemId}
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
      {loaded ? <AddItemDialog snapshot={area.value} /> : null}
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
