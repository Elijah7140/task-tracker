import {
  type AreaSnapshot,
  type TicketDetailInput,
  type CompletionResult,
  type FolderProjection,
  type FieldValueInput,
  type ItemEdit,
  type ItemLinkInput,
  NotFound,
  type RecurrenceRule,
  type ReminderChoice,
  RuleViolation,
  TaskTrackerRpcs,
  type ProjectSummary,
} from "@task-tracker/contracts";
import { Effect, Exit, Scope } from "effect";
import { HttpEffect } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";
import {
  areaSnapshot,
  FAKE_LOOKUPS,
  FakeAreaBuilder,
  type FakeItemNode,
  type FakeUrgency,
  recomputeAreaTree,
  type SeedItem,
} from "./fake-area-items.js";
import { customFieldHandlers } from "./fake-custom-field-handlers.js";
import { fakeHistory } from "./fake-history-handlers.js";
import { FakeCustomFields } from "./fake-custom-fields.js";
import { FakeItemLinks, itemLinkHandlers } from "./fake-item-links.js";
import {
  applyEditItem,
  applyCreateItem,
  applyDeleteItem,
  applyMoveItemToPriorityGroup,
  applySetItemCompleted,
  applySetItemPriority,
  type FakeAreaState,
  itemHandlers,
} from "./fake-item-operations.js";
import { FakeSettingsAndLookups, settingsAndLookupHandlers } from "./fake-settings-lookups.js";
import { FakeRecurrence } from "./fake-recurrence.js";
import { applySetItemStatus, FakeStatuses, statusHandlers } from "./fake-statuses.js";
import { FakeTrash, trashHandlers } from "./fake-trash-handlers.js";
import { FakeCalendar, calendarHandlers } from "./fake-calendar-handlers.js";
import { FakeSearch, searchHandlers } from "./fake-search-handlers.js";
import { searchQueryHandlers } from "./fake-search-query.js";
import { FakeSavedSearches, savedSearchHandlers } from "./fake-saved-search-handlers.js";
import { FakeToday, todayHandlers } from "./fake-today-handlers.js";
import { FakeReminders, reminderHandlers } from "./fake-reminder-handlers.js";
import { FakeTickets, ticketHandlers } from "./fake-ticket-handlers.js";
import { FakeTransfer, transferHandlers } from "./fake-transfer-handlers.js";
import { currentItemHandlers, FakeCurrentItem } from "./fake-current-item-handlers.js";
import { FakeTicketFields, ticketFieldHandlers } from "./fake-ticket-fields.js";

type Summary = typeof ProjectSummary.Type;
type Snapshot = typeof AreaSnapshot.Type;
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

/** The real server's EntityMissing("Project") failure. */
const missingProject = () =>
  new NotFound({ entity: "Project", message: "Project is missing or deleted." });

