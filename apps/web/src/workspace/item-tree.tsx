import { ChevronRight } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { cx } from "../ui/class-names.js";
import { handleTreeKeyDown, TREE_NODE_ATTRIBUTE } from "../ui/tree-keyboard.js";
import { treeStyles } from "../ui/tree-styles.js";
import { useRovingFocus } from "../ui/use-roving-focus.js";
import { CardGrid } from "./card-grid.js";
import { computeCardMinHeight } from "./card-grid-layout.js";
import { ItemCard } from "./item-card.js";
import {
  canIndentNode,
  findItemNode,
  type ItemNode,
  type ItemSiblings,
  isEmptyLevel,
} from "./item-outline.js";
import type { ItemRowLookups } from "./item-parts.js";
import { ItemRow } from "./item-row.js";
import { buildPriorityGroups, type PriorityGroup } from "./priority-groups.js";
import { PrioritySection } from "./priority-section.js";
import type { ItemActions } from "./use-item-actions.js";
import { type ActiveItemDrag, type ItemDropPosition, useItemDrag } from "./use-item-drag.js";

const COMPLETED_PREFIX = "completed:";

/** Tree node ID of a Completed section, keyed by area key or parent item ID. */
const completedNodeId = (sectionKey: string) => `${COMPLETED_PREFIX}${sectionKey}`;

