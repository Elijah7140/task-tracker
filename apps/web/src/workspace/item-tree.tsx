import { ChevronRight } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { cx } from "../ui/class-names.js";
import { handleTreeKeyDown, TREE_NODE_ATTRIBUTE } from "../ui/tree-keyboard.js";
import { treeStyles } from "../ui/tree-styles.js";
import { useRovingFocus } from "../ui/use-roving-focus.js";
import {
  canIndentNode,
  findItemNode,
  type ItemFocusRequest,
  type ItemNode,
  splitFinished,
} from "./item-outline.js";
import { ItemRow, type ItemRowLookups } from "./item-row.js";
import type { ItemActions } from "./use-item-actions.js";
import { type ActiveItemDrag, useItemDrag } from "./use-item-drag.js";

const COMPLETED_PREFIX = "completed:";

/** Tree node ID of a Completed section, keyed by area key or parent item ID. */
const completedNodeId = (sectionKey: string) => `${COMPLETED_PREFIX}${sectionKey}`;

interface TreeContext {
  readonly allNodes: ReadonlyArray<ItemNode>;
  readonly lookups: ItemRowLookups;
  readonly actions: ItemActions;
  readonly hasFolders: boolean;
  readonly expandedItems: ReadonlySet<string>;
  readonly expandedCompleted: ReadonlySet<string>;
  readonly selectedItemId: string | null;
  readonly menuFor: string | null;
  readonly dragState: ActiveItemDrag | null;
  readonly tabIndexFor: (id: string) => number;
  readonly onItemFocus: (id: string) => void;
  readonly onSelect: (itemId: string) => void;
  readonly onExpandedChange: (nodeId: string, expanded: boolean) => void;
  readonly onMenuFor: (id: string | null) => void;
  readonly onStartDrag: (node: ItemNode, event: PointerEvent<HTMLButtonElement>) => void;
}

/** Calls `onFocus` only for the tree item itself, not for nested items. */
function ownFocus(id: string, context: TreeContext) {
  return (event: FocusEvent<HTMLLIElement>) => {
    if (event.target === event.currentTarget) {
      context.onItemFocus(id);
    }
  };
}

interface CompletedBranchProps {
  readonly sectionKey: string;
  readonly nodes: ReadonlyArray<ItemNode>;
  readonly depth: number;
  readonly label: string;
  readonly context: TreeContext;
}

/** A collapsed "Completed" section with its finished branches (§6.2). */
function CompletedBranch({ sectionKey, nodes, depth, label, context }: CompletedBranchProps) {
  const nodeId = completedNodeId(sectionKey);
  const expanded = context.expandedCompleted.has(sectionKey);
  const toggle = (event: MouseEvent) => {
    event.stopPropagation();
    context.onExpandedChange(nodeId, !expanded);
  };
  return (
    <li
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={expanded}
      aria-selected={false}
      aria-labelledby={`${nodeId}-label`}
      tabIndex={context.tabIndexFor(nodeId)}
      onFocus={ownFocus(nodeId, context)}
      data-testid="completed-section"
      {...{ [TREE_NODE_ATTRIBUTE]: nodeId }}
      className={cx(treeStyles.item, depth === 0 && "mt-3")}
    >
      <div
        data-tree-row=""
        data-testid="completed-section-toggle"
        onClick={toggle}
        className="flex h-8 cursor-default items-center gap-1.5 rounded-control pr-2 text-[13px] font-medium text-fg-muted hover:bg-hover hover:text-fg"
        style={{ paddingLeft: `${0.25 + depth * 1.5}rem` }}
      >
        <span aria-hidden="true" className={cx(treeStyles.chevron, expanded && "rotate-90")}>
          <ChevronRight size={14} />
        </span>
        <span id={`${nodeId}-label`}>{label}</span>
      </div>
      {expanded ? <ItemGroup nodes={nodes} depth={depth + 1} context={context} /> : null}
    </li>
  );
}

function ItemGroup({
  nodes,
  depth,
  context,
}: {
  readonly nodes: ReadonlyArray<ItemNode>;
  readonly depth: number;
  readonly context: TreeContext;
}) {
  return (
    <ul role="group" className={treeStyles.group}>
      {nodes.map((node) => (
        <ItemBranch key={node.item.id} node={node} depth={depth} context={context} />
      ))}
    </ul>
  );
}

function SubItems({
  node,
  depth,
  context,
}: {
  readonly node: ItemNode;
  readonly depth: number;
  readonly context: TreeContext;
}) {
  const { open, finished } = splitFinished(node.children);
  return (
    <ul role="group" className={treeStyles.group}>
      {open.map((child) => (
        <ItemBranch key={child.item.id} node={child} depth={depth} context={context} />
      ))}
      {finished.length === 0 ? null : (
        <CompletedBranch
          sectionKey={node.item.id}
          nodes={finished}
          depth={depth}
          label={`${finished.length} completed`}
          context={context}
        />
      )}
    </ul>
  );
}

