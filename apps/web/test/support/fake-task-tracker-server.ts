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
import { areaSnapshot, FakeAreaBuilder, type SeedItem } from "./fake-area-items.js";

type Summary = typeof ProjectSummary.Type;
type Folder = typeof FolderProjection.Type;
type AreaItems = ReturnType<FakeAreaBuilder["build"]>;

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
  private readonly areas = new Map<string, AreaItems>();
  private sequence = 0;

  constructor(seed: ReadonlyArray<SeedProject> = []) {
    seed.forEach((project) => this.add(project));
  }

  /** Returns a new uppercase GUID. */
  nextId = () => {
    this.sequence += 1;
    return guid(this.sequence);
  };

  /** Adds a project as if another client had created it. */
  add({ name, openCount = 0, overdueCount = 0, folders = [], items = [] }: SeedProject): Summary {
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
    const built = new FakeAreaBuilder(projectId, folderId, this.nextId).build(items);
    this.areas.set(areaKey(projectId, folderId), built);
  }

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
    const items = this.areas.get(areaKey(projectId, folderId));
    const known = this.summaries.some((summary) => summary.project.id === projectId);
    return items === undefined || !known
      ? Effect.fail(
          new RuleViolation({
            message: "Area folder is missing or belongs to another project.",
          }),
        )
      : Effect.succeed(areaSnapshot(projectId, folderId, items));
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
    CreateItem: notUsed,
    EditItem: notUsed,
    SetItemCompleted: notUsed,
    IndentItem: notUsed,
    OutdentItem: notUsed,
    MoveItem: notUsed,
    ReorderItems: notUsed,
    MoveItemToArea: notUsed,
    DeleteItem: notUsed,
    RestoreItems: notUsed,
    LoadGlobalSettings: notUsed,
    LoadProjectSettings: notUsed,
    PreviewGlobalAutoComplete: notUsed,
    PreviewProjectAutoComplete: notUsed,
    SaveGlobalSettings: notUsed,
    SaveProjectSettings: notUsed,
    ListItemTypes: notUsed,
    AddItemType: notUsed,
    RenameItemType: notUsed,
    ArchiveItemType: notUsed,
    RestoreItemType: notUsed,
    ReorderItemTypes: notUsed,
    ListPriorityLevels: notUsed,
    AddPriorityLevel: notUsed,
    RenamePriorityLevel: notUsed,
    ArchivePriorityLevel: notUsed,
    RestorePriorityLevel: notUsed,
    ReorderPriorityLevels: notUsed,
    LoadItemFieldValues: notUsed,
    ListFields: notUsed,
    ListEffectiveFields: notUsed,
    CreateField: notUsed,
    RenameField: notUsed,
    ChangeFieldType: notUsed,
    ArchiveField: notUsed,
    RestoreField: notUsed,
    ReorderFields: notUsed,
    ListFieldChoices: notUsed,
    AddFieldChoice: notUsed,
    RenameFieldChoice: notUsed,
    ArchiveFieldChoice: notUsed,
    RestoreFieldChoice: notUsed,
    ReorderFieldChoices: notUsed,
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
