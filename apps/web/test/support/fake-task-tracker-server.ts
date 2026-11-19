import {
  type FolderProjection,
  NotFound,
  RuleViolation,
  TaskTrackerRpcs,
  type ProjectSummary,
} from "@task-tracker/contracts";
import { Effect, Exit, Scope } from "effect";
import { HttpEffect } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import {
  areaSnapshot,
  FakeAreaBuilder,
  type FakeItemNode,
  type FakeUrgency,
  recomputeAreaTree,
  type SeedItem,
} from "./fake-area-items.js";
import {
  applyCreateItem,
  applyDeleteItem,
  applySetItemCompleted,
  type FakeAreaState,
  itemHandlers,
} from "./fake-item-operations.js";
import { customFieldHandlers, FakeCustomFields } from "./fake-custom-fields.js";
import { FakeSettingsAndLookups, settingsAndLookupHandlers } from "./fake-settings-lookups.js";

type Summary = typeof ProjectSummary.Type;
type Folder = typeof FolderProjection.Type;

/** A folder seeded into a fake project. `parent` names an earlier seeded folder. */
export interface SeedFolder {
  readonly name: string;
  readonly parent?: string;
  readonly items?: ReadonlyArray<SeedItem>;
}

/** A project seeded into the fake server, optionally with folders and root items. */
export interface SeedProject {
  readonly name: string;
  readonly openCount?: number;
  readonly overdueCount?: number;
  readonly autoCompleteParents?: boolean;
  readonly folders?: ReadonlyArray<SeedFolder>;
  readonly items?: ReadonlyArray<SeedItem>;
}

const TIMESTAMP = "2026-11-13T12:00:00Z";

const guid = (sequence: number) => `0190A1B2-0000-7000-8000-${String(sequence).padStart(12, "0")}`;

const notUsed = () => Effect.die(new Error("The web tests do not call this RPC."));

const areaKey = (projectId: string, folderId: string | null) =>
  `${projectId}:${folderId ?? "root"}`;

/**
 * In-memory project, folder and area data behind the real RPC server and JSON
 * serialization. It mirrors the server's rule messages for names, missing
 * projects and folders, and folder cycles.
 */
export class FakeProjectStore {
  summaries: Array<Summary> = [];
  folders: Array<Folder> = [];
  readonly calls: Array<string> = [];
  private readonly areas = new Map<string, FakeAreaState>();
  private readonly autoCompleteByProject = new Map<string, boolean>();
  private sequence = 0;
  private timestampSequence = 0;

  constructor(seed: ReadonlyArray<SeedProject> = []) {
    seed.forEach((project) => this.add(project));
  }

  /** Returns a new uppercase GUID. */
  nextId = () => {
    this.sequence += 1;
    return guid(this.sequence);
  };

  readonly settingsAndLookups = new FakeSettingsAndLookups(this.nextId);

  readonly customFields = new FakeCustomFields(this.nextId);