function ItemBranch({
  node,
  depth,
  context,
}: {
  readonly node: ItemNode;
  readonly depth: number;
  readonly context: TreeContext;
}) {
  const { id } = node.item;
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && context.expandedItems.has(id);
  const selected = context.selectedItemId === id;
  const dropIndicator = context.dragState?.targetId === id ? context.dragState.placement : null;
  return (
    <li
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={selected}
      aria-labelledby={`item-title-${id}`}
      aria-describedby={`item-details-${id}`}
      tabIndex={context.tabIndexFor(id)}
      onFocus={ownFocus(id, context)}
      data-testid="item-tree-item"
      {...{ [TREE_NODE_ATTRIBUTE]: id }}
      className={treeStyles.item}
    >
      <ItemRow
        node={node}
        depth={depth}
        expanded={expanded}
        selected={selected}
        menuOpen={context.menuFor === id}
        canIndent={canIndentNode(context.allNodes, node)}
        hasFolders={context.hasFolders}
        dragging={context.dragState?.sourceId === id && context.dragState.targetId !== null}
        dropIndicator={dropIndicator}
        lookups={context.lookups}
        actions={context.actions}
        onSelect={() => context.onSelect(id)}
        onExpandedChange={(next) => context.onExpandedChange(id, next)}
        onMenuOpenChange={(open) => context.onMenuFor(open ? id : null)}
        onStartDrag={(event) => context.onStartDrag(node, event)}
      />
      {expanded ? <SubItems node={node} depth={depth + 1} context={context} /> : null}
    </li>
  );
}

function visibleNodeIds(
  nodes: ReadonlyArray<ItemNode>,
  areaSectionKey: string,
  state: Pick<TreeContext, "expandedItems" | "expandedCompleted">,
) {
  const ids = new Set<string>();
  const visitSection = (sectionKey: string, finished: ReadonlyArray<ItemNode>) => {
    ids.add(completedNodeId(sectionKey));
    if (state.expandedCompleted.has(sectionKey)) {
      finished.forEach(visitItem);
    }
  };
  const visitSiblings = (siblings: ReadonlyArray<ItemNode>, sectionKey: string) => {
    const { open, finished } = splitFinished(siblings);
    open.forEach(visitItem);
    if (finished.length > 0) {
      visitSection(sectionKey, finished);
    }
  };
  function visitItem(node: ItemNode) {
    ids.add(node.item.id);
    if (state.expandedItems.has(node.item.id)) {
      visitSiblings(node.children, node.item.id);
    }
  }
  visitSiblings(nodes, areaSectionKey);
  return ids;
}

const hasAnyModifier = (event: KeyboardEvent<HTMLElement>) =>
  event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;

function handleRowKey(
  node: ItemNode,
  event: KeyboardEvent<HTMLElement>,
  actions: ItemActions,
  onMenuFor: (id: string) => void,
): boolean {
  if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
    void (event.shiftKey ? actions.outdentItem(node) : actions.indentItem(node));
    return true;
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (event.key === "ArrowUp") {
      void actions.reorderByOffset(node, -1);
      return true;
    }
    if (event.key === "ArrowDown") {
      void actions.reorderByOffset(node, 1);
      return true;
    }
    return false;
  }
  if (event.shiftKey && event.key === "F10" && !event.ctrlKey && !event.altKey && !event.metaKey) {
    onMenuFor(node.item.id);
    return true;
  }
  if (hasAnyModifier(event)) {
    return false;
  }
  if (event.key === " ") {
    void actions.toggleComplete(node);
  } else if (event.key === "F2") {
    void actions.renameItem(node);
  } else if (event.key === "Delete") {
    void actions.deleteItem(node);
  } else if (event.key === "ContextMenu") {
    onMenuFor(node.item.id);
  } else {
    return false;
  }
  return true;
}

function itemKeyHandler(
  nodes: ReadonlyArray<ItemNode>,
  actions: ItemActions,
  expandedCompleted: ReadonlySet<string>,
  onExpandedChange: (nodeId: string, expanded: boolean) => void,
  onMenuFor: (id: string) => void,
) {
  return (id: string, event: KeyboardEvent<HTMLElement>) => {
    if (id.startsWith(COMPLETED_PREFIX)) {
      if ((event.key === "Enter" || event.key === " ") && !hasAnyModifier(event)) {
        const key = id.slice(COMPLETED_PREFIX.length);
        onExpandedChange(id, !expandedCompleted.has(key));
        return true;
      }
      return false;
    }
    const node = findItemNode(nodes, id);
    return node === undefined ? false : handleRowKey(node, event, actions, onMenuFor);
  };
}