interface TreeContext {
  readonly allNodes: ItemSiblings;
  readonly cardColumns: number;
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
  readonly onStartDrag: (node: ItemNode, event: PointerEvent<HTMLElement>) => void;
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

/** A collapsed "Completed" section with finished cards at top level or rows inside a card (§6.2, §7.17). */
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
      className={cx(treeStyles.item, depth === 0 && "mt-1")}
    >
      <div
        data-tree-row=""
        data-testid="completed-section-toggle"
        onClick={toggle}
        className="flex h-8 cursor-default items-center gap-1.5 rounded-control pr-2 text-[13px] font-medium text-fg-muted hover:bg-hover hover:text-fg"
        style={{ paddingLeft: `${depth === 0 ? 0.25 : Math.max(0, depth - 1) * 0.75}rem` }}
      >
        <span aria-hidden="true" className={cx(treeStyles.chevron, expanded && "rotate-90")}>
          <ChevronRight size={14} />
        </span>
        <span id={`${nodeId}-label`}>{label}</span>
      </div>
      {expanded ? (
        depth === 0 ? (
          <div className="mt-2">
            <CardGrid preferredColumns={context.cardColumns} minRowHeight={0}>
              {nodes.map((node) => (
                <CardBranch key={node.item.id} node={node} context={context} />
              ))}
            </CardGrid>
          </div>
        ) : (
          <ItemGroup nodes={nodes} depth={depth + 1} context={context} />
        )
      ) : null}
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
  const { open, finished } = node.children;
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

/** The drop feedback a card shows: an edge beside it, or "Make sub-item" for a middle drop. */
function cardDropIndicator(dragState: ActiveItemDrag | null, id: string): ItemDropPosition | null {
  const target = dragState?.target;
  if (target?.kind === "card" && target.placement.targetId === id) {
    return target.placement.position;
  }
  return target?.kind === "row" && target.id === id ? target.position : null;
}

/**
 * One top-level item as a card. Its sub-item rows always show inside the card, so a card with
 * sub-items is an expanded tree item that Left does not collapse (§7.17).
 */
function CardBranch({ node, context }: { readonly node: ItemNode; readonly context: TreeContext }) {
  const { id } = node.item;
  const hasChildren = !isEmptyLevel(node.children);
  const selected = context.selectedItemId === id;
  return (
    <li
      role="treeitem"
      aria-level={1}
      aria-expanded={hasChildren ? true : undefined}
      aria-selected={selected}
      aria-labelledby={`item-title-${id}`}
      aria-describedby={`item-details-${id}`}
      tabIndex={context.tabIndexFor(id)}
      onFocus={ownFocus(id, context)}
      data-testid="item-tree-item"
      data-item-card-item="true"
      {...{ [TREE_NODE_ATTRIBUTE]: id }}
      className={cx(treeStyles.item, "min-w-0")}
    >
      <ItemCard
        node={node}
        selected={selected}
        menuOpen={context.menuFor === id}
        canIndent={canIndentNode(context.allNodes, node)}
        hasFolders={context.hasFolders}
        dragging={context.dragState?.sourceId === id}
        dropIndicator={cardDropIndicator(context.dragState, id)}
        lookups={context.lookups}
        actions={context.actions}
        onSelect={() => context.onSelect(id)}
        onMenuOpenChange={(open) => context.onMenuFor(open ? id : null)}
        onStartDrag={(event) => context.onStartDrag(node, event)}
      >
        {hasChildren ? <SubItems node={node} depth={1} context={context} /> : undefined}
      </ItemCard>
    </li>
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
  const hasChildren = !isEmptyLevel(node.children);
  const expanded = hasChildren && context.expandedItems.has(id);
  const selected = context.selectedItemId === id;
  const target = context.dragState?.target;
  const dropIndicator = target?.kind === "row" && target.id === id ? target.position : null;
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
        dragging={context.dragState?.sourceId === id}
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
  groups: ReadonlyArray<PriorityGroup>,
  finishedTopLevel: ReadonlyArray<ItemNode>,
  areaSectionKey: string,
  state: Pick<TreeContext, "expandedItems" | "expandedCompleted">,
) {
  const ids = new Set<string>();
  const visitSection = (
    sectionKey: string,
    finished: ReadonlyArray<ItemNode>,
    asCards: boolean,
  ) => {
    ids.add(completedNodeId(sectionKey));
    if (state.expandedCompleted.has(sectionKey)) {
      finished.forEach((node) => (asCards ? visitCard(node) : visitNested(node)));
    }
  };
  const visitNestedChildren = (node: ItemNode) => {
    node.children.open.forEach(visitNested);
    if (node.children.finished.length > 0) {
      visitSection(node.item.id, node.children.finished, false);
    }
  };
  function visitNested(node: ItemNode) {
    ids.add(node.item.id);
    if (state.expandedItems.has(node.item.id)) {
      visitNestedChildren(node);
    }
  }
  function visitCard(node: ItemNode) {
    ids.add(node.item.id);
    visitNestedChildren(node);
  }

  for (const group of groups) {
    group.cards.forEach(visitCard);
  }
  if (finishedTopLevel.length > 0) {
    visitSection(areaSectionKey, finishedTopLevel, true);
  }
  return ids;
}

const hasAnyModifier = (event: KeyboardEvent<HTMLElement>) =>
  event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;

const onlyModifier = (event: KeyboardEvent<HTMLElement>, modifier: "altKey" | "shiftKey") =>
  event[modifier] &&
  !(["altKey", "ctrlKey", "metaKey", "shiftKey"] as const).some(
    (other) => other !== modifier && event[other],
  );

/** Callbacks a focused row's keys trigger. */
interface RowKeyContext {
  readonly allNodes: ItemSiblings;
  readonly actions: ItemActions;
  readonly onMenuFor: (id: string) => void;
}

/**
 * Tab indents and Shift+Tab outdents, as in Notion, but only when that is
 * possible. Otherwise the key is left to the browser so focus can leave the
 * tree and the row is never a keyboard trap.
 */
function handleTabKey(node: ItemNode, event: KeyboardEvent<HTMLElement>, context: RowKeyContext) {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  if (event.shiftKey) {
    if (node.item.parentItemId === null) {
      return false;
    }
    void context.actions.outdentItem(node);
    return true;
  }
  if (!canIndentNode(context.allNodes, node)) {
    return false;
  }
  void context.actions.indentItem(node);
  return true;
}

/**
 * Alt+Right indents under the previous sibling and Alt+Left places a sub-item
 * after its parent (§7.5). The keys do nothing when that move is impossible.
 */
function handleAltIndentKey(
  node: ItemNode,
  event: KeyboardEvent<HTMLElement>,
  context: RowKeyContext,
) {
  if (event.key === "ArrowRight") {
    if (canIndentNode(context.allNodes, node)) {
      void context.actions.indentItem(node);
    }
    return true;
  }
  if (event.key === "ArrowLeft") {
    if (node.item.parentItemId !== null) {
      void context.actions.outdentItem(node);
    }
    return true;
  }
  return false;
}

/** Alt+Up/Down reorders, Alt+Left/Right outdents and indents, and Shift+F10 opens the actions menu. */
function handleModifiedKey(
  node: ItemNode,
  event: KeyboardEvent<HTMLElement>,
  context: RowKeyContext,
) {
  if (onlyModifier(event, "altKey") && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    void context.actions.reorderByOffset(node, event.key === "ArrowUp" ? -1 : 1);
    return true;
  }
  if (onlyModifier(event, "altKey") && handleAltIndentKey(node, event, context)) {
    return true;
  }
  if (onlyModifier(event, "shiftKey") && event.key === "F10") {
    context.onMenuFor(node.item.id);
    return true;
  }
  return false;
}

/** Unmodified Space, Enter, F2, Delete and the context-menu key. */
function handlePlainKey(node: ItemNode, event: KeyboardEvent<HTMLElement>, context: RowKeyContext) {
  if (hasAnyModifier(event)) {
    return false;
  }
  const { actions } = context;
  const plainKeys: Readonly<Record<string, () => void>> = {
    " ": () => void actions.toggleComplete(node),
    Enter: () => actions.editItem(node),
    F2: () => void actions.renameItem(node),
    Delete: () => void actions.deleteItem(node),
    ContextMenu: () => context.onMenuFor(node.item.id),
  };
  const run = plainKeys[event.key];
  run?.();
  return run !== undefined;
}

function handleRowKey(node: ItemNode, event: KeyboardEvent<HTMLElement>, context: RowKeyContext) {
  return (
    handleTabKey(node, event, context) ||
    handleModifiedKey(node, event, context) ||
    handlePlainKey(node, event, context)
  );
}

/** Enter or Space on a Completed section header toggles it. */
function handleSectionKey(
  id: string,
  event: KeyboardEvent<HTMLElement>,
  expandedCompleted: ReadonlySet<string>,
  onExpandedChange: (nodeId: string, expanded: boolean) => void,
) {
  if ((event.key !== "Enter" && event.key !== " ") || hasAnyModifier(event)) {
    return false;
  }
  onExpandedChange(id, !expandedCompleted.has(id.slice(COMPLETED_PREFIX.length)));
  return true;
}

function itemKeyHandler(
  context: RowKeyContext,
  expandedCompleted: ReadonlySet<string>,
  onExpandedChange: (nodeId: string, expanded: boolean) => void,
) {
  return (id: string, event: KeyboardEvent<HTMLElement>) => {
    if (id.startsWith(COMPLETED_PREFIX)) {
      return handleSectionKey(id, event, expandedCompleted, onExpandedChange);
    }
    const node = findItemNode(context.allNodes, id);
    return node === undefined ? false : handleRowKey(node, event, context);
  };
}

/** Marks where a promoted sub-item lands: after the area's last open top-level card. */
function RootEndIndicator() {
  return (
    <li role="none" aria-hidden="true" className="relative h-0">
      <span
        data-testid="drop-indicator"
        data-placement="root-end"
        className="pointer-events-none absolute -top-px right-2 left-2 h-0.5 rounded-full bg-accent"
      />
    </li>
  );
}

/** Items at the card level are cards, whose sub-items always show. */
function isCard(nodes: ItemSiblings, id: string, levelParentId: string | null) {
  return findItemNode(nodes, id)?.item.parentItemId === levelParentId;
}

/**
 * Tracks the item pane viewport height so about two open card rows fit at once (§7.17).
 * While a covering page hides the workspace the tree has no layout, so the height is
 * kept and measured again when the tree is shown.
 */
function useViewportMinRowHeight(treeRef: RefObject<HTMLUListElement | null>) {
  const [minRowHeight, setMinRowHeight] = useState(0);

  useEffect(() => {
    const tree = treeRef.current;
    const main = tree?.closest("main") ?? null;
    if (tree === null || main === null) {
      return;
    }
    const update = () => {
      if (tree.offsetParent === null) {
        return;
      }
      const headerHeight = Math.max(0, tree.offsetTop - main.offsetTop);
      setMinRowHeight(computeCardMinHeight(Math.max(0, main.clientHeight - headerHeight)));
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(main);
    observer.observe(tree);
    return () => observer.disconnect();
  }, [treeRef]);

  return minRowHeight;
}

/** Props for {@link ItemTree}. */
export interface ItemTreeProps {
  readonly label: string;
  /** The area's folder, or null for the project root, so drops onto it are ignored. */
  readonly folderId: string | null;
  /** The items shown as cards: the area's top level, or a drilled-in item's children. */
  readonly nodes: ItemSiblings;
  /** The whole area, for indent and keyboard lookups; defaults to `nodes`. */
  readonly allNodes?: ItemSiblings | undefined;
  /** The drilled-in item whose children are the cards, or null for the top level (§7.19). */
  readonly levelParentId?: string | null | undefined;
  /** Keys the area's Completed section, so its expansion is per area. */
  readonly sectionKey: string;
  /** Global "Cards per row" setting (1–8, default 4). */
  readonly cardColumns?: number | undefined;
  readonly lookups: ItemRowLookups;
  readonly actions: ItemActions;
  readonly hasFolders: boolean;
  readonly quickAdd?: ReactNode | undefined;
}

function useTreeState() {
  const store = useWorkspaceStore();
  const onExpandedChange = (nodeId: string, expanded: boolean) =>
    nodeId.startsWith(COMPLETED_PREFIX)
      ? store.setCompletedExpanded(nodeId.slice(COMPLETED_PREFIX.length), expanded)
      : store.setItemExpanded(nodeId, expanded);
  return { store, onExpandedChange };
}

/** Roving focus over the visible cards and rows, starting at the selection or first card. */
function useTreeRovingFocus(
  groups: ReadonlyArray<PriorityGroup>,
  finished: ReadonlyArray<ItemNode>,
  sectionKey: string,
  store: ReturnType<typeof useTreeState>["store"],
) {
  const visible = visibleNodeIds(groups, finished, sectionKey, store);
  const firstId =
    groups[0]?.cards[0]?.item.id ?? (finished.length > 0 ? completedNodeId(sectionKey) : null);
  const selected = store.selectedItemId;
  return useRovingFocus(selected !== null && visible.has(selected) ? selected : firstId, visible);
}

/** Builds the shared context every section, card and sub-item row reads. */
function useTreeContext(
  props: ItemTreeProps,
  groups: ReadonlyArray<PriorityGroup>,
  cardColumns: number,
  treeRef: RefObject<HTMLUListElement | null>,
  menu: { readonly menuFor: string | null; readonly setMenuFor: (id: string | null) => void },
) {
  const { nodes, actions } = props;
  const { store, onExpandedChange } = useTreeState();
  const roving = useTreeRovingFocus(groups, nodes.finished, props.sectionKey, store);
  const drag = useItemDrag({
    treeRef,
    folderId: props.folderId,
    nodes,
    levelParentId: props.levelParentId,
    groups,
    onDrop: (source, target) => void actions.dropItem(source, target),
  });
  const context: TreeContext = {
    allNodes: props.allNodes ?? nodes,
    cardColumns,
    lookups: props.lookups,
    actions,
    hasFolders: props.hasFolders,
    expandedItems: store.expandedItems,
    expandedCompleted: store.expandedCompleted,
    selectedItemId: store.selectedItemId,
    menuFor: menu.menuFor,
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
    onMenuFor: menu.setMenuFor,
    onStartDrag: drag.startDrag,
  };
  return {
    context,
    expandedCompleted: store.expandedCompleted,
    onExpandedChange,
    dropTarget: drag.dragState?.target ?? null,
  };
}

/**
 * An area's items as a priority-grouped card grid inside an ARIA tree (§7.17):
 * "No priority" first, then one section per priority level in level sort order,
 * quick-add below the open sections, and a collapsed "Completed (n)" section
 * whose finished items render as content-sized cards. Sub-items remain accessible
 * as nested rows inside each card.
 */
export function ItemTree(props: ItemTreeProps) {
  const { label, nodes, sectionKey, quickAdd, cardColumns = 4 } = props;
  const treeRef = useRef<HTMLUListElement>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const groups = buildPriorityGroups(nodes.open, props.lookups.priorityLevels);
  const minRowHeight = useViewportMinRowHeight(treeRef);
  const { context, expandedCompleted, onExpandedChange, dropTarget } = useTreeContext(
    props,
    groups,
    cardColumns,
    treeRef,
    { menuFor, setMenuFor },
  );
  const allNodes = props.allNodes ?? nodes;
  const rowKeys = { allNodes, actions: props.actions, onMenuFor: setMenuFor };
  const onItemKey = itemKeyHandler(rowKeys, expandedCompleted, onExpandedChange);
  const onKeyExpandedChange = (id: string, expanded: boolean) => {
    if (expanded || !isCard(allNodes, id, props.levelParentId ?? null)) {
      onExpandedChange(id, expanded);
    }
  };

  return (
    <ul
      ref={treeRef}
      role="tree"
      aria-label={label}
      data-testid="item-tree"
      onKeyDown={(event) =>
        handleTreeKeyDown(event, { onExpandedChange: onKeyExpandedChange, onItemKey })
      }
      className="flex list-none flex-col gap-5 p-0"
    >
      {groups.map((group) => (
        <PrioritySection
          key={group.priorityLevelId ?? "none"}
          group={group}
          preferredColumns={cardColumns}
          minRowHeight={minRowHeight}
          isDropTarget={
            dropTarget?.kind === "group" &&
            dropTarget.placement.priorityLevelId === group.priorityLevelId
          }
        >
          {group.cards.map((node) => (
            <CardBranch key={node.item.id} node={node} context={context} />
          ))}
        </PrioritySection>
      ))}
      {dropTarget?.kind === "root-end" ? <RootEndIndicator /> : null}
      {quickAdd === undefined ? null : <li role="none">{quickAdd}</li>}
      {nodes.finished.length === 0 ? null : (
        <CompletedBranch
          sectionKey={sectionKey}
          nodes={nodes.finished}
          depth={0}
          label={`Completed (${nodes.finished.length})`}
          context={context}
        />
      )}
    </ul>
  );
}