  /** Returns an increasing UTC ISO instant for deterministic newest-first ordering in tests. */
  nextTimestamp = () => {
    const offset = this.timestampSequence;
    this.timestampSequence += 1;
    const totalSeconds = 60 + offset;
    const hours = 12 + Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value: number) => String(value).padStart(2, "0");
    return `2026-11-13T${pad(hours)}:${pad(minutes)}:${pad(seconds)}Z`;
  };

  /** Whether auto-complete parents is enabled for `projectId`. */
  autoCompleteFor = (projectId: string) => this.autoCompleteByProject.get(projectId) ?? true;

  /** Adds a project as if another client had created it. */
  add({
    name,
    openCount = 0,
    overdueCount = 0,
    autoCompleteParents = true,
    folders = [],
    items = [],
  }: SeedProject): Summary {
    const project = {
      id: this.nextId(),
      name,
      description: null,
      sortOrder: this.summaries.length,
      createdAtUtc: TIMESTAMP,
      updatedAtUtc: TIMESTAMP,
    };
    const summary = { project, openCount, overdueCount };
    this.summaries.push(summary);
    this.autoCompleteByProject.set(project.id, autoCompleteParents);
    this.setItems(project.id, null, items);
    for (const folder of folders) {
      const parent = folder.parent === undefined ? null : this.folderNamed(folder.parent).id;
      const created = this.addFolder(project.id, parent, folder.name);
      this.setItems(project.id, created.id, folder.items ?? []);
    }
    return summary;
  }

  /** Adds a folder at the end of its siblings. */
  addFolder(projectId: string, parentFolderId: string | null, name: string): Folder {
    const siblings = this.folders.filter(
      (folder) => folder.projectId === projectId && folder.parentFolderId === parentFolderId,
    );
    const folder = {
      id: this.nextId(),
      projectId,
      parentFolderId,
      name,
      sortOrder: siblings.length,
      createdAtUtc: TIMESTAMP,
      updatedAtUtc: TIMESTAMP,
    };
    this.folders.push(folder);
    return folder;
  }

  /** Replaces an area's items, as if they had changed elsewhere or with time. */
  setItems(projectId: string, folderId: string | null, items: ReadonlyArray<SeedItem>) {
    const baseUrgencies = new Map<string, FakeUrgency>();
    const built = new FakeAreaBuilder(projectId, folderId, this.nextId, baseUrgencies).build(items);
    this.areas.set(areaKey(projectId, folderId), {
      nodes: built,
      baseUrgencies,
      deletedBatches: new Map(),
    });
  }

  /** Adds an active item to an area as if created externally. */
  addItem(
    projectId: string,
    folderId: string | null,
    seed: SeedItem,
    parentItemId: string | null = null,
  ): FakeItemNode {
    const state = Effect.runSync(this.requireArea(projectId, folderId));
    const created = Effect.runSync(
      applyCreateItem(this, state, projectId, folderId, parentItemId, seed.title),
    );
    if (seed.urgency !== undefined) {
      state.baseUrgencies.set(created.id, seed.urgency);
      state.nodes = recomputeAreaTree(state.nodes, state.baseUrgencies);
    }
    return this.findItemByTitle(projectId, folderId, created.title)!;
  }

  /** Completes or reopens an item as if edited externally. */
  completeItem(projectId: string, folderId: string | null, itemId: string, completed = true) {
    const state = Effect.runSync(this.requireArea(projectId, folderId));
    Effect.runSync(applySetItemCompleted(this, state, projectId, itemId, completed));
  }

  /** Deletes an item as if deleted externally. */
  deleteItem(projectId: string, folderId: string | null, itemId: string): string {
    const state = Effect.runSync(this.requireArea(projectId, folderId));
    return Effect.runSync(applyDeleteItem(this, state, projectId, itemId));
  }

  /** Finds an active item node in an area by title. */
  findItemByTitle(
    projectId: string,
    folderId: string | null,
    title: string,
  ): FakeItemNode | undefined {
    const state = this.areas.get(areaKey(projectId, folderId));
    if (state === undefined) {
      return undefined;
    }
    const visit = (nodes: ReadonlyArray<FakeItemNode>): FakeItemNode | undefined => {
      for (const node of nodes) {
        if (node.item.title === title) {
          return node;
        }
        const nested = visit(node.children);
        if (nested !== undefined) {
          return nested;
        }
      }
      return undefined;
    };
    return visit(state.nodes);
  }

  /** Returns sibling titles in saved `sortOrder` (including finished siblings). */
  areaSiblingTitles(
    projectId: string,
    folderId: string | null,
    parentItemId: string | null = null,
  ): ReadonlyArray<string> {
    const state = this.areas.get(areaKey(projectId, folderId));
    if (state === undefined) {
      return [];
    }
    if (parentItemId === null) {
      return state.nodes.map((node) => node.item.title);
    }
    const findParent = (nodes: ReadonlyArray<FakeItemNode>): FakeItemNode | undefined => {
      for (const node of nodes) {
        if (node.item.id === parentItemId) {
          return node;
        }
        const nested = findParent(node.children);
        if (nested !== undefined) {
          return nested;
        }
      }
      return undefined;
    };
    return (findParent(state.nodes)?.children ?? []).map((node) => node.item.title);
  }

  /** Returns all active area states. */
  allAreas = () => [...this.areas.values()];

  /** Requires an active project and folder area state. */
  requireArea = (
    projectId: string,
    folderId: string | null,
  ): Effect.Effect<FakeAreaState, RuleViolation> => {
    const state = this.areas.get(areaKey(projectId, folderId));
    const knownProject = this.summaries.some((summary) => summary.project.id === projectId);
    const knownFolder =
      folderId === null ||
      this.folders.some((folder) => folder.id === folderId && folder.projectId === projectId);
    return state === undefined || !knownProject || !knownFolder
      ? Effect.fail(
          new RuleViolation({
            message: "Area folder is missing or belongs to another project.",
          }),
        )
      : Effect.succeed(state);
  };

  /** The seeded folder with this name. */
  folderNamed(name: string): Folder {
    const folder = this.folders.find((candidate) => candidate.name === name);
    if (folder === undefined) {
      throw new Error(`No folder named ${name}.`);
    }
    return folder;
  }

  /** Folder names with their parent's name, for asserting the persisted tree. */
  folderTree(): ReadonlyArray<string> {
    const name = (id: string | null) =>
      this.folders.find((folder) => folder.id === id)?.name ?? "root";
    return this.folders
      .toSorted((left, right) => left.sortOrder - right.sortOrder)
      .map((folder) => `${name(folder.parentFolderId)}/${folder.name}`);
  }

  /** Removes a project as if another client had deleted it. */
  remove(projectId: string) {
    this.summaries = this.summaries.filter((summary) => summary.project.id !== projectId);
  }

  names() {
    return this.summaries.map((summary) => summary.project.name);
  }

  /** Removes a folder and its descendants. */
  removeFolder(folderId: string) {
    const doomed = new Set([folderId]);
    for (const folder of this.folders) {
      if (folder.parentFolderId !== null && doomed.has(folder.parentFolderId)) {
        doomed.add(folder.id);
      }
    }
    this.folders = this.folders.filter((folder) => !doomed.has(folder.id));
  }

  findFolder(projectId: string, folderId: string) {
    const folder = this.folders.find(
      (candidate) => candidate.id === folderId && candidate.projectId === projectId,
    );
    return folder === undefined
      ? Effect.fail(new RuleViolation({ message: "Folder is missing or deleted." }))
      : Effect.succeed(folder);
  }

  /** Whether `folderId` is `ancestorId` or one of its descendants. */
  isWithin(folderId: string | null, ancestorId: string): boolean {
    for (let current = folderId; current !== null;) {
      if (current === ancestorId) {
        return true;
      }
      current = this.folders.find((folder) => folder.id === current)?.parentFolderId ?? null;
    }
    return false;
  }

  area(projectId: string, folderId: string | null) {
    return this.requireArea(projectId, folderId).pipe(
      Effect.map((state) =>
        areaSnapshot(projectId, folderId, state.nodes, this.autoCompleteFor(projectId)),
      ),
    );
  }

  find(projectId: string) {
    const summary = this.summaries.find((candidate) => candidate.project.id === projectId);
    return summary === undefined
      ? Effect.fail(new NotFound({ entity: "Project", message: "Project is missing or deleted." }))
      : Effect.succeed(summary);
  }
}

