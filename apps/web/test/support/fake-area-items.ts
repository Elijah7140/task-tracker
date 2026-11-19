import type { AreaSnapshot } from "@task-tracker/contracts";

type Snapshot = typeof AreaSnapshot.Type;
type WireItemNode = Snapshot["items"]["open"][number];

/** An item in the fake's stored tree, with children in persisted sibling order. */
export interface FakeItemNode extends Omit<WireItemNode, "children"> {
  readonly children: ReadonlyArray<FakeItemNode>;
}
export type FakeUrgency = FakeItemNode["ownUrgency"];

/** An item seeded into a fake area. Urgency and finished flags stand in for the server's rules. */
export interface SeedItem {
  readonly title: string;
  /** Plain description text, shown as a card preview (§7.17). */
  readonly description?: string;
  readonly ticketNumber?: string;
  readonly type?: "Change" | "Error" | "Discussion" | "Review";
  readonly priority?: "Critical" | "High" | "Medium" | "Low";
  /** A seeded workflow status. Completed items default to Completed. */
  readonly status?: FakeStatusName;
  readonly dueDate?: string;
  readonly dueTime?: string;
  readonly scheduledStart?: string;
  readonly scheduledEnd?: string;
  readonly completedAtUtc?: string;
  readonly urgency?: FakeUrgency;
  /** Overrides the displayed urgency, for example one rolled up from a sub-item. */
  readonly displayed?: { readonly value: FakeUrgency; readonly sourceTitle: string };
  readonly children?: ReadonlyArray<SeedItem>;
}

const TIMESTAMP = "2026-11-13T12:00:00Z";

const lookupId = (kind: number, sequence: number) =>
  `019A0000-0000-7000-8000-00000000${kind}${String(sequence).padStart(3, "0")}`;

const TYPES = ["Change", "Error", "Discussion", "Review"] as const;
const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;

const lookup = (name: string, index: number, kind: number) => ({
  id: lookupId(kind, index),
  name,
  colorKey: null,
  isBuiltIn: index < 3,
  isArchived: false,
  sortOrder: index,
});

const STATUSES = [
  ["Queued", "Open"],
  ["In progress", "Open"],
  ["Testing", "Open"],
  ["Completed", "Done"],
] as const;

/** A workflow status seeded by the status migration. */
export type FakeStatusName = (typeof STATUSES)[number][0];

/** The seeded Completed status, which completion assigns in the fake. */
export const COMPLETED_STATUS_ID = "019A0000-0000-7000-8000-000000000204";

const statusId = (name: FakeStatusName) =>
  `019A0000-0000-7000-8000-00000000020${STATUSES.findIndex(([seeded]) => seeded === name) + 1}`;

/** Seeded item types, priority levels and statuses, as the server returns them. */
export const FAKE_LOOKUPS = {
  itemTypes: TYPES.map((name, index) => ({ ...lookup(name, index, 1), iconKey: null })),
  priorityLevels: PRIORITIES.map((name, index) => ({
    ...lookup(name, index, 2),
    number: null,
    label: name,
  })),
  statuses: STATUSES.map(([name, kind], sortOrder) => ({
    id: statusId(name),
    name,
    kind,
    isArchived: false,
    sortOrder,
  })),
};

/**
 * Completes or reopens an item record and keeps its status in step, as the server does:
 * completing remembers the Open status and sets Completed, and reopening restores it.
 */
export function withCompletion<Item extends FakeItemNode["item"]>(
  item: Item,
  completedAtUtc: string | null,
  updatedAtUtc: string,
): Item {
  const wasDone = item.completedAtUtc !== null;
  const status =
    completedAtUtc === null
      ? { statusId: wasDone ? item.reopenStatusId : item.statusId, reopenStatusId: null }
      : wasDone
        ? { statusId: item.statusId, reopenStatusId: item.reopenStatusId }
        : { statusId: COMPLETED_STATUS_ID, reopenStatusId: item.statusId };
  return { ...item, ...status, completedAtUtc, updatedAtUtc };
}

const settings = {
  autoCompleteParents: { value: true, source: "Global" },
  urgencyYellowThreshold: { value: "2592000000000", source: "Global" },
  urgencyRedThreshold: { value: "864000000000", source: "Global" },
  workspaceCardColumns: { value: 4, source: "Global" },
} as const;

/** Builds server item nodes for one area, giving each item an ID from `nextId`. */
export class FakeAreaBuilder {
  constructor(
    private readonly projectId: string,
    private readonly folderId: string | null,
    private readonly nextId: () => string,
    private readonly baseUrgencies: Map<string, FakeUrgency> = new Map(),
  ) {}

  build(seeds: ReadonlyArray<SeedItem>): Array<FakeItemNode> {
    const nodes = seeds.map((seed, index) => this.node(seed, index, null));
    return nodes.map((node, index) => this.attribute(node, seeds[index]!, nodes));
  }

  /** Builds a single item node (and any seeded children) under `parentItemId`. */
  buildNode(seed: SeedItem, sortOrder: number, parentItemId: string | null): FakeItemNode {
    return this.node(seed, sortOrder, parentItemId);
  }

  private node(seed: SeedItem, sortOrder: number, parentItemId: string | null): FakeItemNode {
    const id = this.nextId();
    const baseUrgency = seed.urgency ?? "None";
    this.baseUrgencies.set(id, baseUrgency);
    const children = (seed.children ?? []).map((child, index) => this.node(child, index, id));
    const completedAtUtc = seed.completedAtUtc ?? null;
    const ownUrgency = completedAtUtc === null ? baseUrgency : "None";
    return {
      item: this.record(seed, id, parentItemId, sortOrder),
      ownUrgency,
      displayedUrgency: { value: ownUrgency, sourceDescendantId: null },
      isFinished: completedAtUtc !== null && children.every((child) => child.isFinished),
      children,
    };
  }

