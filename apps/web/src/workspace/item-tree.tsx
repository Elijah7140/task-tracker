import { ChevronRight } from "lucide-react";
import type { FocusEvent, MouseEvent } from "react";
import { useWorkspaceStore } from "../state/workspace-store.js";
import { cx } from "../ui/class-names.js";
import { handleTreeKeyDown, TREE_NODE_ATTRIBUTE } from "../ui/tree-keyboard.js";
import { treeStyles } from "../ui/tree-styles.js";
import { useRovingFocus } from "../ui/use-roving-focus.js";
import { type ItemNode, splitFinished } from "./item-outline.js";
import { ItemRow, type ItemRowLookups } from "./item-row.js";

const COMPLETED_PREFIX = "completed:";

/** Tree node ID of a Completed section, keyed by area key or parent item ID. */
const completedNodeId = (sectionKey: string) => `${COMPLETED_PREFIX}${sectionKey}`;

interface TreeContext {
  readonly lookups: ItemRowLookups;
  readonly expandedItems: ReadonlySet<string>;
  readonly expandedCompleted: ReadonlySet<string>;
  readonly selectedItemId: string | null;
  readonly tabIndexFor: (id: string) => number;
  readonly onItemFocus: (id: string) => void;
  readonly onSelect: (itemId: string) => void;
  readonly onExpandedChange: (nodeId: string, expanded: boolean) => void;
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
        lookups={context.lookups}
        onSelect={() => context.onSelect(id)}
        onExpandedChange={(next) => context.onExpandedChange(id, next)}
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

/** Props for {@link ItemTree}. */
export interface ItemTreeProps {
  readonly label: string;
  readonly nodes: ReadonlyArray<ItemNode>;
  /** Keys the area's Completed section, so its expansion is per area. */
  readonly sectionKey: string;
  readonly lookups: ItemRowLookups;
}

function useTreeState() {
  const store = useWorkspaceStore();
  const onExpandedChange = (nodeId: string, expanded: boolean) =>
    nodeId.startsWith(COMPLETED_PREFIX)
      ? store.setCompletedExpanded(nodeId.slice(COMPLETED_PREFIX.length), expanded)
      : store.setItemExpanded(nodeId, expanded);
  return { store, onExpandedChange };
}

/**
 * An area's items as an ARIA tree: open items first, then a collapsed
 * "Completed (n)" section, newest-completed first. Expanded parents show their
 * open sub-items and an "n completed" section. Selection follows focus.
 * Arrows move and expand. Expansion and selection last for the session.
 */
export function ItemTree({ label, nodes, sectionKey, lookups }: ItemTreeProps) {
  const { store, onExpandedChange } = useTreeState();
  const visible = visibleNodeIds(nodes, sectionKey, store);
  const { open, finished } = splitFinished(nodes);
  const firstId = open[0]?.item.id ?? (finished.length > 0 ? completedNodeId(sectionKey) : null);
  const selected = store.selectedItemId;
  const roving = useRovingFocus(
    selected !== null && visible.has(selected) ? selected : firstId,
    visible,
  );
  const context: TreeContext = {
    lookups,
    expandedItems: store.expandedItems,
    expandedCompleted: store.expandedCompleted,
    selectedItemId: selected,
    tabIndexFor: roving.tabIndexFor,
    onItemFocus: (id) => {
      roving.onItemFocus(id);
      if (!id.startsWith(COMPLETED_PREFIX)) {
        store.selectItem(id);
      }
    },
    onSelect: store.selectItem,
    onExpandedChange,
  };
  return (
    <ul
      role="tree"
      aria-label={label}
      data-testid="item-tree"
      onKeyDown={(event) => handleTreeKeyDown(event, { onExpandedChange })}
      className={treeStyles.group}
    >
      {open.map((node) => (
        <ItemBranch key={node.item.id} node={node} depth={0} context={context} />
      ))}
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