/** Props for {@link ItemTree}. */
export interface ItemTreeProps {
  readonly label: string;
  readonly nodes: ReadonlyArray<ItemNode>;
  /** Keys the area's Completed section, so its expansion is per area. */
  readonly sectionKey: string;
  readonly lookups: ItemRowLookups;
  readonly actions: ItemActions;
  readonly hasFolders: boolean;
  readonly quickAdd?: ReactNode | undefined;
  readonly pendingFocus?: ItemFocusRequest | null | undefined;
  readonly onFocusApplied?: (() => void) | undefined;
}

function useTreeState() {
  const store = useWorkspaceStore();
  const onExpandedChange = (nodeId: string, expanded: boolean) =>
    nodeId.startsWith(COMPLETED_PREFIX)
      ? store.setCompletedExpanded(nodeId.slice(COMPLETED_PREFIX.length), expanded)
      : store.setItemExpanded(nodeId, expanded);
  return { store, onExpandedChange };
}

function isFocusReady(nodes: ReadonlyArray<ItemNode>, request: ItemFocusRequest): boolean {
  if (
    request.expectedParentId !== undefined &&
    findItemNode(nodes, request.id)?.item.parentItemId !== request.expectedParentId
  ) {
    return false;
  }
  return request.afterNodes === undefined || nodes !== request.afterNodes;
}

/**
 * An area's items as an ARIA tree: open items first, quick-add at the end of
 * the open list, then a collapsed "Completed (n)" section, newest-completed
 * first. Selection follows focus. Supports WAI-ARIA tree keys, Space/F2/Delete,
 * Alt+Up/Down reorder, Tab/Shift+Tab indent/outdent and pointer drag reorder.
 */
export function ItemTree({
  label,
  nodes,
  sectionKey,
  lookups,
  actions,
  hasFolders,
  quickAdd,
  pendingFocus = null,
  onFocusApplied,
}: ItemTreeProps) {
  const treeRef = useRef<HTMLUListElement>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const { store, onExpandedChange } = useTreeState();
  const visible = visibleNodeIds(nodes, sectionKey, store);
  const { open, finished } = splitFinished(nodes);
  const firstId = open[0]?.item.id ?? (finished.length > 0 ? completedNodeId(sectionKey) : null);
  const selected = store.selectedItemId;
  const roving = useRovingFocus(
    selected !== null && visible.has(selected) ? selected : firstId,
    visible,
  );
  const drag = useItemDrag({
    treeRef,
    onDrop: (parentItemId, sourceId, targetId, placement) =>
      void actions.reorderByDrop(parentItemId, sourceId, targetId, placement),
  });

  useEffect(() => {
    if (pendingFocus === null || !isFocusReady(nodes, pendingFocus)) {
      return;
    }
    const element = treeRef.current?.querySelector<HTMLElement>(
      `[${TREE_NODE_ATTRIBUTE}="${pendingFocus.id}"]`,
    );
    if (element !== null && element !== undefined) {
      element.focus();
      onFocusApplied?.();
    }
  }, [pendingFocus, nodes, onFocusApplied]);

  const context: TreeContext = {
    allNodes: nodes,
    lookups,
    actions,
    hasFolders,
    expandedItems: store.expandedItems,
    expandedCompleted: store.expandedCompleted,
    selectedItemId: selected,
    menuFor,
    dragState: drag.dragState,
    tabIndexFor: roving.tabIndexFor,
    onItemFocus: (id) => {
      roving.onItemFocus(id);
      if (!id.startsWith(COMPLETED_PREFIX)) {
        store.selectItem(id);
      }
    },
    onSelect: store.selectItem,
    onExpandedChange,
    onMenuFor: setMenuFor,
    onStartDrag: drag.startDrag,
  };
  const onItemKey = itemKeyHandler(
    nodes,
    actions,
    store.expandedCompleted,
    onExpandedChange,
    setMenuFor,
  );

  return (
    <ul
      ref={treeRef}
      role="tree"
      aria-label={label}
      data-testid="item-tree"
      onKeyDown={(event) => handleTreeKeyDown(event, { onExpandedChange, onItemKey })}
      className={treeStyles.group}
    >
      {open.map((node) => (
        <ItemBranch key={node.item.id} node={node} depth={0} context={context} />
      ))}
      {quickAdd === undefined ? null : <li role="none">{quickAdd}</li>}
      {finished.length === 0 ? null : (
        <CompletedBranch
          sectionKey={sectionKey}
          nodes={finished}
          depth={0}
          label={`Completed (${finished.length})`}
          context={context}
        />
      )}
    </ul>
  );
}