  private record(seed: SeedItem, id: string, parentItemId: string | null, sortOrder: number) {
    return {
      id,
      projectId: this.projectId,
      folderId: this.folderId,
      parentItemId,
      title: seed.title,
      description: seed.description ?? null,
      ticketNumber: seed.ticketNumber ?? null,
      itemTypeId: seed.type === undefined ? null : lookupId(1, TYPES.indexOf(seed.type)),
      priorityLevelId:
        seed.priority === undefined ? null : lookupId(2, PRIORITIES.indexOf(seed.priority)),
      dueDate: seed.dueDate ?? null,
      dueTime: seed.dueTime ?? null,
      scheduledStart: seed.scheduledStart ?? null,
      scheduledEnd: seed.scheduledEnd ?? null,
      sortOrder,
      createdAtUtc: TIMESTAMP,
      updatedAtUtc: TIMESTAMP,
      statusId:
        seed.status !== undefined
          ? statusId(seed.status)
          : seed.completedAtUtc === undefined
            ? null
            : COMPLETED_STATUS_ID,
      reopenStatusId: null,
      completedAtUtc: seed.completedAtUtc ?? null,
      deletedAtUtc: null,
      deletionBatchId: null,
    };
  }

  private attribute(
    node: FakeItemNode,
    seed: SeedItem,
    roots: ReadonlyArray<FakeItemNode>,
  ): FakeItemNode {
    const children = node.children.map((child, index) =>
      this.attribute(child, seed.children![index]!, roots),
    );
    if (seed.displayed === undefined) {
      return { ...node, children };
    }
    const source = findByTitle(roots, seed.displayed.sourceTitle);
    return {
      ...node,
      children,
      displayedUrgency: {
        value: seed.displayed.value,
        sourceDescendantId: source?.item.id ?? null,
      },
    };
  }
}

const URGENCY_RANK: Record<FakeUrgency, number> = {
  None: 0,
  Approaching: 1,
  Imminent: 2,
  Overdue: 3,
};

/** Recomputes sibling sortOrder, own/displayed urgency, and finished flags for an area tree. */
export function recomputeAreaTree(
  nodes: ReadonlyArray<FakeItemNode>,
  baseUrgencies: ReadonlyMap<string, FakeUrgency>,
  parentItemId: string | null = null,
): Array<FakeItemNode> {
  return nodes.map((node, index) => {
    const children = recomputeAreaTree(node.children, baseUrgencies, node.item.id);
    const completed = node.item.completedAtUtc !== null;
    const ownUrgency: FakeUrgency = completed
      ? "None"
      : (baseUrgencies.get(node.item.id) ?? "None");
    let bestUrgency = ownUrgency;
    let sourceDescendantId: string | null = null;
    for (const child of children) {
      if (URGENCY_RANK[child.displayedUrgency.value] > URGENCY_RANK[bestUrgency]) {
        bestUrgency = child.displayedUrgency.value;
        sourceDescendantId = child.displayedUrgency.sourceDescendantId ?? child.item.id;
      }
    }
    return {
      item: { ...node.item, parentItemId, sortOrder: index },
      ownUrgency,
      displayedUrgency: { value: bestUrgency, sourceDescendantId },
      isFinished: completed && children.every((child) => child.isFinished),
      children,
    };
  });
}

function findByTitle(nodes: ReadonlyArray<FakeItemNode>, title: string): FakeItemNode | undefined {
  for (const node of nodes) {
    const found = node.item.title === title ? node : findByTitle(node.children, title);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/**
 * Orders ISO UTC instants with differing fractional precision, such as
 * `12:00:00Z` and `12:00:00.5Z`, by padding the fraction.
 */
function instantSortKey(instant: string | null): string {
  const [whole = "", fraction = ""] = (instant ?? "").replace("Z", "").split(".");
  return `${whole}.${fraction.padEnd(9, "0")}`;
}

function newestCompletedFirst(left: FakeItemNode, right: FakeItemNode): number {
  const leftKey = instantSortKey(left.item.completedAtUtc);
  const rightKey = instantSortKey(right.item.completedAtUtc);
  return leftKey === rightKey ? 0 : leftKey < rightKey ? 1 : -1;
}

/**
 * Stands in for the server's Core partition (§6.2): open siblings keep their
 * order and finished branches follow newest-completed first, ties in sibling order.
 */
function projectSiblings(nodes: ReadonlyArray<FakeItemNode>): Snapshot["items"] {
  const project = (node: FakeItemNode): WireItemNode => ({
    ...node,
    children: projectSiblings(node.children),
  });
  return {
    open: nodes.filter((node) => !node.isFinished).map(project),
    finished: nodes
      .filter((node) => node.isFinished)
      .toSorted(newestCompletedFirst)
      .map(project),
  };
}

/** Wraps area items in the snapshot the LoadArea RPC returns. */
export function areaSnapshot(
  projectId: string,
  folderId: string | null,
  items: ReadonlyArray<FakeItemNode>,
  autoCompleteParents = true,
): Snapshot {
  return {
    projectId,
    folderId,
    items: projectSiblings(items),
    ...FAKE_LOOKUPS,
    settings: {
      ...settings,
      autoCompleteParents: { value: autoCompleteParents, source: "Global" },
    },
  };
}
