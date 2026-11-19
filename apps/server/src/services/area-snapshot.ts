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

/** One active item with derived completion and urgency, and children in sibling order. */
export interface ItemNode {
  readonly item: TodoItem;
  readonly ownUrgency: Urgency;
  readonly displayedUrgency: DisplayedUrgency;
  readonly isFinished: boolean;
  readonly children: readonly ItemNode[];
}

/** The active tree and supporting data used to display one area. */
export interface AreaSnapshot {
  readonly projectId: string;
  readonly folderId: string | null;
  readonly items: readonly ItemNode[];
  readonly itemTypes: readonly ItemType[];
  readonly priorityLevels: readonly PriorityLevel[];
  readonly settings: EffectiveSettings;
}

/** Project active rows without altering their persisted sibling order. */
export function projectAreaItems(
  tree: ItemTree,
  settings: EffectiveSettings,
  now: Temporal.Instant,
  timeZone: string,
): readonly ItemNode[] {
  const thresholds = new UrgencyThresholds(
    settings.urgencyYellowThreshold.value,
    settings.urgencyRedThreshold.value,
  );
  const buildNode = (item: TodoItem): ItemNode => ({
    item,
    ownUrgency: calculateUrgency(item, now, timeZone, thresholds),
    displayedUrgency: calculateDisplayedUrgency(tree, item.id, now, timeZone, thresholds),
    isFinished: CompletionService.isFinished(tree, item.id),
    children: tree.children(item.id).map(buildNode),
  });

  return tree.children(null).map(buildNode);
}