function validName(name: string) {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 300
    ? Effect.succeed(trimmed)
    : Effect.fail(new RuleViolation({ message: "Project name must be 1 to 300 characters." }));
}

function validFolderName(name: string) {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 300
    ? Effect.succeed(trimmed)
    : Effect.fail(new RuleViolation({ message: "Name must be 1 to 300 characters." }));
}

function updateFolder(store: FakeProjectStore, folderId: string, change: Partial<Folder>) {
  store.folders = store.folders.map((folder) =>
    folder.id === folderId ? { ...folder, ...change } : folder,
  );
}

function folderHandlers(store: FakeProjectStore, record: (tag: string) => Effect.Effect<unknown>) {
  const parentOf = (projectId: string, parentFolderId: string | null) =>
    parentFolderId === null ? Effect.void : store.findFolder(projectId, parentFolderId);
  return {
    CreateFolder: ({
      projectId,
      parentFolderId,
      name,
    }: {
      projectId: string;
      parentFolderId: string | null;
      name: string;
    }) =>
      record("CreateFolder").pipe(
        Effect.andThen(
          Effect.all([
            store.find(projectId),
            parentOf(projectId, parentFolderId),
            validFolderName(name),
          ]),
        ),
        Effect.map(([, , trimmed]) => {
          const folder = store.addFolder(projectId, parentFolderId, trimmed);
          store.setItems(projectId, folder.id, []);
          return folder;
        }),
      ),
    RenameFolder: ({
      projectId,
      folderId,
      name,
    }: {
      projectId: string;
      folderId: string;
      name: string;
    }) =>
      record("RenameFolder").pipe(
        Effect.andThen(Effect.all([store.findFolder(projectId, folderId), validFolderName(name)])),
        Effect.map(([, trimmed]) => updateFolder(store, folderId, { name: trimmed })),
      ),
    MoveFolder: ({
      projectId,
      folderId,
      parentFolderId,
    }: {
      projectId: string;
      folderId: string;
      parentFolderId: string | null;
    }) =>
      record("MoveFolder").pipe(
        Effect.andThen(
          Effect.all([store.findFolder(projectId, folderId), parentOf(projectId, parentFolderId)]),
        ),
        Effect.andThen(() =>
          store.isWithin(parentFolderId, folderId)
            ? Effect.fail(new RuleViolation({ message: "Folder move would create a cycle." }))
            : Effect.sync(() => updateFolder(store, folderId, { parentFolderId })),
        ),
      ),
    DeleteFolder: ({ projectId, folderId }: { projectId: string; folderId: string }) =>
      record("DeleteFolder").pipe(
        Effect.andThen(store.findFolder(projectId, folderId)),
        Effect.map(() => {
          store.removeFolder(folderId);
          return guid(9998);
        }),
      ),
  };
}