/** The real server's EntityMissing("Folder") failure. */
const missingFolder = () =>
  new NotFound({ entity: "Folder", message: "Folder is missing or deleted." });

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
  private readonly holds = new Map<string, Promise<void>>();
  /** Simulates a replay refused because data changed after recording. */
  historyRefusal: string | null = null;
  /** Simulates an unexpected failure from history replay. */
  historyFailure = false;
  /** Blocks the next completion with this reason, as the server's status rules can. */
  completionBlockedReason: string | null = null;
  private areas = new Map<string, FakeAreaState>();
  private autoCompleteByProject = new Map<string, boolean>();
  private sequence = 0;
  private timestampSequence = 0;

  constructor(seed: ReadonlyArray<SeedProject> = []) {
    seed.forEach((project) => this.add(project));
  }

  /**
   * Holds every call of the RPC `tag` after it is recorded until the returned
   * function runs, so a test can act while a request is in flight.
   */
  hold(tag: string): () => void {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = () => {
        this.holds.delete(tag);
        resolve();
      };
    });
    this.holds.set(tag, held);
    return () => release();
  }

  /** Lets later calls of `tag` through while a call already held keeps waiting for its release. */
  stopHolding(tag: string) {
    this.holds.delete(tag);
  }

  /** Records a call and waits while a test holds that RPC. */
  record = (tag: string) =>
    Effect.sync(() => this.calls.push(tag)).pipe(
      Effect.andThen(Effect.promise(() => this.holds.get(tag) ?? Promise.resolve())),
    );

  /** Returns a new uppercase GUID. */
  nextId = () => {
    this.sequence += 1;
    return guid(this.sequence);
  };

  readonly settingsAndLookups = new FakeSettingsAndLookups(this.nextId);

  /** Workflow statuses shared by App Settings, row menus, the editor and area snapshots. */
  readonly statuses = new FakeStatuses();

  /** Deletion batches listed by Trash. */
  readonly trash = new FakeTrash();

  /** Calendar clock and failure state for Calendar tests. */
  readonly calendar = new FakeCalendar();

  /** Scoped search overrides and link fixtures. */
  readonly search = new FakeSearch();

  /** The local day and failure state behind the Today view. */
  readonly today = new FakeToday();
  /** Ticket ranks and load failures for the Tickets view (§7.16). */
  readonly tickets = new FakeTickets();

  /** JSON import and export answers and requests (§7.9). */
  readonly transfer = new FakeTransfer();

  /** The stored current item (§7.18). */
  readonly currentItem = new FakeCurrentItem();

  /** Saved searches listed on Home and the Search page. */
  readonly savedSearches = new FakeSavedSearches(this.nextId);

  /** Item links saved by the editor, which also feed the search `link` field. */
  readonly itemLinks = new FakeItemLinks(this.nextId, this.search.linksByItemId);

  /** People, ticket types, levels, ticket fields and comments (§7.19). */
  readonly ticketFields = new FakeTicketFields(this.nextId);

  /** Sets a project's icon on its Home summary (§7.19). */
  setProjectIcon = (projectId: string, iconKey: string | null) =>
    Effect.sync(() => {
      this.summaries = this.summaries.map((summary) =>
        summary.project.id === projectId
          ? { ...summary, project: { ...summary.project, iconKey } }
          : summary,
      );
    });

  /** Custom fields, choices and item values shared by the field manager and item editor. */
  readonly customFields = new FakeCustomFields(this.nextId);

  /** Repeat rules, Skip, Stop and next occurrences (§7.11). */
  readonly recurrence = new FakeRecurrence(this);

  /** The session's reminders panel, which tests fill as the scheduler would (§7.12). */
  readonly reminders = new FakeReminders();

  /** Lookups appended to every area snapshot, such as an archived item type. */
  readonly extraLookups: {
    itemTypes: Array<Snapshot["itemTypes"][number]>;
    priorityLevels: Array<Snapshot["priorityLevels"][number]>;
  } = { itemTypes: [], priorityLevels: [] };

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

  /** Replaces fields of an active item as if edited externally, such as a description. */
  patchItem(itemId: string, patch: Partial<FakeItemNode["item"]>) {
    const patchNodes = (nodes: ReadonlyArray<FakeItemNode>): Array<FakeItemNode> =>
      nodes.map((node) => ({
        ...node,
        item: node.item.id === itemId ? { ...node.item, ...patch } : node.item,
        children: patchNodes(node.children),
      }));
    for (const state of this.areas.values()) {
      state.nodes = patchNodes(state.nodes);
    }
  }

  /** The project of an active item, for custom-field scope checks. */
  itemProject = (itemId: string): Effect.Effect<string, NotFound> => {
    const contains = (nodes: ReadonlyArray<FakeItemNode>): boolean =>
      nodes.some((node) => node.item.id === itemId || contains(node.children));
    for (const [key, state] of this.areas) {
      if (contains(state.nodes)) {
        return Effect.succeed(key.split(":")[0]!);
      }
    }
    return Effect.fail(new NotFound({ entity: "Item", message: "Item is missing or deleted." }));
  };

  /** Captures the fake data affected by project, folder and item history. */
  captureUndoState = () =>
    structuredClone({
      summaries: this.summaries,
      folders: this.folders,
      areas: this.areas,
      autoCompleteByProject: this.autoCompleteByProject,
      values: this.customFields.values,
      priorityLevels: this.settingsAndLookups.priorityLevels,
      itemTypes: this.settingsAndLookups.itemTypes,
      fields: this.customFields.fields,
      choices: this.customFields.choices,
      statuses: this.statuses.rows,
      trash: this.trash.batches,
      links: this.itemLinks.state,
      savedSearches: this.savedSearches.rows,
      reminders: this.reminders.rows,
      ticketRanks: this.tickets.ranks,
    });

  /** Applies a captured state while keeping the fake clock and ID generator monotonic. */
  restoreUndoState = (snapshot: ReturnType<FakeProjectStore["captureUndoState"]>) => {
    const {
      summaries,
      folders,
      areas,
      autoCompleteByProject,
      values,
      priorityLevels,
      itemTypes,
      fields,
      choices,
      statuses,
      trash,
      links,
      savedSearches,
      reminders,
      ticketRanks,
    } = structuredClone(snapshot);
    this.statuses.rows = statuses;
    this.summaries = summaries;
    this.folders = folders;
    this.areas = areas;
    this.autoCompleteByProject = autoCompleteByProject;
    this.customFields.restoreValues(values);
    this.settingsAndLookups.priorityLevels = priorityLevels;
    this.settingsAndLookups.itemTypes = itemTypes;
    this.customFields.fields = fields;
    this.customFields.choices = choices;
    this.trash.batches = trash;
    this.itemLinks.restore(links);
    this.savedSearches.rows = savedSearches;
    if (reminders.length !== this.reminders.rows.length) {
      this.reminders.publish(reminders);
    }
    this.tickets.ranks = ticketRanks;
  };

  /** Returns all active area states. */
  allAreas = () => [...this.areas.values()];

  /**
   * Requires an active project and folder area state. Like the real server, a
   * missing project or folder fails with NotFound for that entity.
   */
  requireArea = (
    projectId: string,
    folderId: string | null,
  ): Effect.Effect<FakeAreaState, NotFound> => {
    const state = this.areas.get(areaKey(projectId, folderId));
    const knownProject = this.summaries.some((summary) => summary.project.id === projectId);
    const knownFolder =
      folderId === null ||
      this.folders.some((folder) => folder.id === folderId && folder.projectId === projectId);
    if (!knownProject) {
      return Effect.fail(missingProject());
    }
    return state === undefined || !knownFolder
      ? Effect.fail(missingFolder())
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
    return folder === undefined ? Effect.fail(missingFolder()) : Effect.succeed(folder);
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
      Effect.map((state) => {
        const snapshot = areaSnapshot(
          projectId,
          folderId,
          state.nodes,
          this.autoCompleteFor(projectId),
        );
        return {
          ...snapshot,
          itemTypes: [...snapshot.itemTypes, ...this.extraLookups.itemTypes],
          priorityLevels: [...snapshot.priorityLevels, ...this.extraLookups.priorityLevels],
          statuses: this.statuses.ordered(),
          settings: {
            ...snapshot.settings,
            workspaceCardColumns: {
              value: this.settingsAndLookups.globalSettings.workspaceCardColumns,
              source: "Global" as const,
            },
          },
        };
      }),
    );
  }

  find(projectId: string) {
    const summary = this.summaries.find((candidate) => candidate.project.id === projectId);
    return summary === undefined ? Effect.fail(missingProject()) : Effect.succeed(summary);
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

/**
 * EditItem with custom values, links and an optional status. Built-in fields,
 * every custom value and the link list are validated before anything changes, and a status that needs
 * confirmation or is blocked stores nothing, so a refused edit stores nothing.
 */
function editItemHandler(store: FakeProjectStore, record: (tag: string) => Effect.Effect<unknown>) {
  return ({
    itemId,
    fields: { statusId, ...fields },
    customValues = [],
    links,
    recurrence,
    reminder,
    ticket,
    confirmedOpenItemIds,
  }: {
    itemId: string;
    fields: typeof ItemEdit.Type;
    ticket?: typeof TicketDetailInput.Type;
    customValues?: ReadonlyArray<typeof FieldValueInput.Type>;
    links?: ReadonlyArray<typeof ItemLinkInput.Type>;
    recurrence?: typeof RecurrenceRule.Type | null;
    reminder?: typeof ReminderChoice.Type;
    confirmedOpenItemIds?: ReadonlyArray<string>;
  }) => {
    const before = store.captureUndoState();
    return record("EditItem").pipe(
      Effect.andThen(store.itemProject(itemId)),
      Effect.andThen((projectId) => store.customFields.planEdit(itemId, projectId, customValues)),
      Effect.flatMap((commitValues) =>
        Effect.all([
          store.itemLinks.planEdit(itemId, links),
          store.recurrence.planEdit(itemId, fields, recurrence),
        ]).pipe(
          Effect.andThen(([commitLinks, commitRule]) =>
            Effect.map(planReminder(store, itemId, reminder), (commitReminder) => () => {
              commitValues();
              commitLinks();
              commitRule();
              commitReminder();
            }),
          ),
        ),
      ),
      Effect.flatMap((commit) =>
        (statusId === undefined
          ? Effect.succeed<typeof CompletionResult.Type>({ kind: "applied", changes: [] })
          : applySetItemStatus(store, itemId, statusId, confirmedOpenItemIds)
        ).pipe(Effect.map((result) => ({ commit, result }))),
      ),
      Effect.tap(({ result }) =>
        result.kind === "applied" ? applyEditItem(store, itemId, fields) : Effect.void,
      ),
      Effect.map(({ commit, result }) => {
        if (result.kind === "applied") {
          commit();
          store.ticketFields.saveEdit(itemId, ticket);
        }
        return store.recurrence.afterCompletion(result);
      }),
      Effect.tapError(() => Effect.sync(() => store.restoreUndoState(before))),
    );
  };
}

const REMINDER_OFFSETS = [0, 5, 15, 30, 60, 120, 1440, 2880, 10080];

/** Validates an editor's reminder choice like the server and returns its write (§7.12). */
function planReminder(
  store: FakeProjectStore,
  itemId: string,
  reminder: typeof ReminderChoice.Type | undefined,
) {
  if (reminder?.kind === "offset" && !REMINDER_OFFSETS.includes(reminder.minutes)) {
    return Effect.fail(
      new RuleViolation({ message: "Choose one of the listed reminder offsets." }),
    );
  }
  return Effect.succeed(() => {
    if (reminder !== undefined) {
      store.patchItem(itemId, { reminder });
    }
  });
}

/** Settings and lookup handlers whose item type and priority changes record history, as on the server. */
function trackedLookupHandlers(
  store: FakeProjectStore,
  track: ReturnType<typeof fakeHistory>["track"],
) {
  const lookups = settingsAndLookupHandlers(store, store.record);
  const title = (id: string) =>
    store.settingsAndLookups.priorityLevels.find((row) => row.id === id.toUpperCase())?.label;
  const typeName = (id: string) =>
    store.settingsAndLookups.itemTypes.find((row) => row.id === id.toUpperCase())?.name;
  return {
    ...lookups,
    AddItemType: (payload: Parameters<typeof lookups.AddItemType>[0]) =>
      track(lookups.AddItemType(payload), (row) => `Add item type '${row.name}'`),
    RenameItemType: (payload: Parameters<typeof lookups.RenameItemType>[0]) =>
      track(lookups.RenameItemType(payload), () => `Rename item type '${typeName(payload.id)}'`),
    ArchiveItemType: (payload: Parameters<typeof lookups.ArchiveItemType>[0]) =>
      track(lookups.ArchiveItemType(payload), () => `Archive item type '${typeName(payload.id)}'`),
    RestoreItemType: (payload: Parameters<typeof lookups.RestoreItemType>[0]) =>
      track(lookups.RestoreItemType(payload), () => `Restore item type '${typeName(payload.id)}'`),
    ReorderItemTypes: (payload: Parameters<typeof lookups.ReorderItemTypes>[0]) =>
      track(lookups.ReorderItemTypes(payload), () => "Reorder item types"),
    AddPriorityLevel: (payload: Parameters<typeof lookups.AddPriorityLevel>[0]) =>
      track(lookups.AddPriorityLevel(payload), (row) => `Add priority '${row.label}'`),
    RenamePriorityLevel: (payload: Parameters<typeof lookups.RenamePriorityLevel>[0]) =>
      track(lookups.RenamePriorityLevel(payload), () => `Rename priority '${title(payload.id)}'`),
    ArchivePriorityLevel: (payload: Parameters<typeof lookups.ArchivePriorityLevel>[0]) =>
      track(lookups.ArchivePriorityLevel(payload), () => `Archive priority '${title(payload.id)}'`),
    RestorePriorityLevel: (payload: Parameters<typeof lookups.RestorePriorityLevel>[0]) =>
      track(lookups.RestorePriorityLevel(payload), () => `Restore priority '${title(payload.id)}'`),
    ReorderPriorityLevels: (payload: Parameters<typeof lookups.ReorderPriorityLevels>[0]) =>
      track(lookups.ReorderPriorityLevels(payload), () => "Reorder priority levels"),
    SetPriorityNumber: (payload: Parameters<typeof lookups.SetPriorityNumber>[0]) =>
      track(lookups.SetPriorityNumber(payload), () => `Edit priority '${title(payload.id)}'`),
  };
}

/** Custom field and choice handlers that record history with the server's labels. */
function trackedFieldHandlers(
  store: FakeProjectStore,
  track: ReturnType<typeof fakeHistory>["track"],
) {
  const fields = customFieldHandlers(store, store.record);
  const data = store.customFields;
  const fieldName = (id: string) => data.fields.find((row) => row.id === id)?.displayName;
  const choiceLabel = (id: string) => data.choices.find((row) => row.id === id)?.label;
  type Payload<Tag extends keyof typeof fields> = Parameters<(typeof fields)[Tag]>[0];
  return {
    ...fields,
    CreateField: (payload: Payload<"CreateField">) =>
      track(fields.CreateField(payload), (row) => `Add field '${row.displayName}'`),
    RenameField: (payload: Payload<"RenameField">) =>
      track(fields.RenameField(payload), () => `Rename field '${fieldName(payload.fieldId)}'`),
    ChangeFieldType: (payload: Payload<"ChangeFieldType">) =>
      track(
        fields.ChangeFieldType(payload),
        () => `Change type of field '${fieldName(payload.fieldId)}'`,
      ),
    ArchiveField: (payload: Payload<"ArchiveField">) =>
      track(fields.ArchiveField(payload), () => `Archive field '${fieldName(payload.fieldId)}'`),
    RestoreField: (payload: Payload<"RestoreField">) =>
      track(fields.RestoreField(payload), () => `Restore field '${fieldName(payload.fieldId)}'`),
    ReorderFields: (payload: Payload<"ReorderFields">) =>
      track(fields.ReorderFields(payload), () => "Reorder fields"),
    AddFieldChoice: (payload: Payload<"AddFieldChoice">) =>
      track(fields.AddFieldChoice(payload), (row) => `Add choice '${row.label}'`),
    RenameFieldChoice: (payload: Payload<"RenameFieldChoice">) =>
      track(
        fields.RenameFieldChoice(payload),
        () => `Rename choice '${choiceLabel(payload.choiceId)}'`,
      ),
    ArchiveFieldChoice: (payload: Payload<"ArchiveFieldChoice">) =>
      track(
        fields.ArchiveFieldChoice(payload),
        () => `Archive choice '${choiceLabel(payload.choiceId)}'`,
      ),
    RestoreFieldChoice: (payload: Payload<"RestoreFieldChoice">) =>
      track(
        fields.RestoreFieldChoice(payload),
        () => `Restore choice '${choiceLabel(payload.choiceId)}'`,
      ),
    ReorderFieldChoices: (payload: Payload<"ReorderFieldChoices">) =>
      track(fields.ReorderFieldChoices(payload), () => "Reorder choices"),
  };
}

function handlers(store: FakeProjectStore) {
  const { record } = store;
  const history = fakeHistory(store);
  const item = itemHandlers(store, record);
  const editItem = editItemHandler(store, record);
  const folder = folderHandlers(store, record);
  const statuses = statusHandlers(store, record);
  const calendar = calendarHandlers(store);
  const itemTitle = (id: string): string | undefined => {
    const find = (nodes: ReadonlyArray<FakeItemNode>): string | undefined => {
      for (const node of nodes) {
        const title = node.item.id === id ? node.item.title : find(node.children);
        if (title !== undefined) {
          return title;
        }
      }
    };
    return find(store.allAreas().flatMap((area) => area.nodes));
  };
  return TaskTrackerRpcs.toLayer({
    ...history.handlers,
    GetServerInfo: () => Effect.succeed({ timeZone: "UTC" }),
    ListProjects: () => record("ListProjects").pipe(Effect.map(() => [...store.summaries])),
    CreateProject: ({ name }) =>
      history.track(
        record("CreateProject").pipe(
          Effect.andThen(validName(name)),
          Effect.map((trimmed) => store.add({ name: trimmed }).project),
        ),
        (project) => `Create '${project.name}'`,
      ),
    RenameProject: ({ projectId, name }) =>
      history.track(
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
        () => `Rename '${name.trim()}'`,
      ),
    DeleteProject: ({ projectId }) => {
      const name = store.summaries.find(({ project }) => project.id === projectId)?.project.name;
      return history.track(
        record("DeleteProject").pipe(
          Effect.andThen(store.find(projectId)),
          Effect.map(() => {
            store.remove(projectId);
            return guid(9999);
          }),
        ),
        () => `Delete '${name}'`,
      );
    },
    LoadWorkspace: ({ projectId }) =>
      record("LoadWorkspace").pipe(
        Effect.andThen(store.find(projectId)),
        Effect.map(({ project }) => ({
          projectId,
          name: project.name,
          folders: store.folders.filter((folder) => folder.projectId === projectId),
        })),
      ),
    ...folder,
    CreateFolder: (payload) =>
      history.track(folder.CreateFolder(payload), ({ name }) => `Create '${name}'`),
    RenameFolder: (payload) =>
      history.track(folder.RenameFolder(payload), () => `Rename '${payload.name.trim()}'`),
    ReorderProjects: notUsed,
    ReorderFolders: notUsed,
    RestoreProject: notUsed,
    RestoreFolder: notUsed,
    LoadArea: ({ projectId, folderId }) =>
      record("LoadArea").pipe(Effect.andThen(store.area(projectId, folderId))),
    ...item,
    CreateItem: (payload) =>
      history.track(item.CreateItem(payload), ({ title }) => `Create '${title}'`),
    ReorderItems: (payload) => history.track(item.ReorderItems(payload), () => "Reorder items"),
    DropItem: (payload) => {
      const title = itemTitle(payload.itemId);
      return history.track(item.DropItem(payload), () => `Move '${title}'`);
    },
    DeleteItem: (payload) => {
      const title = itemTitle(payload.itemId);
      return history.track(item.DeleteItem(payload), () => `Delete '${title}'`);
    },
    SetItemCompleted: (payload) => {
      const title = itemTitle(payload.itemId);
      const blocked = store.completionBlockedReason;
      if (blocked !== null && payload.completed) {
        store.completionBlockedReason = null;
        return record("SetItemCompleted").pipe(
          Effect.as({ kind: "blocked" as const, reason: blocked }),
        );
      }
      const completion = item
        .SetItemCompleted(payload)
        .pipe(Effect.map((result) => store.recurrence.afterCompletion(result)));
      return history.track(completion, (result) =>
        result.kind === "applied" && result.changes.length > 0
          ? `${payload.completed ? "Complete" : "Reopen"} '${title}'`
          : null,
      );
    },
    ...trackedLookupHandlers(store, history.track),
    ...trackedFieldHandlers(store, history.track),
    ...reminderHandlers(store, history.track),
    ...itemLinkHandlers(store, record),
    SetItemPriority: ({ itemId, priorityLevelId }) =>
      history.track(
        record("SetItemPriority").pipe(
          Effect.andThen(
            applySetItemPriority(store, itemId, priorityLevelId, [
              ...FAKE_LOOKUPS.priorityLevels,
              ...store.extraLookups.priorityLevels,
            ]),
          ),
        ),
        () => `Set priority of '${itemTitle(itemId)}'`,
      ),
    MoveItemToPriorityGroup: ({
      projectId,
      folderId,
      itemId,
      priorityLevelId,
      index,
      levelParentId,
    }) =>
      history
        .track(
          record("MoveItemToPriorityGroup").pipe(
            Effect.andThen(store.requireArea(projectId, folderId)),
            Effect.flatMap((area) =>
              applyMoveItemToPriorityGroup(
                store,
                area,
                projectId,
                itemId,
                priorityLevelId,
                index,
                [...FAKE_LOOKUPS.priorityLevels, ...store.extraLookups.priorityLevels],
                levelParentId ?? null,
              ),
            ),
          ),
          ({ title, priorityChanged }) =>
            priorityChanged ? `Set priority of '${title}'` : `Move '${title}'`,
        )
        .pipe(Effect.asVoid),
    ...statuses,
    SetItemStatus: (payload) => {
      const title = itemTitle(payload.itemId);
      const change = statuses
        .SetItemStatus(payload)
        .pipe(Effect.map((result) => store.recurrence.afterCompletion(result)));
      return history.track(change, (result) =>
        result.kind === "applied" ? `Set status of '${title}'` : null,
      );
    },
    AddStatus: (payload) =>
      history.track(statuses.AddStatus(payload), ({ name }) => `Add status '${name}'`),
    RenameStatus: (payload) =>
      history.track(statuses.RenameStatus(payload), () => `Rename status '${payload.name.trim()}'`),
    ArchiveStatus: (payload) =>
      history.track(statuses.ArchiveStatus(payload), () => "Archive status"),
    RestoreStatus: (payload) =>
      history.track(statuses.RestoreStatus(payload), () => "Restore status"),
    ReorderStatuses: (payload) =>
      history.track(statuses.ReorderStatuses(payload), () => "Reorder statuses"),
    ...trashHandlers(store, history.track),
    ...calendar,
    RescheduleCalendarEntry: (payload) =>
      history.track(calendar.RescheduleCalendarEntry(payload), (result) =>
        result === null ? null : `Reschedule '${itemTitle(payload.itemId)}'`,
      ),
    ...searchHandlers(store),
    ...searchQueryHandlers(store),
    ...savedSearchHandlers(store, history.track),
    ...todayHandlers(store),
    ...ticketHandlers(store, history.track),
    ...transferHandlers(store),
    ...currentItemHandlers(store),
    ...ticketFieldHandlers(store, record, history.track),
    EditItem: (payload) => {
      const title = payload.fields.title.trim();
      const before = store.recurrence.titleOf(payload.itemId);
      const label =
        payload.fields.statusId !== undefined
          ? `Set status of '${title}'`
          : payload.recurrence === undefined
            ? `Edit '${title}'`
            : `${payload.recurrence === null ? "Stop repeating" : "Set repeat for"} '${before}'`;
      return history.track(editItem(payload), (result) =>
        result.kind === "applied" ? label : null,
      );
    },
    SkipRepeat: ({ itemId }) => {
      const title = itemTitle(itemId);
      return history.track(
        record("SkipRepeat").pipe(Effect.andThen(store.recurrence.skip(itemId))),
        (skipped) => (skipped ? `Skip repeat for '${title}'` : null),
      );
    },
    PushBackOneDay: ({ itemId }) => {
      const title = itemTitle(itemId);
      return history.track(
        record("PushBackOneDay").pipe(Effect.andThen(() => store.recurrence.pushBack(itemId))),
        () => `Push back '${title}'`,
      );
    },
    StopRepeating: ({ itemId }) => {
      const title = itemTitle(itemId);
      return history.track(
        record("StopRepeating").pipe(Effect.andThen(store.recurrence.stop(itemId))),
        () => `Stop repeating '${title}'`,
      );
    },
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
