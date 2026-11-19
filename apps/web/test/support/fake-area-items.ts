import type { AreaSnapshot } from "@task-tracker/contracts";

type Snapshot = typeof AreaSnapshot.Type;
type ItemNode = Snapshot["items"][number];
type Urgency = ItemNode["ownUrgency"];

/** An item seeded into a fake area. Urgency and finished flags stand in for the server's rules. */
export interface SeedItem {
  readonly title: string;
  readonly ticketNumber?: string;
  readonly type?: "Change" | "Error" | "Discussion" | "Review";
  readonly priority?: "Critical" | "High" | "Medium" | "Low";
  readonly dueDate?: string;
  readonly dueTime?: string;
  readonly scheduledStart?: string;
  readonly completedAtUtc?: string;
  readonly urgency?: Urgency;
  /** Overrides the displayed urgency, for example one rolled up from a sub-item. */
  readonly displayed?: { readonly value: Urgency; readonly sourceTitle: string };
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

/** Seeded item types and priority levels, as the server returns them. */
export const FAKE_LOOKUPS = {
  itemTypes: TYPES.map((name, index) => ({ ...lookup(name, index, 1), iconKey: null })),
  priorityLevels: PRIORITIES.map((name, index) => lookup(name, index, 2)),
};

const settings = {
  autoCompleteParents: { value: true, source: "Global" },
  urgencyYellowThreshold: { value: "2592000000000", source: "Global" },
  urgencyRedThreshold: { value: "864000000000", source: "Global" },
} as const;

/** Builds server item nodes for one area, giving each item an ID from `nextId`. */
export class FakeAreaBuilder {
  constructor(
    private readonly projectId: string,
    private readonly folderId: string | null,
    private readonly nextId: () => string,
  ) {}

  build(seeds: ReadonlyArray<SeedItem>): Array<ItemNode> {
    const nodes = seeds.map((seed, index) => this.node(seed, index, null));
    return nodes.map((node, index) => this.attribute(node, seeds[index]!, nodes));
  }

  private node(seed: SeedItem, sortOrder: number, parentItemId: string | null): ItemNode {
    const id = this.nextId();
    const children = (seed.children ?? []).map((child, index) => this.node(child, index, id));
    const completedAtUtc = seed.completedAtUtc ?? null;
    const ownUrgency = completedAtUtc === null ? (seed.urgency ?? "None") : "None";
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
      description: null,
      ticketNumber: seed.ticketNumber ?? null,
      itemTypeId: seed.type === undefined ? null : lookupId(1, TYPES.indexOf(seed.type)),
      priorityLevelId:
        seed.priority === undefined ? null : lookupId(2, PRIORITIES.indexOf(seed.priority)),
      dueDate: seed.dueDate ?? null,
      dueTime: seed.dueTime ?? null,
      scheduledStart: seed.scheduledStart ?? null,
      scheduledEnd: null,
      sortOrder,
      createdAtUtc: TIMESTAMP,
      updatedAtUtc: TIMESTAMP,
      completedAtUtc: seed.completedAtUtc ?? null,
      deletedAtUtc: null,
      deletionBatchId: null,
    };
  }

  private attribute(node: ItemNode, seed: SeedItem, roots: ReadonlyArray<ItemNode>): ItemNode {
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

function findByTitle(nodes: ReadonlyArray<ItemNode>, title: string): ItemNode | undefined {
  for (const node of nodes) {
    const found = node.item.title === title ? node : findByTitle(node.children, title);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/** Wraps area items in the snapshot the LoadArea RPC returns. */
export function areaSnapshot(
  projectId: string,
  folderId: string | null,
  items: ReadonlyArray<ItemNode>,
): Snapshot {
  return { projectId, folderId, items, ...FAKE_LOOKUPS, settings };
}
