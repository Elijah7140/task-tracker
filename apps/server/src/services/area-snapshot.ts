import {
  calculateDisplayedUrgency,
  calculateUrgency,
  CompletionService,
  UrgencyThresholds,
  type DisplayedUrgency,
  type EffectiveSettings,
  type ItemTree,
  type ItemType,
  type PriorityLevel,
  type TodoItem,
  type Urgency,
} from "@task-tracker/core";

/** One active item with derived completion and urgency, and its partitioned children. */
export interface ItemNode {
  readonly item: TodoItem;
  readonly ownUrgency: Urgency;
  readonly displayedUrgency: DisplayedUrgency;
  readonly isFinished: boolean;
  readonly children: ItemSiblings;
}

/** Open siblings in sibling order, then finished branches newest-completed first (§6.2). */
export interface ItemSiblings {
  readonly open: readonly ItemNode[];
  readonly finished: readonly ItemNode[];
}

/** The active tree and supporting data used to display one area. */
export interface AreaSnapshot {
  readonly projectId: string;
  readonly folderId: string | null;
  readonly items: ItemSiblings;
  readonly itemTypes: readonly ItemType[];
  readonly priorityLevels: readonly PriorityLevel[];
  readonly settings: EffectiveSettings;
}

/** Project active rows, letting Core split each level into open and finished siblings. */
export function projectAreaItems(
  tree: ItemTree,
  settings: EffectiveSettings,
  now: Temporal.Instant,
  timeZone: string,
): ItemSiblings {
  const thresholds = new UrgencyThresholds(
    settings.urgencyYellowThreshold.value,
    settings.urgencyRedThreshold.value,
  );
  const buildNode = (item: TodoItem): ItemNode => ({
    item,
    ownUrgency: calculateUrgency(item, now, timeZone, thresholds),
    displayedUrgency: calculateDisplayedUrgency(tree, item.id, now, timeZone, thresholds),
    isFinished: CompletionService.isFinished(tree, item.id),
    children: buildSiblings(item.id),
  });
  const buildSiblings = (parentId: string | null): ItemSiblings => {
    const { open, finished } = CompletionService.partitionSiblings(tree, parentId);
    return { open: open.map(buildNode), finished: finished.map(buildNode) };
  };

  return buildSiblings(null);
}