function handlers(store: FakeProjectStore) {
  const record = (tag: string) => Effect.sync(() => store.calls.push(tag));
  return TaskTrackerRpcs.toLayer({
    GetServerInfo: () => Effect.succeed({ timeZone: "UTC" }),
    ListProjects: () => record("ListProjects").pipe(Effect.map(() => [...store.summaries])),
    CreateProject: ({ name }) =>
      record("CreateProject").pipe(
        Effect.andThen(validName(name)),
        Effect.map((trimmed) => store.add({ name: trimmed }).project),
      ),
    RenameProject: ({ projectId, name }) =>
      record("RenameProject").pipe(
        Effect.andThen(Effect.all([store.find(projectId), validName(name)])),
        Effect.map(([summary, trimmed]) => {
          store.summaries = store.summaries.map((candidate) =>
            candidate === summary
              ? { ...summary, project: { ...summary.project, name: trimmed } }
              : candidate,
          );
        }),
      ),
    DeleteProject: ({ projectId }) =>
      record("DeleteProject").pipe(
        Effect.andThen(store.find(projectId)),
        Effect.map(() => {
          store.remove(projectId);
          return guid(9999);
        }),
      ),
    LoadWorkspace: ({ projectId }) =>
      record("LoadWorkspace").pipe(
        Effect.andThen(store.find(projectId)),
        Effect.map(({ project }) => ({
          projectId,
          name: project.name,
          folders: store.folders.filter((folder) => folder.projectId === projectId),
        })),
      ),
    ...folderHandlers(store, record),
    ReorderProjects: notUsed,
    ReorderFolders: notUsed,
    RestoreProject: notUsed,
    RestoreFolder: notUsed,
    LoadArea: ({ projectId, folderId }) =>
      record("LoadArea").pipe(Effect.andThen(store.area(projectId, folderId))),
    ...itemHandlers(store, record),
    ...settingsAndLookupHandlers(store, record),
    LoadItemFieldValues: notUsed,
    ...customFieldHandlers(store, record),
  });
}

/** A running fake server: a `fetch` for the renderer transport and a way to stop it. */
export interface FakeServer {
  readonly fetch: typeof globalThis.fetch;
  readonly close: () => Promise<void>;
}

/** Serves the store through `RpcServer` as a web handler, without a network listener. */
export async function startFakeServer(store: FakeProjectStore): Promise<FakeServer> {
  const scope = Effect.runSync(Scope.make());
  const http = await Effect.runPromise(
    RpcServer.toHttpEffect(TaskTrackerRpcs).pipe(
      Effect.provide(handlers(store)),
      Effect.provide(RpcSerialization.layerJson),
      Scope.provide(scope),
    ),
  );
  const handle = HttpEffect.toWebHandler(http);
  return {
    fetch: (input, init) => handle(new Request(input, init)),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
}
