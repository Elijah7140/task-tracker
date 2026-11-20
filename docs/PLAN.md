# Task Tracker — Project Plan

Status: **Revision 7 — TypeScript cutover complete, legacy feature port planned** · Owner: Elijah Harris · PM: Claude

## 1. Goal

A cross-platform desktop task manager (Windows first) that organizes work the way a
database or application schema is organized:

```
Project            (e.g. "Billing DB")
└── Folder         (e.g. "dbo")
    └── Folder     (e.g. "Tables")
        └── Todo item          (e.g. "Add index to Invoice.CustomerId")
            └── Sub-item       (e.g. "Check query plan before/after")
```

Users pick a project from the home screen, then work inside it with nested folders.
Every **area** (the project root, or any folder) holds todo items. Items carry structured
fields today, and must be able to carry more metadata later that users can search on.

## 2. Scope

### In scope for v1

| # | Requirement | Notes |
|---|-------------|-------|
| R1 | Projects, listed on a home screen | Create, rename, delete, open |
| R2 | Nested folders inside a project | Unlimited depth; create, rename, move, delete |
| R3 | Todo items in the project root and in any folder | |
| R4 | Item fields: title, description, ticket number, priority, type | Title required, the rest optional. Priorities, like types, are data: users can add and reorder levels |
| R5 | Item types: Change, Error, Discussion, user-extensible | Stored as data, not an enum, so new types need no code change |
| R6 | Optional due date (with optional time) | Drives urgency color |
| R7 | Optional scheduled start/end (for discussions, meetings) | Also drives urgency; feeds the future calendar |
| R8 | Urgency indicator: neutral, yellow, red | Thresholds configurable globally and per project (§6.5). A parent shows the most urgent of itself and its open sub-items |
| R9 | Mark complete / reopen | |
| R10 | Completed items move to a collapsed "Completed" section in the same area | Applies at every level, including under a parent (§6.2) |
| R11 | Sub-items, nested to any depth | |
| R12 | Parent auto-completes when all sub-items complete | Setting, on by default, overridable per project |
| R13 | **Metadata-ready design** | v1 ships a schema and code structure that custom fields and search slot into without rewrites (§7). Custom fields shipped in Phase 3 and carry over in the pivot. Searching by them arrives in Phase 4 |
| R14 | Cross-platform desktop UI, Windows as the primary target | See §3–4 |
| R15 | Two-level settings: global defaults, optional per-project overrides | §6.5 |

### Out of scope for the original v1 (roadmap, §10)

Calendar view, custom fields, search UI, reminders/notifications, recurring items,
multi-user sync, import/export, standalone mobile or hosted browser clients.
The TypeScript cutover includes the shipped Phase 3 custom fields. Sections 7.2 and
7.4–7.18 specify the additional features from the frozen `legacy-final` tag.
[WP25 onward](MIGRATION.md#wp25--schema-and-legacy-database-adoption) tracks their port.

## 3. Key decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Workspace | Node 26, pnpm 12 workspaces (`apps/*`, `packages/*`), TypeScript in strict mode, ESM, Vite+ (`vp` for Vite, Vitest, Oxlint and Oxfmt) | One toolchain across the local server, renderer and desktop shell |
| Server | Effect 4.1 (`Effect`, `Context`, `Layer`, `Schema`, `Clock` and `DateTime`) and `@effect/platform-node` | Scoped resources, typed failures and testable service composition |
| Storage | A project-owned `node:sqlite` adapter for Effect SQL. Effect SQL migrations tracked in `effect_sql_migrations` | Local SQL with existing file continuity (§5.2) |
| IDs | Uppercase GUID strings on the wire. Normalize on decode. Generate UUIDv7 for new IDs and preserve existing IDs | Time order keeps index locality and leaves room for future sync |
| Time | Effect `Clock` for current time and timers. Temporal in Core for floating calendar values and explicit zone conversion (§5.4). ISO strings on the wire | Deterministic rules with calendar values kept separate from instants |
| Boundary | Effect Schema contracts and typed RPC over local WebSocket/HTTP using Effect HTTP and `effect/rpc` | One wire contract for the server and renderer |
| Web | React 19.3, Vite, TanStack Router, Tailwind 4, `@base-ui/react`, `lucide-react`, `@dnd-kit`, Zustand, `@effect/atom-react`, and `@fontsource-variable/inter` | Accessible primitives, keyboard and pointer interactions, and shared design tokens |
| Desktop | Electron with embedded Node supporting `node:sqlite` and FTS5, and electron-builder | Windows-first desktop distribution with a local server and narrow native IPC |
| Tests | Vitest, `@effect/vitest`, `@vitest/browser-playwright`, Playwright | Fast domain and database suites, real browser input and desktop smoke coverage |

Rejected alternatives:

- **Keep the .NET backend with a React renderer.** This would retain two runtimes, two
  service toolchains and a cross-language contract to ship and maintain.
- **Keep Avalonia, or move to WPF, WinUI 3 or .NET MAUI.** All retain the .NET UI
  toolchain. WPF and WinUI 3 also limit desktop support to Windows.
- **Put rules and persistence in the renderer.** Completion, hierarchy and writes
  need a single authority shared by every client.

## 4. Architecture

```text
packages/
  core/       Pure models, hierarchy, validation, completion, urgency and settings rules
  contracts/  Effect Schema payloads, results, errors and RPC declarations
apps/
  server/     Effect services, SQLite repositories and migrations, RPC handlers
  web/        React screens, routes, interaction state, and typed RPC client
  desktop/    Electron main, preload and installer configuration
```

Dependency rule — `server → core`, `server → contracts ← web`. Core and contracts are
independent. Core is pure and receives time and zone as arguments. Contracts contain
wire schemas and RPC declarations. Dates and times cross the wire as ISO strings.
Decode GUID strings to uppercase. The renderer formats with `Intl` using the zone
the server sends and has no Temporal dependency.

Electron main starts the built server with `process.execPath` and
`ELECTRON_RUN_AS_NODE=1`, passes its database path, waits for readiness, loads the
built renderer and stops the server on exit. Packaging keeps Electron's RunAsNode
fuse enabled for this launch as an accepted risk, because anyone who can already run
the executable can use it as plain Node, while the NODE_OPTIONS and inspector fuses
stay disabled. The renderer uses a loopback RPC
endpoint with a per-launch credential and origin validation. Preload exposes a
narrow native API, such as clipboard access.
Electron 45.3.4 embeds Node 24.22.3. The WP1 Linux probe verified SQLite FTS5
and native Temporal in the child process launched from Electron main.
Use context isolation and sandboxing with Node integration disabled in the renderer.

- Core decides completion, hierarchy, validation, finished branches and urgency. Server
  services load data, invoke Core and persist changes. The web renders server
  projections, including finished sections and urgency attribution. Gestures translate
  to intents, such as an item ID and drop target. Selection, expansion and drafts stay
  client-side in Zustand. Use Effect atoms for RPC data and invalidation.
- Effect Layers compose long-lived services. Each public database operation uses one
  `SqlClient` transaction. Repository calls share it from validation through commit.
  The adapter gives each transaction exclusive use of its single connection (§5.2).
  Queries read a consistent snapshot. Failed or interrupted writes roll back together.
- Completion and settings confirmations return typed previews. The UI displays the
  prompt and sends a new request on approval. The server revalidates the preview in
  the write transaction and requests fresh confirmation if the affected work changed.

## 5. Domain model

```
Project ─1:N─ Folder (self-referencing ParentFolderId, null = top level)
Project ─1:N─ TodoItem (FolderId null = project root)
TodoItem ─1:N─ TodoItem (ParentItemId, sub-items)
TodoItem ─1:N─ ItemLink (§7.10)
TodoItem ─N:1─ StatusLevel (§7.15)
TodoItem ─N:1─ ItemType
TodoItem ─N:1─ PriorityLevel
GlobalSetting (key/value);  ProjectSetting (ProjectId, key/value)
FieldDefinition ─1:N─ FieldChoice;  TodoItem ─1:N─ ItemFieldValue ─N:1─ FieldDefinition
```

### Entities

**Project** — `Id`, `Name`, `Description?`, `SortOrder`, timestamps, deletion fields (§5.3).

**Folder** — `Id`, `ProjectId`, `ParentFolderId?`, `Name`, `SortOrder`, timestamps, deletion fields.

**TodoItem**

| Field | Type | Notes |
|-------|------|-------|
| `Id` | UUID string | |
| `ProjectId` | UUID string | Needed because root-area items have no folder; also speeds project-wide search |
| `FolderId` | UUID string or null | null = project root |
| `ParentItemId` | UUID string or null | null = top-level item |
| `Title` | string (required, ≤ 300) | |
| `Description` | string? | Plain text at cutover. Markdown preview in §7.10 |
| `TicketNumber` | string? (≤ 100) | Free text, e.g. `JIRA-1234`. Indexed, not unique |
| `TicketRank` | number or null | Position within the Tickets priority section (§7.16) |
| `StatusId` / `ReopenStatusId` | UUID string or null | Workflow status and remembered open status (§7.15) |
| `PriorityLevelId` | UUID string or null | null = no priority |
| `ItemTypeId` | UUID string or null | |
| `DueDate` | calendar date or null | |
| `DueTime` | wall-clock time or null | Only valid when `DueDate` is set. Absent = due end of day |
| `ScheduledStart` / `ScheduledEnd` | local date-time or null (§5.4) | For discussions and meetings. End requires start; end ≥ start |
| `CompletedAtUtc` | UTC instant or null | null = open |
| `SortOrder` | integer | Order among siblings |
| `CreatedAtUtc`, `UpdatedAtUtc` | UTC instant | |
| deletion fields | | §5.3 |

**ItemType** — `Id`, `Name` (unique), `ColorKey?`, `IconKey?`, `IsBuiltIn`, `IsArchived`, `SortOrder`.
Seeded: Change, Error, Discussion. Users can add, rename, reorder and archive; built-ins
can be renamed but not archived. Archived types stay on existing items but are hidden
from pickers.

**PriorityLevel** — same shape as `ItemType`: `Id`, `Name` (unique), `ColorKey?`,
`IsArchived`, `SortOrder`. **Order is rank**: the level at the top of the list is the
most important. Seeded, top to bottom: Critical, High, Medium, Low. Users can add,
rename, reorder and archive levels in Settings; an item with no level has no priority.
Comparisons such as "priority ≥ High" (sorting now, search in Phase 4) use the current
order, so reordering levels needs no data migration.

`ItemType` and `PriorityLevel` share a small `LookupEntity` base (name, color, sort
order, archive flag) and a shared management component. The port adds optional
priority numbers and a status lookup (§7.15).

Lookup names are reserved case-insensitively within each list, including archived
entries. A number-only priority has no name to reserve. Custom field display names
are reserved only among active fields (§7.1).

**GlobalSetting** — `Key`, `Value` (text). **ProjectSetting** — `ProjectId`, `Key`,
`Value`. A missing project row means "inherit the global value". See §6.5.

### 5.1 Hierarchy invariants

Enforced in one place, the Core `ItemTree` and `FolderTree` modules, and covered by tests:

1. A folder's parent folder belongs to the same project. A folder cannot be moved into
   itself or any of its descendants.
2. A top-level item's `FolderId` (if set) points at a folder in the item's `ProjectId`.
3. Every sub-item has the **same `ProjectId` and `FolderId` as its parent**. The area is
   decided by the top-level item; sub-items follow it.
4. An item cannot become a descendant of itself (checked on indent/re-parent).
5. Moving an item or folder updates every affected row in **one transaction**.

**Load unit:** all items of one area are loaded together and assembled into trees in
memory. Areas are small (tens to hundreds of items), so this is fast and avoids storing a
denormalized root id that could go stale.

### 5.2 Database specifics and continuity

- Open the existing `TaskTracker/tasktracker.db` **in place**. Honor
  `TASKTRACKER_DB_PATH` first. Otherwise reuse the legacy local app-data path for both
  existing and fresh files. The base is Windows Local AppData, macOS
  `~/Library/Application Support`, or Linux's absolute `XDG_DATA_HOME` with
  `~/.local/share` as fallback. Close the legacy app before switching.
  [.NET app-data path resolution](https://source.dot.net/System.Private.CoreLib/src/runtime/src/libraries/System.Private.CoreLib/src/System/Environment.GetFolderPathCore.Unix.cs.html)
- Preserve names and columns from `20261113163313_InitialCreate`,
  `20261114032356_AddCustomFields` and `TaskTrackerDbContextModelSnapshot`. The tables are
  `Project`, `Folder`, `TodoItem`, `ItemType`, `PriorityLevel`, `GlobalSetting`,
  `ProjectSetting`, `FieldDefinition`, `FieldChoice` and `ItemFieldValue`.
- Keep uppercase, hyphenated GUIDs in SQLite `TEXT`. Apply the same casing to bound IDs
  and new primary/foreign keys. Preserve seed IDs and any user changes to lookup rows.
  [Microsoft.Data.Sqlite GUID binding](https://raw.githubusercontent.com/dotnet/efcore/v10.0.0/src/Microsoft.Data.Sqlite.Core/SqliteValueBinder.cs#L158-L169)
- Booleans are `INTEGER` 0/1, numeric metadata is `REAL`, and `FieldDefinition.DataType`
  stores enum names as `TEXT`. Keep settings keys and codecs (§6.5).
- Dates use `YYYY-MM-DD`, times use `HH:mm:ss` with seven fractional digits when
  present, and timestamps use `YYYY-MM-DD HH:mm:ss` with up to seven fractional
  digits. Timestamps have no offset in SQLite. Decode UTC columns explicitly as UTC
  and scheduled columns as floating values. Write the same formats so date ordering
  and scheduled range checks work across old and new rows.
  [Microsoft.Data.Sqlite value binding](https://raw.githubusercontent.com/dotnet/efcore/v10.0.0/src/Microsoft.Data.Sqlite.Core/SqliteValueBinder.cs)
- Write a small `node:sqlite` adapter using `effect/sql/SqlClient`,
  `effect/sql/SqlSchema` for row codecs and `effect/sql/SqlError` for errors.
  T3 Code's MIT-licensed `packages/shared/src/nodeSqliteClient.ts` is a reference.
  Use one connection with `PRAGMA busy_timeout = 5000` and an `effect/Semaphore`
  that grants exclusive access for each transaction.
- Enable foreign keys. Preserve keys, foreign keys and delete
  actions, check constraints (including due time and scheduled end), and indexes
  (including `TodoItem(ProjectId, FolderId)`, `TodoItem(ParentItemId)`,
  `TodoItem(TicketNumber)`, `TodoItem(DueDate)` and `Folder(ProjectId, ParentFolderId)`).
- Effect owns future migration history. Validate EF history and actual schema before
  recording equivalent Effect migrations as applied. Leave `__EFMigrationsHistory`
  intact. A Phase 3 file receives only the Effect baseline. An InitialCreate-only
  file receives the baseline for its existing schema and the additive custom-field
  migration. Fresh databases apply both migrations and seed once. Unrecognized or
  inconsistent files fail startup with a diagnostic. Schema changes and their
  migration records are atomic. Restart is idempotent.
- WP25 extends adoption to every recognized legacy schema through AddTicketRank.
  Validate the matching schema and migration history before adding Effect baseline
  records. Preserve saved-search rewrites, seed IDs, and FTS mapping and triggers.
- Back up an existing file before the first Effect baseline or a pending schema
  migration, using SQLite's online backup API so committed WAL pages are included.
  Keep the latest five successful migration backups (`tasktracker-<stamp>.db.bak`),
  including legacy ones. Pruning never removes import or other backups. Abort startup if backup or migration fails. After adoption, reopening
  the adopted file in .NET is unsupported. Restore the pre-adoption backup to roll back.
  [Node SQLite backup API](https://nodejs.org/api/sqlite.html#sqlitebackupsourceDb-path-options)
- Test with disposable copies of fixtures generated by the actual EF migrations for
  both schema versions (§11.1). Read, edit and reopen them with the new server.
  Verify hierarchy, completion, timestamps, deletion batches, settings, seeds,
  archived rows and all custom-value types. Check backups, constraints, rollback,
  restart and fresh-schema parity.

### 5.3 Deletion and restore

Soft deletion records the batches used by Trash (§7.6).

- Deletion fields on Project, Folder, TodoItem: `DeletedAtUtc?`, `DeletionBatchId?`.
- Deleting a node stamps it **and all its descendants** with the same `DeletionBatchId`
  in one transaction. Rows already deleted earlier keep their original batch.
- Restore works per batch: it restores exactly what was deleted together. Restoring is
  blocked if the batch's top node's parent is itself deleted ("restore the folder first").
- Normal repository queries use shared active-row SQL filters (`DeletedAtUtc IS NULL`).
  Trash and restore operations use explicit queries that include deleted rows.
- Uniqueness: folder and item names are **not** unique (duplicates are legitimate).
  Unique keys that exist (`ItemType.Name`, `FieldDefinition.Key`) use archive,
  not soft delete, so they never collide with deleted rows.
- Deleting a sub-item re-runs the completion rule on its ancestors (§6.1).

### 5.4 Dates and times

- System timestamps (`CreatedAtUtc`, `CompletedAtUtc`, …) are UTC.
- User-entered dates/times are **floating local time**: "due Friday 15:00" means
  15:00 on the user's clock wherever they are, the same way all-day and floating events
  work in calendar apps. This fits a single-user desktop app and avoids surprise shifts.
- Temporal models floating dates, times and date-times separately from instants and
  preserves the sub-millisecond precision of legacy timestamps. Core uses
  `temporal-polyfill` if Electron's Node lacks Temporal. The server composition root
  supplies the OS IANA time zone and Effect Clock. Core's `FloatingTime` receives
  the zone explicitly.
- Resolve DST gaps to the transition boundary with `getTimeZoneTransition`
  (e.g. 02:30 → 03:00), preserving legacy `FloatingTime` behavior. For a repeated
  time, use the earlier instant. A date-only deadline uses local 23:59:59.9999999.
  Keep regression coverage for these cases.
- If sync is ever added, we add a `TimeZoneId` column and convert; the field names do not change.

## 6. Business rules

### 6.1 Completion and sub-items

Setting: `AutoCompleteParents` — **default on**.

Definitions: an item's **active children** are its non-deleted sub-items. A **leaf** has
no active children and is completed/reopened manually like any task.

With the setting **on**, the invariant is: *an item with active children is complete
exactly when all of its active children are complete.* After **any** change to a tree —
complete, reopen, add, delete, restore, move, indent/outdent — the app re-evaluates the
affected item's ancestors bottom-up and fixes their state. Reparenting evaluates both
ancestor chains deepest first against the final tree. Specifically:

| Action | Result |
|--------|--------|
| Complete the last open sub-item | Parent completes; repeats up the tree |
| Reopen a sub-item of a completed parent | Parent reopens; repeats up the tree |
| Add an open sub-item to a completed parent | Parent reopens; repeats up the tree |
| Delete (or move away) the last open sub-item, leaving only completed ones | Parent completes; repeats up |
| Delete (or move away) the last sub-item entirely | Parent becomes a leaf and **keeps its current state** |
| Restore or move in an open sub-item under a completed parent | Parent reopens; repeats up |
| Complete a parent that has open sub-items | Confirm: "Also complete N open sub-items?" Yes → completes the whole subtree. No → cancel |
| Reopen a parent whose sub-items are all complete | Blocked with message: "Reopen a sub-item instead, or add a new one." |

With the setting **off**, every item completes and reopens independently.

**Turning the setting on** always leaves the data consistent with it. If any trees
disagree, the app shows: "Turning this on will complete M parents and reopen K parents.
Continue?" **Continue** → the setting change and the bottom-up reconciliation commit in
**one transaction**. **Cancel** → the setting stays off and nothing changes. Turning the
setting off changes no data.

Implementation: `CompletionService` in Core takes an `ItemTree` and an action, and
returns the list of state changes. The application service persists them in one
transaction. Every table row above is a unit test.

### 6.2 Where completed items show

Same rule at every level: **open items first; finished items in a collapsed
"Completed (n)" expander right after them, newest-completed first.**

An item is **finished** when it *and every active descendant* are complete. Only
finished items move into a Completed section, so open work is never hidden.

- In an area, finished top-level items (with their sub-items) go to the area's
  Completed section.
- Under a parent, finished sub-items go to a small collapsed "n completed" expander
  beneath that parent's other sub-items.
- With auto-complete **off**, a parent can be complete while a sub-item is still open.
  That parent stays in the open list, shown checked and struck through, until its
  last descendant is done. (With the setting on, this state cannot occur.)
- Reopening an item returns it to the open list at its previous `SortOrder`.
- Expander state is per session and starts collapsed.

### 6.3 Urgency color

`calculateUrgency(item, now, timeZone, thresholds)` in Core. It resolves the
item's floating deadline with `FloatingTime` (§5.4) using the `timeZone` passed in.

**Effective deadline** = the due date/time if set; otherwise the scheduled start if set;
otherwise none. So a discussion with only a meeting time still turns yellow/red as it nears.

| Condition | Urgency | Default color |
|-----------|---------|---------------|
| No effective deadline, or item complete | `None` | Neutral |
| Deadline more than *Yellow threshold* away | `None` | Neutral |
| Deadline within *Yellow threshold* (default 3 days) | `Approaching` | Yellow |
| Deadline within *Red threshold* (default 24 hours) | `Imminent` | Red |
| Deadline passed | `Overdue` | Red, plus bold title and "Overdue" badge |

- A date-only due date counts as due at the end of that day (local).
- Thresholds are settings (§6.5): global defaults, overridable per project. The settings
  forms keep red ≤ yellow for the *effective* values; the calculator also clamps
  defensively, treating yellow as at least red.

**Displayed urgency rolls up.** Each row shows the most urgent of its own urgency and
its sub-items': `Displayed(item) = max(Own(item), Displayed(child) for each active child)`,
where `Own` is `None` for a completed item. Completed branches therefore add nothing,
while an open sub-item under a completed parent (setting off) still shows. When the
color comes from a sub-item, the row shows a small "from sub-item" marker with a
tooltip naming it, so the user knows the parent's own deadline isn't the cause.

- The web requests refreshed server urgency once a minute so indicators update without
  a manual refresh.
- The indicator uses theme tokens with readable contrast and a label or icon so its
  meaning is available without color.

### 6.4 Moving and ordering

- Items reorder among siblings by drag-and-drop or Alt+↑/↓ (`SortOrder`, renumbered
  among siblings on each move; sibling counts are small).
- Moving a top-level item to another area **in the same project** moves its whole
  subtree (invariant 3). Moving between projects is out of scope for v1; if added later
  it must handle project-scoped custom fields.
- Sub-items cannot be moved to another area on their own. They can be re-parented
  within the same area by indent/outdent on focused rows or by dragging (§7.5).
- Folders move within the same project only (invariant 1).

### 6.5 Settings: global and per project

Two sources: **global** values, which every project uses by default, and optional
**project overrides**. The effective value for a project is its override if present,
otherwise the global value.

| Setting | Type | Default | Per-project override |
|---------|------|---------|----------------------|
| `AutoCompleteParents` | boolean | on | yes |
| `UrgencyYellowThreshold` | duration | 3 days | yes |
| `UrgencyRedThreshold` | duration | 24 hours | yes |
| `WorkspaceCardColumns` | whole number, 1–8 | 4 | no (§7.17) |

Design:

- Core declares each setting once with a typed definition, storage key, default and
  override policy. The server settings service reads and writes globals, sets and
  clears project overrides, and returns effective values with their source
  (`Global` or `Project`). The UI shows "Inherited from global" and offers "Reset to global".
- Preserve the storage keys `autoCompleteParents`, `urgencyYellowThreshold` and
  `urgencyRedThreshold` and their text encodings. Keep the legacy boolean encoding.
  Read and write durations in .NET `XmlConvert` format (e.g. `P1D`, `PT3H`, `PT0.5S`).
- **Auto-complete and reconciliation (§6.1)** apply to the *effective* value: a change
  that turns auto-complete on for some projects (a project override, or a global change
  that inheriting projects pick up) runs the reconcile prompt for exactly those projects,
  in one transaction with the setting change.
- UI: **App Settings** holds global values and the item type / priority lists. **Project
  Settings** (from the project's menu) shows each overridable setting with an
  "Override" checkbox.

## 7. Metadata and feature design

Phase 3 custom fields were included at cutover. The remaining sections describe
the planned TypeScript port of the features at `legacy-final`.

### 7.1 Custom fields (Phase 3)

**FieldDefinition** — `Id`, `Key` (stable, unique, e.g. `severity`), `DisplayName`,
`DataType` (`Text, Number, Date, Boolean, Choice`), `ProjectId?` (null = global),
`IsArchived`, `SortOrder`.

**FieldChoice** — `Id`, `FieldDefinitionId`, `Label`, `SortOrder`, `IsArchived`.
Values store the choice `Id`, so renaming a label never breaks data or saved searches.
Removing a choice archives it; items keep their value.

**ItemFieldValue** — `ItemId`, `FieldDefinitionId`, and one typed column per data type:
`TextValue`, `NumberValue` (SQLite REAL), `DateValue` (calendar date), `BoolValue`, `ChoiceId`.

- Exactly one value column is set, matching the definition's type. Enforced by a
  `FieldValueValidator` in Core at the service boundary, backed by a DB check constraint
  ("exactly one non-null").
- The validator also checks that the field is global or belongs to the item's project,
  and that a `ChoiceId` belongs to that field. The database backs the second rule with a
  composite foreign key `(FieldDefinitionId, ChoiceId)` → `FieldChoice(FieldDefinitionId, Id)`.
- Items do not move between projects (§6.4), so a project-scoped value can never end up
  on an item in another project.
- An absent row means "no value". Empty strings are normalized to absent.
- A field's `DataType` can change only before any value exists. Create a new field
  when an existing field with values needs a different type.
- Indexes on `(FieldDefinitionId, TextValue)`, `(FieldDefinitionId, NumberValue)`,
  `(FieldDefinitionId, DateValue)`, `(FieldDefinitionId, ChoiceId)`.
- Keys are creation-time lowercase slugs of display names, globally unique with numeric
  collision suffixes, and never change on rename; the database has a unique key index.
- Search reserves built-in field keys and the query keywords `has`, `no` and `is` (§7.7).
  Existing colliding keys receive the first free numeric suffix while preserving IDs, values
  and saved-search meaning.
- Display names are required and trimmed, and are case-insensitively unique among active
  fields visible together (global plus project fields).
- Fields archive instead of deleting; unarchive rechecks name uniqueness, and archived
  fields retain existing values.
- Choice labels are required and trimmed, unique case-insensitively among active choices;
  choices can be renamed, reordered, archived and restored without removing item values.
- Numbers must be finite; text is trimmed, blank text removes the value, and null removes
  the value.
- Effective fields list active global fields first, then active project fields, each in
  sort order; settings can also list archived fields.
- An item edit updates only the custom fields supplied by the editor; omitted fields keep
  their existing values. A blank or null supplied value removes that field's row.

Why typed columns instead of a JSON blob: range queries ("severity ≥ 3",
"reviewed before 2026-12-01") stay indexable and plain SQL.

### 7.2 Search (Phase 4)

**Field registry.** The field registry returns every searchable field as a
`SearchableField { Key, DisplayName, DataType, Source }`. `Source` is either a built-in
column (`title`, `ticket`, `priority`, `type`, `due`, `scheduled`, `status`, `completed`, `link`) or a
`FieldDefinition`. Search code treats both the same.

**Query model** (Core, storage-agnostic):

- `SearchScope` is a discriminated union of all projects, one project (project ID),
  or an area (project ID, nullable folder ID, include-subfolders flag).
- `ItemQuery` carries a scope, optional text across title/description/ticket, field
  filters combined with AND, and an include-completed flag.
- `FieldFilter` carries a field key, an operator and an optional typed value.

Operator semantics are fixed up front, including missing values:

| Operator | Matches |
|----------|---------|
| `Equals`, `GreaterThan`, `LessThan`, `Between`, `Contains` | Items that **have** a value satisfying it |
| `NotEquals` | Items that have a value different from the given one (no value → no match) |
| `IsEmpty` / `IsNotEmpty` | Items without / with a value |

`FilterValue` is a small typed union (text, number, date, bool, choice id), not `object`.

**Implementation.** The server builds one parameterized, bounded
SQLite query. Built-in fields map to columns; custom fields use `EXISTS` subqueries on
`ItemFieldValue`. SQLite's `tt_fold` function provides Unicode-aware case-insensitive
text comparisons, and `instr` implements literal Contains without LIKE wildcards.
Free text uses a regular SQLite **FTS5** table that stores title, description and
ticket number. `TodoItemSearchRow` maps each item GUID to a stable integer primary key;
the same integer is the FTS rowid. This avoids relying on `TodoItem`'s implicit rowid,
which SQLite may renumber during `VACUUM` or a table rebuild:

- Kept current by insert/update/delete triggers in the same transaction as the item.
  The mapping table has a foreign key with `ON DELETE CASCADE`; a mapping-row delete
  trigger also removes its FTS row when SQLite cascades before the item's delete trigger.
- Soft-deleted rows stay in the index; search joins FTS hits through the mapping table
  back to `TodoItem`, so deleted-row and scope filters apply. Restore needs no index work.
- The migration backfills the mapping and FTS tables from existing items, so items that
  existed before Phase 4 are searchable immediately.
- The Phase 4 migration renames any existing custom field with a reserved key using
  the normal numeric suffix rule. No saved searches reference keys yet.
- A later migration that rebuilds `TodoItem` recreates the search triggers and
  reconciles mapping and FTS rows; the schema test checks trigger presence.
- Tests cover pre-existing rows, insert, edit, soft delete, restore and hard delete.

All search code is tested against real SQLite.

- Built-in field types include title, ticket and status (Text), type and priority (Choice),
  due and scheduled (Date), and completed (Boolean, displayed as "Completed"). Scheduled
  comparisons use the date of `ScheduledStart`.
- Text supports Equals and NotEquals (trimmed and case-insensitive), Contains
  (case-insensitive), IsEmpty and IsNotEmpty. Number and Date also support ordered
  comparisons and inclusive Between with a valid min ≤ max range. Boolean and Choice
  support Equals, NotEquals, IsEmpty and IsNotEmpty. Priority alone supports ordered
  comparisons by current rank, with the top level most important; an absent priority
  never matches an ordered comparison.
- IsEmpty and IsNotEmpty take no value. Other operators require the matching typed
  value. The service rejects unknown fields, incompatible operators or values, invalid
  ranges, choices outside the field, and nonexistent Project or Area scope projects.
- Priority Between takes a `FilterValue.ChoiceRange` whose endpoints are active
  priority-level IDs, ordered from more important to less important.
- Free text is trimmed; blank text is ignored. Whitespace-separated terms become
  escaped FTS5 quoted prefix phrases joined by AND. The index uses
  `unicode61 remove_diacritics 2`; raw user text never reaches `MATCH`.
- `IncludeCompleted=false` excludes completed items even when another status filter
  is present. Sub-items are regular results. Deleted items, folders and projects are
  excluded. An Area with no folder searches the project root, or the whole project
  when IncludeSubfolders is true; a folder Area can include all descendants.
- Search returns a compact item result and HasMore, with a default limit of 200.
  Results order by the actual FTS score when text is present, then project sort order,
  Unicode-folded title, and item ID. Filtering, ordering, projection and `limit + 1`
  happen in SQL.

- The search screen keeps its originating page for Back/Escape. Its scope starts at all projects
  from Home, the project from a workspace root, or the selected folder from a workspace folder.
  Changing scope removes filters whose fields are unavailable in the new scope.

The text syntax and saved searches are specified in §7.7.

### 7.3 What v1 does to stay ready

- Built-in fields are ordinary typed columns with indexes (above).
- `TodoItem` has no catch-all "extra data" blob that search would have to unpick later.
- Adding the Phase 3 tables is an additive migration; no v1 table changes.

### 7.4 Calendar (Phase 5)

- A due date produces an all-day entry, or a timed entry when DueTime is set. A schedule produces a separate block; a missing end, or an end that is not after the start (a zero-length schedule), makes a 30-minute block. Both entries appear when both fields are set, including on sub-items.
- Completed entries are hidden by default; Include completed shows them muted and checked. Deleted items, folders, and projects are excluded.
- Month shows six weeks starting on the culture's first day of week. Days outside the month are dimmed. All-day entries precede timed entries; after three entries, +N more opens that day in Week.
- Week has seven columns, an all-day row, and a 00:00–24:00 time grid at 48 pixels per hour. It opens scrolled to 07:00. Timed due entries are 30-minute markers and scheduled blocks are exactly as tall as their duration (a block with no end is 30 minutes); entries split width only when their real intervals overlap, so touching blocks do not. A marker that would pass 24:00 is moved up to end at midnight. Blocks shorter than 40 pixels put the urgency label and title on one line. The all-day row grows to hold every all-day entry of the week, and entries fill their day column. Within a day entries are ordered all-day first, then by start, then by title (culture-aware, ignoring case), then by item id.
- Today comes from the injected Effect Clock and explicit local time zone. Previous, Today, Next, Month and Week control the period. PageUp/PageDown change periods (also with an entry focused, but not while a text box has focus); Ctrl+Shift+M/W switch views. With an entry focused, plain ↑/↓ move through that day's entries, ←/→ go to the nearest day with entries, and Home/End go to the first and last entry shown.
- The scope is All projects from Home or This project from a workspace. Include completed is available in either scope.
- Home, workspace, and Ctrl+Shift+C open the calendar. Back or Escape (with no modifiers) restores the previous page. Search and Calendar never stack: opening one from the other disposes it and keeps the original page as the single return target, so Back lands on that page and activating an entry or result asks that page's unsaved-changes guard once. An entry activation still pending when the calendar is left is dropped. Activating an entry opens its current workspace folder and selects it, subject to the unsaved-changes guard. A deleted item reloads the calendar and reports “This item no longer exists”. Month navigation moves from the first day of the month.
- Entries use their own urgency, refreshed each minute, and show it as a label (Approaching, Imminent, Overdue) with a bold title when overdue, never by colour alone; tooltips show type and priority.
- Drag to reschedule (Phase 5b). Pointer and keyboard use the same rules, with a typed intent from React and a server transaction that revalidates the item and rejects deleted items:
  - A press that moves less than 4 pixels is a click and still opens the item. Past that the entry is dragged; Escape cancels, and releasing outside every day area saves nothing. A drop that lands on the same slot is a no-op and does not save. Completed entries can be dragged too.
  - Month: dropping on another day cell sets a due entry's date and keeps its DueTime; a scheduled entry's start moves to the same time on that day, keeping its length (a schedule without an end stays without one). The cell is outlined while the pointer is over it.
  - Week all-day row: a due entry changes date; a timed due entry also loses its DueTime. A scheduled block cannot be dropped there (ignored, no indicator).
  - Week time grid: a due entry (all-day or timed) takes the dropped day and time; a block's start becomes the dropped time and its length is kept. A ghost block with the time shows the snapped position. The drop position uses where the block was grabbed, so it does not jump (an all-day entry is placed by the pointer itself).
  - Times snap to 15 minutes and are clamped to 00:00–23:45 so the start stays on the dropped day. A block that crosses midnight moves as a whole, whichever day of it is dragged.
  - Keyboard: with an entry focused, Alt+←/→ moves it one day and Alt+↑/↓ moves a timed due entry or scheduled block 15 minutes (month and week). Alt+↑/↓ does nothing for an all-day entry. A time between quarter hours first lands on the next quarter in the direction of the key (10:07 goes to 10:15 with Alt+↓ and to 10:00 with Alt+↑). Timed entries stop at 00:00 and 23:45 instead of crossing midnight.
  - Focus stays on the moved entry after the reload. If it is no longer shown, focus goes to its day's "+N more" button, or to Previous or Next when the entry left the visible period; the period itself does not move.
  - While a move is saving, newer key steps on the same entry are added together and a newer drop replaces a waiting one; the waiting move is planned against the entry as reloaded (or as last saved when it left the visible period), so a held key keeps moving it and a reload between pointer press and drop never uses stale values. A failed move discards the waiting ones.
  - Pointer details: only the left button drags. A press that did not start on an entry (including "+N more" and scrollbars) never drags; a hover after a lost button release does not drag; releasing another button mid-drag does not drop; scrolling the week grid with the wheel during a drag updates the ghost time. Extra buttons pressed mid-gesture never start or retarget a drag.
  - After a move the calendar reloads and urgency is recomputed. A rule failure (for example the item was deleted) reloads and shows its message inline. Dragging does not auto-scroll the week grid.

### 7.5 Item drag-and-drop

- A left-button row press becomes a drag at 4 pixels. Escape or capture loss cancels;
  a shorter movement remains a click. Top and bottom thirds place before and after
  a row; the middle third makes the dragged item the row's last child. The view shows
  an insertion edge or row outline. Folder targets are highlighted.
- A sub-item may be promoted between top-level rows in its current area. A top-level
  item may be dropped on a folder or project root, appending its whole subtree there.
  A sub-item cannot be dropped on a folder. Self and descendant targets are rejected.
- Completed rows are ordered by completion time (§6.2), so they cannot be reordered by
  drag: a before/after drop that involves a finished row (as the dragged item or the
  target) shows no indicator and does nothing. A middle-third "into" drop on a finished
  row is allowed (§6.1 reopens the parent when an open sub-item moves in), as is dragging
  a finished item into another row. Completion is reconciled for old and new parents
  according to §6.1.
- Drop feedback: "into" tints the target row with the accent color and shows a
  "Make sub-item" label, so it is distinct from the selection outline; the dragged row
  is dimmed while the drag is active.
- Alt+→ and Tab indent under the previous sibling. Alt+← and Shift+Tab place
  the item immediately after its parent. Ctrl+Shift+L opens Move to… for a selected top-level item; the context
  menu offers the same folder picker. Ctrl+Shift+M is already used by Calendar.
- A move consults the existing unsaved-editor guard before reloading. A cancelled
  guard cancels the move; Save or Discard follows the user's guard choice. The moved
  item remains selected after a move within the area. A second move is ignored while
  one is saving. Navigation, a newer selection (even if it returns to the same item),
  and edits typed during the save take precedence when the move finishes; a newer
  editor draft also keeps keyboard focus.

### 7.6 Trash

The trash lists **deletion batches** (§5.3), not individual rows: one row per `DeletionBatchId`.

- **Row contents.** The top node of the batch (the project, folder or item that was deleted
  directly; rows deleted earlier keep their own batch), its kind, where it was, when it was
  deleted, and what it contains. *Where it was* is the project name, the folder names down to
  its parent, and for a sub-item the titles of its parent items, joined by ›; names are used
  even when those parents are deleted too. A project's location is "Home". *When* is the
  deletion time in the local zone, formatted with the current culture. *Contains* counts the
  folders and items of the batch, including the top node itself ("1 item", "2 folders, 5 items").
  Rows are ordered by deletion time, newest first.
- **Scope.** All projects (including deleted projects) or This project. Opened from Home the
  only scope is All projects; opened from a workspace (also when search or the calendar was
  opened from it) the default is This project.
- **Restore** restores exactly the rows of the batch and nothing else; rows deleted earlier in
  other batches stay deleted and appear as their own rows. If the top node's parent is still
  deleted, Restore is disabled and the reason is shown under the row: "Restore the folder 'X'
  first" (parent folder, or the folder of an item), "Restore the item 'X' first" (a sub-item
  whose parent item was deleted later), or "Restore the project first". There is no "restore
  with parent". The restored top node goes **after the largest sort order among its siblings** (the end; gaps stay); its descendants keep
  their order.
- **Completion on restore (§6.1).** Restore behaves like adding the rows back: with
  `AutoCompleteParentWhenChildrenComplete` on, the project is reconciled in the same save, so
  an open item restored under a completed parent reopens that parent (and its ancestors), and a
  completed item restored under a parent whose other children are all complete keeps it
  complete. With the setting off nothing changes.
- **Search and calendar.** Deleting never touches the full-text rows (§7.2) and restore just
  clears the deletion fields, so restored items are searchable and appear in the calendar at
  once; deleted items are excluded from both.
- **Delete permanently** (behind a confirmation) hard-deletes the batch. Custom field values go
  with their item (cascade) and the search rows go through the existing triggers. It is
  refused with a rule error ("'X' still belongs to 'Y'. Delete 'X' permanently first.") while
  a row outside the batch still points into it: an earlier-deleted sub-item of a deleted item,
  an earlier-deleted item or sub-folder of a deleted folder, or a live row (impossible through
  the services, but checked rather than assumed). The exception is a **project**: purging a
  project removes the whole project, including batches deleted from it earlier, its own custom
  fields (with choices and values) and its setting overrides, because nothing can outlive it.
  The confirmation for a project says so ("This also deletes the N entries deleted from this
  project earlier"), because those are separate rows that vanish with it.
- **Irreversible confirmations** (Delete permanently, Empty trash) use a destructive dialog:
  The confirmation makes Cancel the default and focused
  button, so Enter or Escape cancels and only a click on the confirm button destroys data. Other
  dialogs keep their existing behaviour.
- **One change at a time.** A second Restore, Delete permanently or Empty trash is ignored
  while one (or its confirmation) is in progress.
- **Empty trash** (behind a confirmation) permanently deletes everything in scope in one
  transaction: all deleted folders and items, and deleted projects with all they own. Live rows
  are never touched; one that points at a deleted row stops the operation.
- **Navigation.** View → Trash and Ctrl+Shift+T (exact
  modifiers). Back or Escape (no modifiers) returns. Search, Calendar and Trash share the
  single return page described in §7.4, so Back always lands on the page the first of them was
  opened from. Opening the trash keeps the page behind it, including an unsaved editor draft,
  alive. If something was restored, returning reloads that page (Home recounts its projects; a
  workspace reloads keeping its selected folder and item), which asks the unsaved-changes guard
  once; Cancel stays on the page you are leaving. The shell remembers that the page behind is
  out of date as soon as a restore starts, so the refresh also happens when search or the
  calendar replaced the trash first, or when the restore was still running; the flag clears
  once the page behind is shown again. Back and Escape are ignored while the trash is busy
  with a restore, a permanent deletion or its confirmation.
- **Failures** (a batch already gone, a refused purge) show inline on the page and the list
  reloads. Loads are cancellable: a newer load replaces an older one, and leaving the page
  ignores any load still running.
- **Code.** The server owns each list, restore, purge or empty transaction and uses
  explicit queries for deleted rows across projects.

### 7.7 Query syntax and saved searches

The Search page has one query box. Plain words work exactly as before (free text); the syntax below adds
field conditions. `ItemQueryParser` (Core, `Search/Syntax`, pure) turns text into free text plus
`FieldFilter`s; `ItemQueryFormatter` turns them back into canonical text.

**Grammar.** Terms are separated by whitespace. Keys are matched case-insensitively against the field
keys visible in the current scope (built-ins and custom slugs); display names are not accepted.

```
query    = { term }
term     = word | phrase | clause
word     = any run of non-space characters that is not a clause   -> free text
phrase   = '"' chars '"'                                          -> free text (\" and \\ are escapes)
clause   = key op value | 'has:' key | 'no:' key | 'is:' ('done' | 'open' | 'recurring')
op       = ':'  '!='  '>'  '<'  '>='  '<='  '~'
value    = endpoint [ '..' endpoint ]                             (a range only after ':')
endpoint = quoted string | run of characters up to a space or '..'
```

| Written | Meaning |
|---------|---------|
| `key:value` | Equals (exact, trimmed, case-insensitive for text) |
| `key!=value` | NotEquals |
| `key~value` | Contains (text fields only) |
| `key>value`, `key<value` | GreaterThan / LessThan (numbers, dates, priority; `priority>high` = more important than High) |
| `key>=value`, `key<=value` | Dates and priority only, translated exactly: `due>=D` is `due>(D-1 day)` except at the minimum date, where it means `has:due`; `due<=D` uses the following day except at the maximum date, where it means `has:due`. `priority>=high` is the range from the top level to High, `priority<=high` from High to the bottom level. Numbers reject them with a hint (use `>`, `<` or a range) |
| `key:a..b` | Between, inclusive (numbers, dates, priority; priority runs more important to less important) |
| `has:key` / `no:key` | IsNotEmpty / IsEmpty |
| `is:recurring` | `repeats` Equals true (§7.11) |
| `is:done` / `is:completed` / `is:open` | `completed` Equals true / true / false; a query asking for completed items turns Include completed on |

Values: Text as written (quote when it has spaces); Number with the **invariant** culture (a dot for
decimals; a saved search must mean the same on every machine); Boolean `yes|no|true|false`; Choice by
label (case-insensitive) or by unquoted `#<guid>` id (quote an id-shaped label), and a priority also by its
unquoted number (`priority:7`, then a level named "7"; §7.15); `status` is Text over status names; Date `yyyy-MM-dd`, `today`, `tomorrow`, `yesterday`, or an
offset such as `+3d` / `-1w`, resolved with the injected Effect Clock and the explicit time zone (§5.4).
Words that contain `:` and are not a field (`http://x`) are errors until quoted. A bare `has`, `no` or `is`
word is free text; as `has:`, `no:`, `is:` they are keywords, hence reserved (§7.1).

**Errors** never throw. Each `QueryParseError` has a position, a length and a message: unterminated quote,
unknown field (with "Did you mean" for names within two edits, otherwise the list of fields), operator not
allowed for the field type (listing the allowed ones, from `SearchOperators`), missing value, bad
number/date/boolean, unknown choice (listing the choices), reversed range. All errors in the text are
reported together; nothing runs when there is one.

**Round trip.** `Format(Parse(x))` is stable: free text first, then clauses in order, choices by label,
dates as ISO, numbers invariant, text quoted only when it would otherwise be misread (spaces, quotes,
backslashes, `: ~ < > !`, `..`).

**Search page.** The box and the filter rows describe one query. Enter (or Search) parses text typed
since the last run: on success the rows are rebuilt (incomplete rows are dropped) and the search runs; on
error the messages appear under the box, each naming the offending token and character, and nothing
runs. The text stays as typed (so `due<today` stays relative); editing a row, adding or removing one, or
changing the free text rewrites the box in canonical form from the complete, valid rows. A "?" button opens
a popup of examples.
The scope selector offers "Project root only" when a project is available. It represents
`Area(projectId, null, false)` and excludes items in folders.

**Saved searches.** Table `SavedSearch` (additive migration): `Id`, `Name` (unique, case-insensitive,
trimmed, ≤ 300), `QueryText`, `ScopeKind` (`AllProjects|Project|Folder`), `ProjectId?`, `FolderId?`,
`IncludeSubfolders`, `IncludeCompleted`, `SortOrder`, `CreatedAtUtc`, `UpdatedAtUtc`. Project and folder ids
are deliberately **not** foreign keys.

- **Stable text.** The stored query is the parser's `StableText`: free text and clauses with every choice
  written as `#<guid>` and dates exactly as typed. Renaming a label never breaks a saved search (§7.1);
  relative dates keep moving. Ids are never shown: opening a saved search shows `DisplayText` (labels).
- **Opening** shows the Search page with the saved scope
  (a project or folder scope uses it as the page's origin), include-completed, text and rows, and runs it.
  Opened from the Search page it replaces that page and keeps the original return page (§7.4).
- **Stale searches** show an inline error instead of results: `The saved search 'X' can't be run.` plus the
  reason: an archived or deleted field (unknown field), a deleted choice ("no longer exists"), or a
  deleted project or folder ("Search project does not exist."). A saved search deleted meanwhile reports
  "This saved search no longer exists." and the lists refresh.
- **Saved-search service** (one server transaction per operation): `ListAsync`, `FindAsync`, `SaveAsync(name,
  definition, overwrite)`, `RenameAsync`, `DeleteAsync` (hard delete), `ReorderAsync`. Saving an existing
  name without `overwrite` is a rule error; the UI asks "Replace it?" first. Names clash case-insensitively
  (the database backs this with a `NOCASE` unique index). Saving requires the scope's project to exist.
  Reordering is service-only for now; the lists show the stored order.
- **UI.** The Search page has Save search, Rename and Delete (acting on the saved search currently open) and
  a chip per saved search that opens it. Home has a "Saved searches" section (hidden when empty) with each
  search as a link plus Rename and Delete. Returning to Home reloads the list.

### 7.8 Undo and redo

**History.** A server-scoped undo history keeps the last 50 undoable steps in memory for the
session; restarting clears it. One user action is one step however many rows it touches (a
completion cascade, a deleted branch, a renumbered sibling list). Recording a new step drops
every step that was undone, so redo is cleared by any new action.

**What is recorded.** Recording is opt-in and explicit. A service that performs an undoable user
action records a label and publishes the step only after its transaction commits.
The label names the item the user acted on (completing a child that auto-completes its parent
is "Complete 'Child'"). A labelled save captures added, modified and deleted items, folders,
projects, item field values, links, lookups, field definitions and choices, settings, and
saved searches in one step. Timestamp-only updates are discarded so they do not invalidate
earlier steps. Reminder delivery markers are excluded from snapshots of item data.

**Applying a step.** Undo and redo write the recorded values back in one transaction. Before
writing, every affected row (soft-deleted ones included) is compared with the values the step left
behind. If any row differs the whole step is refused and the history position does not move:
"This item changed since; can't undo." (or "redo"; "folder" or "project" for those rows). A row
that no longer exists, because its deletion was purged from the trash, gives "This item was
permanently deleted since; can't undo." A refused step changes nothing; there is no partial undo.

- Undo and redo hold the same write gate as ticket moves, item edits and completion, from
  selecting a step until the history position has been updated. The step uses the history's
  lease and one database transaction for its verification and save. A replayed hard delete
  requires every dependent user-data row to be part of the same removal. The search index is
  maintained by its triggers. Replay refuses to activate a row beneath a deleted ancestor and
  uses the same restore-first message as Trash. It also refuses to leave newer rows in a
  deleted branch or invalidate custom fields, choices, lookup lists or settings.

**UI.** Ctrl+Z undoes; Ctrl+Y and Ctrl+Shift+Z redo. The shortcuts work anywhere in the main window
(workspace, calendar, search, trash, settings, Home) except while a text box has focus (quick add, search
box, a date picker's text, an editable combo box), where Ctrl+Z keeps its normal text-editing
meaning. With nothing to undo or redo the keys do nothing at all, silently. The Edit menu
has Undo and Redo entries whose labels name the action ("Undo: Complete 'Write report'"); they
are disabled when there is nothing to do. A status toast at the bottom of the workspace (an
overlay, so nothing moves) shows "Undid: ...", "Redid: ..." or a refusal. It clears on the next
recorded action and when the user goes to another screen. Refusals on screens without the toast
are shown in a message box. The React shell coordinates these interactions across screens. A failure other than a refused step is reported
through the shell's unexpected-error message instead of crashing the app. If a write-back would
break a foreign key (a choice or lookup the step used was removed since), it is refused as
"This change references something that was removed; can't undo."

**Reloading.** After a step the screen on show reloads: the workspace keeps its folder and the
selected item when they still exist, the calendar and trash lists reload, saved-search lists and
settings reload, and Home recounts. Search refreshes field and choice metadata, drops invalid
filters and reruns a query that already ran. Search, Calendar, Trash, Today and Tickets also
mark the page behind them out of date. Back reloads the return page, including App Settings
and Project Settings, through its unsaved-changes guard.

**Dirty editor rule.** While the item editor holds unsaved edits, undo and redo are blocked with
"Save or discard your item edits before undoing or redoing." The draft is untouched. (Reloading
under a draft would either lose it or ask a question the user did not trigger.) Unsaved global
or project settings also block undo and redo until saved or discarded. In App Settings this
includes pending lookup entries, number edits and renames.

#### Undo coverage

The operation names in the table refer to the legacy service API at `legacy-final`.
The TypeScript port carries forward the behavior and coverage.

| Service | Write operation | Label before audit | Coverage | Reason for exclusion |
|--------|-----------------|--------------------|----------|----------------------|
| ItemService | `CreateAsync` (item or sub-item), `EditAsync` (both overloads), `SaveEditorAsync` (including custom values, links, recurrence and status) | Yes | Undoable | |
| ItemService | `SetCompletedAsync` (complete or reopen), `SetStatusAsync`, `SetPriorityAsync` | Yes | Undoable | |
| ItemService | `MoveAsync`, `MoveAtAsync` (including drag), `MoveToAreaAsync`, `IndentAsync`, `OutdentAsync`, `ReorderAsync` | Yes | Undoable | |
| ItemService | `PushBackOneDayAsync`, `SkipRepeatAsync`, `StopRepeatingAsync`, `DeleteAsync` | Yes | Undoable | |
| ItemService | `RestoreAsync` | No | Undoable | |
| ProjectService | `CreateAsync`, `ReorderAsync`, `RestoreAsync` | No | Undoable | |
| ProjectService | `RenameAsync`, `DeleteAsync` | Yes | Undoable | |
| FolderService | `CreateAsync`, `RestoreAsync` | No | Undoable | |
| FolderService | `RenameAsync`, `MoveAsync`, `ReorderAsync`, `DeleteAsync` | Yes | Undoable | |
| LookupService | `AddItemTypeAsync`, `RenameItemTypeAsync`, `ArchiveItemTypeAsync`, `UnarchiveItemTypeAsync`, `ReorderItemTypesAsync` | No | Undoable subject to lookup uniqueness | |
| LookupService | `AddPriorityLevelAsync` (both overloads), `SetPriorityNumberAsync` | Yes | Undoable subject to lookup uniqueness | |
| LookupService | `RenamePriorityLevelAsync`, `ArchivePriorityLevelAsync`, `UnarchivePriorityLevelAsync`, `ReorderPriorityLevelsAsync` | No | Undoable subject to lookup uniqueness | |
| LookupService | `AddStatusAsync`, `RenameStatusAsync`, `SetStatusArchivedAsync` (archive and restore), `ReorderStatusesAsync` | Yes | Undoable subject to lookup uniqueness | |
| FieldService | `CreateAsync`, `RenameAsync`, `ChangeTypeAsync`, `ArchiveAsync`, `UnarchiveAsync`, `ReorderAsync` | No | Undoable | |
| FieldService | `AddChoiceAsync`, `RenameChoiceAsync`, `ArchiveChoiceAsync`, `UnarchiveChoiceAsync`, `ReorderChoicesAsync` | No | Undoable | |
| SettingsService | `SetGlobalAsync`, `SaveGlobalAsync` (database-only preferences) | No | Undoable, including recorded effective auto-completion transitions | |
| SettingsService | `SaveProjectAsync`, `SetProjectOverrideAsync`, `ClearProjectOverrideAsync` | No | Undoable, including recorded effective auto-completion transitions | |
| SettingsService | Start with system, through `SetGlobalAsync` or `SaveGlobalAsync` | No | Excluded | The OS sign-in entry is outside the database transaction and its update can fail independently. Its stored preference is excluded from any mixed step. |
| SavedSearchService | `SaveAsync` (new or overwrite), `RenameAsync`, `DeleteAsync`, `ReorderAsync` | No | Undoable | |
| TrashService | `RestoreAsync` | Yes | Undoable | |
| TrashService | `PurgeAsync`, `EmptyAsync` | No | Excluded | Intentional permanent removal of rows, including owned data. A purge prevents replay of any soft delete or restore that needs those rows. |
| CalendarRescheduleService | `MoveDueAsync`, `MoveScheduleAsync` | Yes | Undoable | |
| TicketService | `MoveAsync`, `SetPriorityAsync` | Yes | Undoable | |
| ReminderService | `SnoozeAsync` | Yes | Undoable | |
| ReminderService | `RecordDeliveryAsync` | No | Excluded | Delivery bookkeeping prevents repeated notifications. |
| Reminders panel | Dismiss | No | Excluded | Hides a delivered reminder for the session without changing stored user data. |
| DataTransferService | `ImportJsonAsync`, `ImportCsvAsync` | No | Excluded | Bulk additions use the pre-import database backup for recovery (§7.9). |
| Database initialization | Seed and migrate | No | Excluded | Initializes and upgrades storage outside user history. |

Project and folder deletion captures the whole soft-delete batch, preserving earlier batches.
Undoing a delete restores the exact prior order. Restoring from Trash appends the top node
as specified in §7.6 and records its own step. Undoing that restore reinstates the batch and
makes the delete the next step. Lookup replay checks the final list for duplicate ranks,
names (using Core's case-insensitive comparison, including archived names) and active priority
numbers. Setting changes and any auto-complete reconciliation are recorded together. Replay
requires the recorded before and after effective values for each reconciled project. Bulk
global saves skip unchanged effective defaults, so a startup-only save leaves history intact.

### 7.9 Import and export

The server exports and imports with one transaction per public operation.

**JSON export (full fidelity).** One versioned document: `{"format":"task-tracker","version":1,"exportedAtUtc":...,"scope":"all"|"project",...}`,
camelCase, indented, nulls omitted, UTF-8 without BOM, text left readable (no `\u` escapes). Content, in order:
`itemTypes`, `priorityLevels` (each with `id`, `name`, colour/icon key, built-in and archived flags, sort order, archived ones included),
`fields` (global and project definitions with `key`, `displayName`, `dataType`, `projectId`, archived flag, sort order and their
`choices` with ids, labels, order and archived flag), `globalSettings` (reference only), `projects`, `savedSearches`.
A project holds `settings` (its overrides), `folders` and `items`. An item has every §5 field: type and priority by name **and** id,
`dueDate` (`yyyy-MM-dd`), `dueTime` (`HH:mm:ss`), `scheduledStart`/`scheduledEnd` as floating local values **without offset**
(`2026-11-21T09:00:00`, §5.4), `completedAtUtc` and the timestamps as UTC with `Z`, `sortOrder`, ticket, description, and
`links` (optional, §7.10), `recurrence`, `recurrenceSeriesId` and `recurrenceSuccessorCreated` (optional, §7.11), `fieldValues` (`fieldKey` plus exactly one of `text`, `number`, `date`, `boolean`, or a choice by `choiceLabel` and `choiceId`).
Order is deterministic (sort order, then creation time, title, id), so exporting equal data twice gives equal text. Invariant
culture throughout.

- **Scope.** The whole database, or one project: then only that project, the lookups and global fields its items use, its own
  fields, its overrides and the saved searches scoped to it or its folders. Global settings are exported for the whole database only.
- **Soft-deleted rows are excluded** (projects, folders, items, and the custom values and saved searches that point into them).
  There is no "include trash" option: the trash is for restoring, an export is for the live data.

**JSON import** reads a file produced by export and adds it as **new data**. Appending open tickets
can also assign missing ranks to existing tickets in those sections (§7.16).

- *Validation first, in memory:* `format` must be `task-tracker`; a `version` above 1 is refused with "written by a newer version"
  (older or missing versions are refused too); then required fields, unique ids, references (parents, folders, lookups, field keys,
  choices, saved-search scopes), the §5.1 hierarchy invariants (parent in the same project, sub-item in its parent's folder, no
  cycles, folder parents in the same project), the date rules (due time needs a due date, end needs a start and is not before it,
  floating times carry no `Z` or offset, UTC times end with `Z`) and the §7.1 value rules (exactly one value matching the field type,
  choice belongs to the field, project field only on that project's items, finite numbers, no blank text, one value per field per
  item). All problems are reported together, each with a JSON path (`$.projects[0].items[3].dueDate`).
- *Matching and creating:* projects always get new ids; a project whose name exists gets " (imported)", " (imported 2)", ... Item types
  and priority levels match by name ignoring case, otherwise are created after the existing ones (archived flags kept). A global field
  matches an existing global field by key ignoring case (a different data type is an error); otherwise it is created, keeping its key
  when free. Project fields are always created (key numbered and display name suffixed " (imported)" if taken). Choices of a matched
  field match by label, missing ones are created. Folders, items, sub-items and values are recreated with new ids, keeping sort orders,
  completion and timestamps. Project overrides are imported; **global settings in the file are ignored**. If an override would leave
  the project with invalid thresholds against this database's global settings, the import is refused.
- *Saved searches* are created as new ones (name clashes suffixed like projects), pointing at the new project and folder ids. The
  `#id` choices in their stored query text (§7.7) are rewritten to the ids the choices now have. If a legacy custom `link` or `repeats` field is
  renumbered, its saved-search references are rewritten in scopes that include the field. Other renumbered project-field keys can
  leave a saved search stale, with the usual "can't be run" message.
- *Completion (§6.1)*: where the project's effective auto-complete setting is on, imported trees are reconciled before saving.
- *All or nothing:* one unit of work, one save. A failure leaves nothing tracked or stored. Imports are **not undoable** (no undo step
  is recorded). The UI asks for confirmation first and `IDatabaseBackup` (the SQLite backup API, as used before migrations) copies
  the database immediately before the save; its path is reported. Import backups (`tasktracker-import-<stamp>.db.bak`) and migration
  backups (`tasktracker-<stamp>.db.bak`) are separate pools of the five newest each, so imports never evict the pre-migration copy.
  Failing to delete an old backup after a successful copy is traced and ignored; a backup that cannot be made stops the import
  (an `IOException` the UI shows) before anything is saved.
- *Robustness:* a `null` where a list needs an object (`"projects":[null]`, and likewise items, folders, fields, choices, item
  types, priority levels, field values, saved searches) is reported as `$.projects[0]: must be an object`. A leading byte order mark
  is accepted. Lengths use the domain's rule exactly: names, titles, labels and ticket numbers are measured **after trimming**
  (`TodoItem.TitleMaxLength` and friends), so a value that the importer accepts can never fail later without a path.

**CSV export** writes a project's items (all of them, in screen order: root, then folders, sub-items under their parent) or the
current search results (all matches, not just the first 200, in result order) as a flat table, UTF-8 **with BOM** (for Excel),
RFC 4180: comma separated, CRLF line ends, cells with a comma, quote, line break or leading/trailing space or tab are quoted,
quotes doubled. Columns: `Title, Description, Ticket, Type, Priority, Priority reference, Status, Due date, Due time, Scheduled start, Scheduled end,
Completed (yes/no), Completed at, Project, Folder path` (names joined by `/`), `Parent title`, `Links` (addresses separated by spaces, §7.10), `Repeats` (read-only, §7.11), then one column per custom field by
display name (active fields, and archived ones that have a value; fields sharing a name share a column). Dates and numbers are ISO
and invariant (`2026-11-20`, `15:00:00`, `2.5`), whatever the culture.

- **Custom-field headers.** Export and import match names case-insensitively and add one ` (field)` suffix to a fixed column
  name or to a name that already consists of a fixed name followed by one or more such suffixes. For example, the fields
  `Links` and `Links (field)` use `Links (field)` and `Links (field) (field)`. Plain `Links` imports as item links. If the
  target has an active custom field named `Links`, an invalid address in that column produces a row error about the ambiguity
  and explains how to rename the header for legacy custom-field values.

**Formula injection.** Excel runs a cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return as a formula. An export
therefore puts an apostrophe in front of any text cell (title, description, ticket, type, priority, project, folder path, parent
title, text field values, choice labels) whose text, ignoring leading apostrophes, starts like that: `=SUM(A1)` becomes `'=SUM(A1)`,
and `'=x` becomes `''=x`. An import removes exactly one leading apostrophe from a text cell when what follows (ignoring further
apostrophes) starts like a formula, so exported files round-trip unchanged and a hand-typed `'note` keeps its apostrophe. Numbers and
dates are never altered.

**Reading files.** Import files must be UTF-8 (a BOM is fine). Decoding is strict: another encoding is refused with "This file isn't
UTF-8. Re-save it as 'CSV UTF-8' and try again" (UTF-8 text for JSON) instead of importing garbled text. Files over 50 MB are refused
with a message before they are read.

**CSV import** targets a chosen project and optionally one of its folders (default: the root). Headers match by name ignoring case.
`Project`, `Folder path` and `Parent title` are recognised but ignored: **every row becomes a top-level item** at the end of the area
(sub-items are not rebuilt; the simple rule beats guessing among equal titles). `Repeats` is also recognised and ignored.
Other unknown columns are reported and ignored.
Type matches by name. Priority uses the reference or the legacy name and label rules in §7.15.
An unknown or archived lookup is an **error** and the message lists the valid alternatives. Custom fields match by display name among the project's active fields; values follow §7.1:
number with a dot (a decimal comma is refused with a hint), `yyyy-MM-dd` date, yes/no, choice by label, blank cell = no value.
`Completed` = yes without `Completed at` completes now; `Completed at` needs `Z`. Rows with fewer cells than the header are padded;
more is an error. Row numbers count like a spreadsheet (header = row 1) and appear in every error (`Row 4, Type`).
The **preview** (`PreviewCsvAsync`, no writes) reports row count, columns used, unknown and ignored columns, the first five rows and
every error; nothing is imported while there is an error. Commit re-checks the file and creates all rows in one save, after a backup.

**UI.** From Home, File offers Export everything (JSON) and Import JSON. Project offers Export project (JSON),
Export project (CSV), and Import CSV into project. A project is chosen from a list, a folder from the usual folder list (only when the project has folders), the file
through the Electron file picker exposed through narrow preload IPC. Cancelling any picker or confirmation does nothing. A JSON import first shows the validation errors, or asks
"Import N projects ...? ... can't be undone ... a backup is saved first". The CSV preview is a dialog with an Import button only when
it has no errors; its rows with errors are marked. Home reloads after an import and shows a status line. Reading, checking, exporting and importing run
off the UI thread; while one runs, transfer commands are disabled and a progress bar shows.
The Search page's "Export results (CSV)" re-runs the last search without the 200-row limit. For end-to-end tests only,
`CompositionRoot` swaps in a picker that answers with a fixed path, and only when **both** `TASKTRACKER_TEST_FILE_PATH` and
`TASKTRACKER_SMOKE=1` are set (README.md); the real picker never reads those variables.

### 7.10 Markdown and links

**Markdown descriptions.** `TodoItem.Description` is the same column as before and holds Markdown. Markdown is a superset of the
plain text already stored, so there is no data migration. The item editor shows **Edit | Preview** tabs above the description: Edit is
the multi-line text box; Preview renders the text read-only. Previewing is a view mode only (it never makes the editor dirty, and a
newly selected item opens in Edit).

- **Parsing.** Render a bounded Markdown preview as React content with raw HTML disabled.
- **Supported:** headings, emphasis and strong, inline code, fenced and indented code blocks, bullet and numbered lists (nested, a
  numbered list keeps its start number), task-list checkboxes (display only: not focusable, clicks do nothing, the stored text never
  changes), links and bare http(s) addresses, block quotes, horizontal rules. Single newlines are kept as line breaks, so existing plain
  multi-line descriptions look the same as before. Nothing else (tables, footnotes...) is interpreted; it shows as written.
- **Raw HTML is never interpreted.** The parser has HTML switched off, so `<b>x</b>` or an HTML block reaches the preview as literal text.
- **Images are never loaded.** An offline desktop app makes no network fetches and reads no local files for a description, so an image
  is shown as a link whose text is the alt text ("image" when empty); it is clickable only under the link rule below.
- **Limits** keep hostile or huge text from freezing the preview. The source is capped at 100,000 characters. Blocks, list entries
  and inline nodes share a 2,000-node limit and a 100,000-character display text limit that includes expanded link addresses.
  Containers nested deeper than 16 levels show as plain text. Input the parser refuses as too deeply nested is shown verbatim as a
  code block. A notice line says when the preview was cut short. The stored text is never changed.

**Opening links.** Links in the preview open in the OS default handler through Electron main via preload (with a fake in tests), and **only for `http`, `https` and `mailto`** (`LinkPolicy`, Core). Any other scheme (`file:`,
`javascript:`, `ftp:`, custom schemes, relative paths) is shown as text followed by its address in parentheses and is not clickable; it
is never launched, and the launcher checks the policy again itself. There is no confirmation dialog: the user wrote or pasted the text,
and the address is shown in a tooltip. A failed launch shows a message. Both the preview and the Links list use the same launcher.

**Item links (attachments).** `ItemLink`: `Id` (Guid v7), `ItemId`, `Url` (at most 2000), `Title?` (at most 300), `SortOrder`,
`CreatedAtUtc`; table `ItemLink`, index `(ItemId, SortOrder)`, foreign key to `TodoItem` with `ON DELETE CASCADE`. The migration is
additive (`AddItemLinks`). It gives an existing custom field whose key is `link` the first free numeric suffix and rewrites references
in saved searches whose scope includes that field, because `link` is now a built-in search key (§7.2).

- **Rules** (`LinkPolicy`, one place for editor, services, import and the launcher): a trimmed, absolute `http`/`https` address with a
  host, or a `mailto:` address. Whitespace and control characters inside the address are rejected. An item holds at most 100 links.
  A blank title is stored as null.
- **File attachments are out of scope.** The app stores no files and no paths; a `file://` link is rejected, not just unopenable.
- **Editor.** The "Links" section lists the links (title or address, address underneath a title, tooltip, click opens) with move up,
  move down, Edit and remove buttons, then an address box, a title box and Add link (Enter in a box also adds). Edit loads a link into
  the boxes and the button becomes Update link. Cancel clears a pending entry or edit. Finish or cancel the current entry before
  editing another link. A message under the boxes explains a rejected link. Link changes are part
  of the item draft: they make the editor dirty, Revert restores the stored list, and Save writes them with the rest of the item. Text
  still in the boxes at Save is added first; if it is invalid, Save is refused with "Fix the link marked in red first.".
- **Save.** A non-null `links` replaces the whole list in the same transaction
  (matched by id: updated, removed or added; the list order becomes the sort order); null leaves the links alone. One save is one
  undo step.
- **Undo (§7.8).** `ItemLink` rows are collected by the undo row collector like item field values, so undo and redo re-insert, update
  and delete them, and a changed link makes the step refuse ("This item changed since; can't undo.").
- **Trash (§7.6).** Links stay with a soft-deleted item (nothing loads them while it is deleted), come back with a restore, and
  disappear with a permanent delete through the foreign key cascade.
- **Search (§7.2).** A built-in text field `link` ("Links") matches the address or title of any of the item's links: **Contains**
  (case-insensitive, literal), **IsEmpty**, **IsNotEmpty**; Equals and NotEquals are not offered for it. Links are not part of the
  full-text index (that would mean new triggers on another table for little gain); `link~wiki` or the filter row finds them.
- **Import and export (§7.9).** JSON: an item may carry `"links": [{"url": "...", "title": "..."}]` in list order, left out when empty.
  This is an optional property inside **version 1**: version 1 files without it import as before, and an older reader would simply
  ignore it, so the version number is not bumped. Import validates each entry with the editor's rules (path `...items[3].links[0]`),
  also `null` entries and more than 100 links, and creates the links with new ids. CSV: a `Links` column holds the addresses separated by
  single spaces (titles are not written); import reads it, each address validated like an editor link (`Row 4, Links`). A custom field
  named "Links" is written as "Links (field)" like any other fixed-header collision.

### 7.11 Recurring items

Decisions (made autonomously per the owner's 2026-11-14 instruction; listed for review):

- **Completing creates the next occurrence.** A repeating item is an ordinary item with a
  recurrence rule. Completing it leaves it completed, as history that the Completed section and
  the Today view show. In the **same transaction** it creates the next occurrence as a new open
  item. Nothing is projected into the future: the calendar and search show only real rows.
- **What is copied.** The next occurrence copies everything from the completed one except its
  dates and completion: title, description, ticket number, type, priority, custom field values,
  links, the rule, and the open/closed subtree. Every copied sub-item starts **open**. The new
  occurrence goes directly after the completed one in the same area and under the same parent,
  so manual order is kept.
- **Series.** Occurrences share a `RecurrenceSeriesId` (Guid). This is used for display ("repeats",
  ↻ marker) and for future features; no rule depends on it.
- **Rule.** Frequency is Daily, Weekly, Monthly or Yearly, with an interval "every N". The extra options are:
  - **Weekly:** a set of weekdays.
  - **Monthly:** a day of the month (1–31), or "last day". A day that a month lacks clamps to its last
    day, for example 31 becomes 30 or 28/29.
  - **Yearly:** a month and day; 29 Feb clamps to 28 Feb.
  - **Anchor:** **from the due date** (default: the next date strictly after the current due date
    that fits the rule) or **from the completion date** (the next date after the local completion
    day, §5.4).
  - **End:** never, on a date (the last allowed occurrence date, inclusive), or after N occurrences.
    The remaining count is stored on the rule and decreases on each new occurrence. When the end is
    reached, completing creates nothing and the status line says "That was the last repeat."
- **Dates that move.** A rule needs a due date or a scheduled start; the editor says so and won't
  save a rule without one. The due date moves to the next date. The due time, a floating local time,
  stays the same. A scheduled block moves by the same number of days as the due date, keeping its
  start time and length. With only a scheduled block, the block's start date is the anchor. "From
  the due date" skips missed dates: an item three weeks overdue on a weekly rule gets the first date
  after the current due date, not one occurrence per missed week.
- **Skip.** "Skip this one" moves the item's own dates to the next occurrence without completing it
  or creating a row. It is one undo step.
- **Completion rules (§6.1).** The next occurrence is created **before** parents are re-evaluated.
  So when a repeating sub-item completes, its new open sibling stops the parent from
  auto-completing. A repeating **parent** that auto-completes because its last child completed also
  creates its next occurrence, with its subtree reset to open. Reopening a completed occurrence by
  hand keeps the generated next occurrence. Undo of the completion removes the generated occurrence
  and restores the source in one step.
- **Stopping and deleting.** "Stop repeating" removes the rule from that occurrence only. Deleting an
  occurrence deletes only that row, which goes to the trash as usual; other occurrences are
  unaffected. Restoring from the trash restores the rule with the row.
- **Undo.** Completion with its next occurrence, Skip, setting or changing a rule, and Stop repeating
  are each one labelled undo step (§7.8).
- **Search (§7.7).** `is:recurring` matches items with a rule. The filter row has a "Repeats" yes/no
  built-in field.
- **Import/export (§7.9).** JSON adds an optional `recurrence` object on items and a
  `recurrenceSeriesId`, plus `recurrenceSuccessorCreated` when true, still format version 1.
  Validation and JSON paths are as usual. CSV export adds a read-only `Repeats` column with a
  plain description, for example "Every 2 weeks on Mon, Thu". CSV import ignores that column,
  and the preview says so.
- **UI.**
  - The editor has a **Repeat** section: a frequency dropdown (Does not repeat / Daily / Weekly /
    Monthly / Yearly), an interval box, weekday toggles (weekly), a day-of-month or "last day" choice
    (monthly), an anchor choice and end options. A one-line summary of the rule is shown below.
  - Repeating rows show a ↻ marker with the summary as a tooltip.
  - The context menu, and the editor, have **Skip this one** and **Stop repeating**.
  - Every control has an AutomationId.
  - Completing a repeating item through any path (checkbox, keyboard, search result, calendar) uses
    the same service operation.
- **Data.** There is a `RecurrenceRule` value stored in columns on `TodoItem`: `RecurrenceFrequency`,
  `RecurrenceInterval`, `RecurrenceWeekdays` (bit flags), `RecurrenceMonthDay` (0 = last day),
  `RecurrenceMonth`, `RecurrenceAnchor`, `RecurrenceEndKind`, `RecurrenceEndDate`,
  `RecurrenceRemaining`, and `RecurrenceSeriesId`. These are nullable. The additive migration also
  adds a boolean `RecurrenceSuccessorCreated`, defaulting to false.
  Adding columns to `TodoItem` follows the AGENTS.md rule on the `TodoItemSearch` triggers.
- **Tests.** Core unit tests cover the next-date calculation: every frequency and interval, weekday
  sets that wrap past Sunday, month-end clamping, 29 February, both anchors, every end kind, and
  overdue skipping. They also cover the §6.1 interactions. SQLite tests cover copying, which
  includes links, custom fields and the subtree, plus undo, trash and the migration. The UI has
  React component and simulated-input tests for the Repeat section, Skip and Stop repeating,
  snapshot baselines in light and dark, and a smoke step.

- **Implementation decisions.** Weekly intervals use weeks starting on Monday. Monthly and yearly
  intervals advance the anchor's month or year before applying the selected day. A count includes
  the current occurrence. Skip consumes one occurrence and leaves the final occurrence in place
  when there is no next date. Skip uses today's local date for a completion-date anchor. The editor
  derives a yearly rule's month and day from the due date or scheduled start. Editing other fields
  preserves an existing yearly pattern even when its occurrence was clamped.
- **One successor per occurrence.** The source records successor creation in the same undoable save.
  The marker survives manual reopening, rule edits and JSON round-trips. Completing the source again
  never replaces a successor that was deleted or purged. Undo clears the marker when it removes the
  generated occurrence, and redo restores both. The JSON marker is a boolean and needs no ID remap.
- **Copied branches.** All active descendants shift by the root's date offset and start open.
  A copied descendant that repeats starts its own series. In a confirmed completion cascade, a
  newly opened repeating child keeps its parent open. Import, restore, and settings reconciliation
  preserve the usual completion invariant without generating occurrences. JSON import remaps series IDs
  with the other imported identities. Search and calendar entries open the workspace editor, so
  completing an item from either view uses the workspace's existing completion action.

### 7.12 Reminders and notifications

Decisions (made autonomously per the owner's 2026-11-14 instruction; listed for review):

- **What reminds.** Only open, non-deleted items that have a due date. Scheduled blocks do not
  remind in this phase. Completed, deleted and archived-project items never remind. A repeating
  item's next occurrence reminds through its own due date.
- **When.** The reminder instant is the due moment minus an offset.
  - A timed due item's due moment is its due date and time.
  - A date-only item's due moment is the setting `DateOnlyReminderTime`, a local time with default
    09:00, on the due date.
  - Floating local values become instants with `FloatingTime` and an explicitly passed zone (§5.4).
    A reminder that falls in a DST gap fires at the first valid instant after it.
- **Settings (§6.5).**

  | Setting | Type | Default | Per-project override |
  |---------|------|---------|----------------------|
  | `RemindersEnabled` | bool | on | yes |
  | `DefaultReminderOffset` | duration (0 = at the due moment) | 1 hour | yes |
  | `DateOnlyReminderTime` | local time | 09:00 | yes |
  | `KeepRunningInTray` | bool | off | no |
- **Per item.** The editor has a **Reminder** choice:
  - **Default**, which uses the effective setting;
  - **None**;
  - an offset: at the due moment, 5/15/30 minutes, 1/2 hours, 1/2 days or 1 week before.

  It is stored as nullable `ReminderMode` and `ReminderOffsetMinutes` columns on `TodoItem`. The
  migration is additive and preserves the FTS mapping and triggers (§7.2). Recurring copies (§7.11) and
  import/export (§7.9, JSON only) carry it. A change is part of the item edit's undo step.
- **Delivery state.** `ReminderDeliveredFor` records the reminder instant (UTC) that was last
  delivered for the item. A reminder is due when its instant is ≤ now and differs from
  `ReminderDeliveredFor`. Changing the due date, time or offset therefore re-arms the reminder
  without extra bookkeeping. Recording delivery is application state, not user data: it is not
  undoable and not exported.
- **Scheduler.** An Effect service schedules reminders using the injected Clock.
  - It checks every 30 seconds, and also immediately after any save, on wake from sleep and on a
    clock change, so long timers can't drift.
  - It reads due reminders with one bounded query and hands them to `IReminderNotifier`.
  - It delivers each reminder once, then records delivery.
- **Missed while closed.** At startup, reminders whose instant passed while the app was closed are
  handled as follows:
  - those from the last 24 hours are delivered as **one** grouped notification ("3 reminders while
    you were away");
  - older ones are marked delivered without a notification; their items still show as overdue
    through urgency colours (§6.3).
- **Live checks use the same window.** Every later check follows the same rule. This covers
  turning reminders on, an import or restore of old overdue items, a changed offset or
  date-only time, and creating a past-due item.
  - Only reminders from the last 24 hours notify, and older ones are recorded silently.
  - One due reminder gets its own notification. Several due in one check get one grouped
    notification ("3 reminders due") that opens the panel.
  - The recent read is bounded by the window itself. If recording the older ones fails, the
    check still notifies only recent reminders, and the next check retries the rest.
  - A notifier that throws is logged. The reminder is still recorded and shown in the panel,
    so a retry never notifies twice.
- **Snooze and dismiss.** The in-app **Reminders** panel offers **Snooze**, **Mark complete**,
  **Open** and **Dismiss** for each reminder.
  - The panel opens from View → Reminders, which displays the pending count, and with Ctrl+Shift+R.
  - Snooze options are 10 minutes, 1 hour or tomorrow at `DateOnlyReminderTime`. Snooze sets a
    nullable `SnoozedUntilUtc`, which overrides the computed instant once; it is a labelled undo step.
  - Dismiss clears the entry from the panel.
  - Escape closes the panel only after focused controls have had it. An open combo box or a
    drag in progress takes Escape first. While the panel is open, Escape closes it before it
    can leave search, the calendar or the trash.
  - If **Mark complete** is blocked, the reason is shown in a message.
- **OS notifications.** Electron main delivers native notifications on supported Windows and
  Linux desktops. The in-app panel is always available. A failed platform call is logged once
  and pauses native delivery for five minutes, measured with Effect Clock. Clicking a notification
  brings the window forward and opens the item or the panel for a group.
- **Tray.** With `KeepRunningInTray` on, closing the window hides it to a notification-area icon
  instead of quitting, so reminders keep firing. The tray menu has **Open** and **Quit**; a left
  click shows the current item's card (§7.18). Start with the OS is covered in §7.13.
  - The window hides only when a tray host really shows the icon. Windows and macOS always
    have one. On Linux, a `StatusNotifierWatcher` must own its name on the session bus.
  - Without a tray host, closing minimises instead, so the window is never unreachable.
    Closing an already minimised window, for example from the taskbar, quits.
  - The tray re-reads the setting only after a save that changed a global setting.
- **Single instance.** One app runs per user and database file.
  - Scope the Electron instance lock to the user and resolved database path. A second launch on
    the same database brings the running window forward and exits. Different database paths,
    including test overrides, may run side by side.
    The default database keeps the Electron profile and its lock. A `TASKTRACKER_DB_PATH` override
    moves the profile to `instances/<hash of user and resolved path>` beneath it before the lock
    is taken.
  - Legacy used a mutex and pipe with a three-second response deadline. Verify activation while
    starting or tray-hidden and give the launching user feedback when the instance is unresponsive.
- **Search (§7.7).** `has:reminder` matches open items whose effective reminder is not None.
- **Implementation decisions.** Offsets are subtracted in floating local time before converting to UTC.
  The 24-hour startup window includes its lower boundary. The panel keeps a session list, and a
  grouped notification opens that panel. A snooze applies to the base instant it deferred, so a
  different base instant re-arms the item. Undoing a pending snooze restores its panel entry.
  Version 1 JSON carries the optional item choice and project settings. Snoozes are local to the
  database. An existing custom field keyed `reminder` gets a free numeric suffix, and its saved
  searches are rewritten as for `repeats`. Use desktop resume signals and detect wall-clock jumps so pending reminders are checked promptly.
  Electron main reports resume and window focus; the server compares Effect Clock wall and
  monotonic time every five seconds and requests a check on a jump of a quarter second or more.
  The server and Electron main exchange validated JSON lines over the child's private pipes, each
  told apart by `type`. The server writes notifications and the tray setting after its readiness
  line. Main writes reminder checks and transfer file grants (§7.9) to stdin, which one server
  reader decodes and hands to each subscriber.
- **Query robustness.**
  - A stored reminder setting that cannot be parsed falls back to its default for that row.
    It does not stop every reminder.
  - The due query first skips items whose due date is later than a horizon, so it does not
    resolve every open dated item. The horizon is the local date plus the largest possible
    offset (the 1-week item maximum, or any larger stored default), plus one day of time-zone
    slack. Results are unchanged.
- **Tests.**
  - **Core:** instant calculation (timed and date-only, offsets, DST gap and repeat in fixed zones,
    and the effective-setting precedence) and the re-arming rule.
  - **SQLite:** due-reminder query, delivery recording, snooze, undo of snooze, the migration with
    its FTS triggers, recurrence copy and import/export.
  - **React:** the scheduler with a fake Effect Clock, the missed-while-closed grouping and
    the panel actions.
  - **Headless interaction:** the bell button, Ctrl+Shift+R, snooze, Open, Mark complete, Dismiss,
    Escape (including an open combo box keeping its Escape) and the editor Reminder choice.
  - **Desktop units:** the single-instance name and handshake, the hide-or-minimise decision and
    the notifier cool-down.
  - **Snapshots:** the panel and the editor, light and dark.
  - **Smoke:** a reminder due in under a minute appears in the in-app panel; the OS toast itself
    is checked by hand.

### 7.13 Installers and releases

Use Electron and electron-builder (§3–4). The legacy implementation used Velopack.
Its exact packaging and update decisions are recorded in `legacy-final:docs/PLAN.md` §7.13.

- **Packages.** Publish a per-user Windows x64 installer with application shortcuts, a Linux
  x64 AppImage, and a macOS arm64 app and installer. Keep the install location separate from the
  database and its backups during install, update, uninstall and reinstall. Verify migration
  backup before first launch on existing data (§5.2). Build each artifact on its target OS.
- **Version and publishing.** App Settings shows the build version in About. A `v*` tag supplies
  the release version to each packager. Upload all verified artifacts before publishing the
  GitHub Release. A retry resumes an incomplete draft by matching uploaded assets by name and
  checksum, refuses a conflicting draft and never deletes a release. A published release stays intact.
  Prereleases are excluded from stable update checks. PR and main CI build packages for the
  enabled operating systems as verification. CI must never publish on a PR.
- **Updates.** Installed builds offer manual Check for updates, then Download and Restart to
  update. Uninstalled builds show an informational message and make no request. Display
  unavailable feed and network errors separately. Keep download and ready state across
  navigation. Check the active draft before restarting. If the user declines, defer applying
  the update until the next normal launch. Accept a configurable feed. The legacy stable feed
  requires public release assets, and the hosting decision remains open.
- **Start with the system.** App Settings offers the option only for installed Windows and Linux
  builds. Default off. After saving, set or clear the per-user entry idempotently, using the
  Windows Run key or a desktop autostart file under absolute `XDG_CONFIG_HOME` or
  `~/.config/autostart`. Linux uses the stable AppImage path. Preserve the stored preference if
  writing the entry fails and show the error. Uninstall removes the Windows entry. Document
  Linux cleanup. Keep the preference for reinstall and recreate the entry when saved again.
  Startup preferences stay outside undo history (§7.8). The legacy app used the Run value
  `TaskTracker`, while Electron's login item uses the AppUserModelID. On the first launch after
  upgrading, an installed Windows build deletes a legacy `TaskTracker` value, so the old app stops
  starting, and writes its own entry when that value existed. Without the value it does nothing,
  so the step runs once and later choices stand.
- **Signing and verification.** Legacy releases were unsigned. Keep Windows and macOS install
  instructions aligned with the artifacts and signing status. Test update states and startup
  registration with fakes. Use UI baselines for the About card and restart-to-update state.
  Verify install, update, uninstall and data preservation by hand on Windows.

### 7.14 Push back one day, and the Today view

These are owner requests from 2026-11-17 (§10). Where the request was silent, the decisions below
were made autonomously; they are listed for review.

**Push back one day**
- **Where it appears.** "Push back one day" is in the right-click menu of item rows in the workspace
  tree, search results, calendar entries and the Today view. The keyboard shortcut is
  **Ctrl+Shift+P** on the selected item. It is not handled while a text box has focus.
- **What it moves.**
  - The item's due date moves one day later, and the due time stays the same.
  - If the item has a scheduled block, the block's start and end both move one day later.
  - The move counts from the item's own current date, not from today, so an item three days
    overdue becomes two days overdue.
  - Only that item moves. Its sub-items keep their dates.
  - On a repeating item (§7.11), only this occurrence moves. The rule is unchanged.
  - A reminder (§7.12) re-arms by itself.
- **When it is unavailable.** It is disabled, with an explanatory tooltip, for completed items and
  for items with no due date and no scheduled block.
- **Undo.** Each push back is one labelled undo step, "Push back ⟨title⟩" (§7.8).

**Today view**
- **Opening it.** **View → Today** and **Ctrl+Shift+D**,
  open it. It uses the shared transient page and the stale-page rules (§7.2 shell navigation).
- **What it lists.** Items completed today that are still completed: `CompletedAtUtc` falls within
  today's local day, which is computed with the explicitly passed time zone (§5.4). Reopening an
  item removes it. Deleted items, and items in deleted projects or folders, are excluded.
- **Layout.**
  - Items are grouped by project, in project order, with the area path, for example
    "Billing DB › dbo", shown as a subtitle.
  - Within a project the tree shape is kept.
  - A completed parent with completed-today children is collapsed by default and shows a count.
  - An open ancestor of a completed-today item is shown as context. It is expanded, and visibly
    marked "Not completed" (muted text and an open checkbox). This applies at any depth.
  - Children completed on other days are not shown.
- **Header.** "N completed today", plus an empty state when nothing has been completed yet.
- **Actions.**
  - Clicking a title opens the item in its workspace.
  - Unchecking reopens the item (one undo step), and it drops out of the list.
  - The row menu offers Open and Push back one day.
- **Live updates.** The view refreshes after any save and when the local date changes.
- **Implementation decisions.**
- Today covers all projects and breaks ties in project order by name. Within a project the root
  area comes first, then folders by breadcrumb. Siblings keep their workspace order.
- A completed ancestor from an earlier day remains as context, labeled “Completed earlier”. Only
  today's completions contribute to the total. Reopening a parent leaves it as open context if
  today's completions still include any of its descendants.
- A collapsed row counts all of its completed-today descendants. Completed rows retain their
  expansion choices while they remain in the view.
- In Calendar and Today, the focused row is the keyboard target. If adding a day overflows the
  supported calendar, the operation shows an error and saves nothing.
- The Menu key and Shift+F10 open the focused item row's menu in the workspace, Search,
  Calendar and Today.
- Undo and redo consult the workspace behind Today, Search, Calendar and Trash. If its editor
  has a draft, the refusal appears on the page on screen and the draft is preserved.
- Back waits for in-flight Today reopens, calendar moves and push backs, including after a switch
  between transient pages. A commit while the return page is hidden makes Back reload it through
  its existing unsaved-changes guard.
- Today checks the local date every minute using an Effect Clock timer and again on window
  activation, so it catches wall-clock changes and sleep across midnight. These checks query
  only when the date changes.

**Not in this slice:** browsing earlier days.
- **Tests.**
  - Core/SQLite: the day boundaries in fixed zones, including DST days; the reopened-today exclusion;
    the ancestor context rows; and the exclusion of deleted items.
  - React: grouping and collapse state, and the midnight rollover with a fake Effect Clock.
  - Headless interaction: Ctrl+Shift+D, Ctrl+Shift+P, the context menu, and unchecking.
  - Light and dark snapshots of the Today view and of the row menu.
  - A smoke scenario.

### 7.15 Statuses and numbered priority levels

These are owner requests from 2026-11-17 and 2026-11-18 (§10). The owner chose two things:
statuses are an editable list, and they are linked to completion. Where the requests were silent,
the decisions below were made autonomously; they are listed for review.

**Numbered priority levels**
- **The number is a label.** `PriorityLevel` gains an optional `Number`, a whole number of 1 or
  more that is unique among active levels. It is a label only: ranking and every comparison use
  `SortOrder`, never `Number`. A mapping such as 1, 7, 2 is valid and tested.
- **Display.** A level shows as "7" when it has a number and no name, as "7 · Hotfix" when it has
  both, and as its name otherwise.
- **App Settings.** The Priority levels list gets a Number box on each row. Number and order are
  edited independently.
- **Query syntax (§7.7).** `priority:7` matches the level whose number is 7, then falls back to a
  level named "7". `priority>7` means "more important than level 7" by rank, as today.

**Statuses**
- **The list.** A new `StatusLevel` lookup has a name, a sort order, an *open* or *done* kind, and
  can be archived. It is managed in App Settings like the item types and priority levels. The
  seeded set is Queued, In progress and Testing (open) plus Completed (done). At least one done
  status must stay active.
- **On the item.** `TodoItem` gains a nullable `StatusId`. It also gains `ReopenStatusId`, the open
  status to restore on reopen. Schema changes preserve the FTS mapping and triggers (§7.2).
- **Linked to completion (§6.1).**
  - Setting a done status completes the item through the normal completion path, including the
    sub-item confirmation and parent auto-completion.
  - Completing an item any other way sets the first done status in sort order and remembers the
    previous open status.
  - Reopening restores `ReopenStatusId`, or no status.
  - Auto-completed and auto-reopened parents follow the same rules.
  - Status and completion stay in sync. The service and database constraints enforce the applicable invariants.
- **Setting a status or priority.**
  - Every item row menu (workspace tree, Search, Calendar, Today, Tickets) gets **Set status ▸**
    and **Set priority ▸** submenus. Each has a check mark on the current value and a "None" entry.
  - The editor gets a Status combo box next to Priority.
  - Each change is one labelled undo step, for example "Set status of ⟨title⟩".
- **Rows.** Item rows show a small status chip when a status is set.
- **Search (§7.7).**
  - The built-in `status` key now refers to the status list: `status:testing`, `status~prog`,
    `no:status`.
  - The old open/completed meaning moves to `is:open` and `is:completed`, which already exist. The
    old key is renamed `completed`, so `completed:true` keeps working.
  - Saved searches that used the old `status` key are rewritten by the migration with
    `QueryFieldKeyRewriter`, so they keep their meaning.
  - The filter row gets a Status field.
- **Recurrence (§7.11).** The next occurrence takes the source's `ReopenStatusId`, the open status
  it had before completion, or no status.
- **Import/export (§7.9).**
  - JSON gets a `statuses` lookup list matched by name, like priorities, plus `statusId` and
    `reopenStatusId` on items. It stays at version 1.
  - CSV gets a `Status` column.
- **Undo (§7.8).** Status and priority list management are undoable.
- **Tests.**
  - Core: the linkage rules for every §6.1 action.
  - SQLite: the migrations, including the saved-search rewrite, plus import/export, the recurrence
    copy and undo.
  - React component and simulated-input tests: both submenus from the mouse and the keyboard, and the
    editor combo box.
  - Light and dark snapshots of a row menu with submenus, the editor and the settings lists.
  - A smoke scenario.

**Implementation decisions**
- Status kind is selected when a status is added and stays fixed. Archived statuses remain on
  existing items and can be restored from a remembered reopen status. Assigning an Open status
  or None to a completed item runs the normal reopen rules, then applies the chosen value.
- Existing completed items receive Completed on upgrade. Their reopen status starts empty.
  A custom field with the newly reserved `completed` key gets the first free suffix before
  the legacy completion clauses are rewritten.
- Status searches compare names, including names of archived statuses already on items. The
  filter row uses text to support both exact and partial matches.
- CSV matches active statuses by name. A Done status by itself completes the row, and an explicit
  conflict with the completion columns is a validation error. CSV carries the current status.
  JSON also preserves the remembered Open status. A JSON name match with a different status
  kind is a validation error. Legacy JSON without a statuses list uses the old completion key.
- A numbered priority can have an empty name. JSON keeps existing named matches intact and
  matches a number-only priority by number and archive state. A new active priority whose
  number is already taken produces a validation error.
- The status chip sits at the right end of the title column, so rows without a status keep their
  layout. Month cells, the week all-day row and short time-grid blocks have no room for a chip;
  there the entry's tooltip names the status, and taller blocks show the chip.
- Row submenus list None, then the active entries in list order, plus the item's current entry
  when it is archived, so the check mark always has a row. Entries are native check menu items,
  so screen readers report the checked one.
- When a confirmed Done cascade creates a new occurrence that keeps the parent open, the child
  completions and new occurrences are saved together. The parent keeps its Open status or None.
  The row action and editor show "A new occurrence of a sub-item keeps '⟨parent⟩' open."
- Recurrence copies links and custom values from the editor save's final state, including
  additions, removals and edits, in the same transaction as the completion.
- JSON field-key renames reserve every incoming key before choosing suffixes. Each source key
  maps to its own destination field, so a legacy `completed` field skips an incoming `completed-2`.
- CSV exports retain the readable Priority label and add a Priority reference column. Its
  nonblank value takes precedence on import. Named priorities use `#name:Name`, active number-only
  priorities use `#7` for number 7, and archived number-only priorities use `#id:<guid>` to
  preserve their identity. An archived match remains an import error. Without a reference,
  the Priority column matches names and display labels, and an ambiguous match is a row error.
  For a legacy export whose custom field supplied the Priority reference header, rename that
  header to `Priority reference (field)` before importing.
- JSON priority import gives exact IDs precedence. Archived number-only entries with the same
  number match one-to-one in rank order, reserving exact matches first and creating entries as
  needed to keep distinct archived levels.
- Downgrading rewrites workflow-status search clauses to the reserved `__workflowstatus` key
  so the old parser reports an unknown field. Upgrading restores those clauses after migrating
  the old completion key. Quoted search text retains its original wording.
- Settings exposes status archiving. Undoing a status addition may remove the row when unused.
  If any item still references it, including a remembered reopen status or a trashed item, the
  delete is refused with a status-specific domain message.
- Row submenu check marks reflect the stored selection during the command and after a cancelled
  or refused change. The menu continues to expose the native checked state to screen readers.
- The Home import/export menu snapshot waits for identical popup position and size on two
  consecutive rendered frames.
- An editor save that changes the status is one undo step labelled "Set status of ⟨title⟩",
  even when other fields changed in the same save.
- Status rows in App Settings show their kind ("Testing · Open"). Archiving the last active
  Done status is refused by the service and by a database trigger, and changing a kind is
  refused by a trigger.
- Undo covers every status and priority list change, including priority number edits.

### 7.16 Tickets view

This is the owner's request from 2026-11-17, with the details the owner gave in §10. Where the
request was silent, the decisions below were made autonomously; they are listed for review.

- **Opening it.** **View → Tickets** and **Ctrl+Shift+K**. It uses the
  shared transient page.
- **What it lists.** Open, non-deleted items that have a ticket number, across all projects, with a
  project filter (All or one project). The columns are ticket number, title, project, status and
  due date.
- **Order.**
  - Items with no priority come first, ordered by drag position. Below them comes one section per
    priority level, in level sort order (§7.15), with a header for each.
  - Within a section, items are ordered by drag position. `TodoItem.TicketRank`, a nullable real
    number, is stored separately from the tree order; new tickets get the bottom of their section.
- **Dragging.** Items move within or between sections, with a drop indicator.
  - Dropping below a prioritized item puts the item in that section and sets its Priority.
  - Dropping into the no-priority group clears the Priority. This is an assumption, pending the
    owner's confirmation.
  - **Keyboard equivalent:** Alt+↑ and Alt+↓ move the focused ticket one place. Crossing a section
    boundary changes its priority, following the same rule.
- **Menus.** **Set priority ▸** moves the item to the bottom of its new section when the level
  changes. **Set status ▸**, Open and Push back one day are also available.
- **Undo.** Every move and priority change is one labelled undo step.
- **Implementation decisions.**
  - Tickets opens on All projects. The list includes open numbered sub-items, and excludes items
    in deleted projects or folders. Active levels have headers even when empty. An archived level
    has a header while it contains visible tickets, which may be reordered or moved out.
  - Listing does not write ranks. Unranked tickets follow ranked tickets by creation time, with
    item ID breaking ties. An effective move assigns consecutive ranks in its destination section.
    Giving an open item a ticket number appends it to its section in the same save, including
    editor saves, CSV and JSON imports, and new numbered recurring occurrences. The append
    assigns ranks to any legacy unranked tickets in that section in their current order first.
    New tickets in a batch append in the order they are added. Clearing and re-adding a ticket
    number gives it a fresh bottom rank when open. Changing priority elsewhere clears the rank,
    and reopening a ticket keeps its rank. Ticket ranks are local to the database and omitted
    from import/export.
  - The upper and lower halves of a row insert before and after it. A drop on a header inserts at
    the section start. Alt+Down at a section end enters the next assignable section before its
    first visible row. Alt+Up at a section start enters the preceding assignable section after its
    last visible row. An empty section accepts either direction at the header. The project filter
    hides rows without changing the global order, so moves use the visible target as an anchor
    among all projects. Set priority appends after every ticket in the destination section.
  - The project filter takes focus on opening. A row opens with Enter or its menu, and moved rows
    retain focus by ticket ID after a drag, keyboard move or successful Set priority. Ctrl+Shift+P
    uses the focused ticket.
  - Holding a drag near either vertical edge of the ticket viewport scrolls faster as the
    pointer approaches the edge. The drop indicator follows the rows under the pointer as they
    scroll. Release, Escape and pointer capture loss stop the scroll.
- **Tests.**
  - The ordering, using a non-monotonic number mapping such as 1, 7, 2.
  - Rank assignment, and the drop rules at section edges.
  - Headless drag and keyboard moves.
  - Undo.
  - Light and dark snapshots.
  - A smoke scenario.

### 7.17 Workspace card grid

This is the owner's request from 2026-11-18: the workspace's main area becomes a grid of cards
grouped by priority. The owner chose what a card holds, which cards share a height, where
"No priority" goes, and that dragging between sections changes priority. The other decisions
below were made while building it and are listed for review.

- **Cards.** Each open top-level item in the area is one card. The card header has the
  completion checkbox, the title (up to three lines), the status chip, and a line with the
  type icon, ticket number, due or scheduled date, urgency label, the "from sub-item" marker and
  the repeat marker. Urgency tints the header (§6.3). Below the header are a short
  description preview (up to four lines) and the item's sub-items as the usual rows (expand,
  complete, drag, menus), with their own collapsed "n completed" expander. Sub-items never get
  cards of their own.
- **Sections.** "No priority" comes first, then one section per priority level in level sort
  order (never by number, §7.15). Archived levels get a section while items still use them. A
  section shows its name and item count. Empty sections are hidden; use **Set priority ▸** to
  move an item to an unused level.
- **Columns.** A global setting, **Cards per row** (1–8, default 4), in App Settings (§6.5).
  When the pane is too narrow for that many cards at least 220 px wide, the grid uses fewer
  columns.
- **Height.** Every card in a grid row is as tall as the row's tallest card. A row is never
  shorter than half the item pane's height (less room for a section header), so about two
  rows show at once. Taller content makes its row taller; the pane scrolls.
- **Completed.** The area's "Completed (n)" expander (§6.2) stays below the sections. It shows
  finished top-level items as cards in the same grid, sized only by their content.
- **Dragging.**
  - Cards are split into thirds from left to right. The left third inserts before the card,
    the right third inserts after it, and the middle third makes the dragged item a sub-item
    (§7.5). Sub-item rows inside a card keep their top, middle and bottom thirds.
  - Dropping before or after a card puts the item in that card's section and sets its Priority
    to that section's level, or clears it in "No priority". A dragged sub-item is promoted to
    the top level. Dropping on a section header appends the item to that section.
  - The order inside a section is the area's normal sibling order (`SortOrder`, §6.4). The
    position and the priority are saved together as one undo step, labelled "Set priority of
    ⟨title⟩" when the priority changes and "Move ⟨title⟩" otherwise (§7.8). Changing priority
    clears the item's ticket rank, as everywhere else (§7.16).
- **Keyboard.** Alt+↑ and Alt+↓ move the selected card one place in reading order. Inside a
  section the card swaps with its neighbour. At a section edge it enters the neighbouring
  section: at the end of the section above, or at the start of the section below, taking that
  section's priority. On a sub-item or a completed card, Alt+↑/↓ still reorders siblings.
- **Implementation decisions.**
  - A move that keeps a top-level card in its own section is an ordinary sibling drop
    beside the target card, so finished items keep their saved slots (§6.4). Entering
    another section, a header drop and sub-item promotion use one combined move and
    priority write. Both are one undo step.
  - Archived sections accept moves only from their own cards; Alt+↑/↓ steps over other
    archived sections. Because empty sections are hidden, a card that empties its section
    cannot step back into it.
  - Cards are expanded tree items: their sub-item rows always show, Right moves to the first
    sub-item and Left does not collapse a card. Each section's cards form a group named by
    its header. Sub-item rows put the ticket, priority and date on a second line.
  - The repeat marker joins the card header when recurring items land (§7.11).
- **Tests.** Core: the move operation on real SQLite, including undo, sub-item promotion and
  an archived level. React: the section order (with a 1, 7, 2 numbering), the drop and step
  mapping, header drops and the setting. Headless: the grid layout, card and header drags, and
  Alt+↓ across a section. Light and dark snapshots of the grid.

### 7.18 Current item and the tray card

Requested by the owner on 18 Nov 2026: a checklist tray icon whose left click shows the item
the owner is working on.

- **Current item.** At most one item is current. It is stored as the global setting
  `currentItemId` (empty when none), outside undo history and not shown on the settings screen.
  - Set it from any item's right-click menu: **Set as current item** on Search, Calendar, Today
    and Tickets rows. A workspace card or row menu toggles between **Set as current item** and
    **Clear current item**.
  - Each workspace item card has a ☆ button in its header that makes the item current; the
    current card shows ★, and clicking it again clears the choice. The React card reveals ☆ on
    hover, like its ⋯ button, and always shows ★.
  - The details panel has a **Set as current** / **Current item** button beside its heading.
  - A current sub-item row shows a ★ marker.
  - A deleted item, or an item in a deleted project, is treated as no current item. Restoring
    it from the trash makes it current again.
- **Tray icon.** The tray icon is a drawn checklist: three ticks and lines on a blue tile. The
  window, taskbar and executable use the same checklist art. Generate `assets/icon.ico` and
  `assets/icon.png` from `assets/icon.svg` with `node apps/desktop/scripts/icons.mjs`. The tray icon
  shows under the same `KeepRunningInTray` rules as before (§7.12). The menu keeps **Open** and
  **Quit**.
- **Tray card.** A single left click on the icon shows a small borderless card next to it.
  - **Contents:** the title, the project and folder path, a Completed chip, status, priority, due
    date and time, the first lines of the notes, and **Open in Task Tracker**, which brings the
    window forward with the item selected.
  - **Mark complete** (added in WP47 at the project lead's request) completes an open item with
    the normal rules. The open sub-items question and any blocked reason appear inside the card,
    and the main window reloads the change.
  - **Empty state:** with no current item, the card explains how to choose one.
  - **Closing:** clicking elsewhere, Escape, or clicking the icon again hides the card.
  - **Placement:** on Windows the card sits centred above the cursor, kept inside the working
    area of that screen. Elsewhere, where the cursor position isn't read, it goes in the top-right
    corner of the primary screen.
  - When the desktop exposes only the tray menu, Open and Quit remain available.
- **Tests.**
  - The service against SQLite.
  - The card and workspace React components.
  - Headless right-click and button interactions on every surface.
  - Placement rules.
  - Card and icon snapshots.

## 8. User interface (React)

The replacement UI ships the owner’s Notion-like design directly. Use a clean
navigation sidebar, rounded controls and surfaces, and density and type tuned for
1080p and 1440p. Use circular completion controls and a subtle dot, pill or edge
accent for urgency. Keep the label or icon and sub-item attribution in §6.3.

1. **Home.** Project cards show name, open count and overdue count, with a New Project
   action.
2. **Project workspace.** The sidebar contains the root and nested folder tree, with
   context actions to create, rename, move and delete. Breadcrumbs show the current
   area. The main pane shows the open item tree with completion, type, title, ticket,
   priority, due/scheduled dates and urgency. Completed sections collapse at each
   level (§6.2). Quick-add is an empty line at the end of the open list. Press Enter to
   create an item. Right-click → Edit opens a floating panel with metadata and
   sub-items. Group related fields compactly and keep all five custom-field controls.
3. **App Settings.** Global auto-complete and urgency thresholds, type and priority
   lists (add, rename, drag to reorder, archive) and global fields and choices.
4. **Project Settings.** Per-project overrides (§6.5) and project fields and choices,
   with inherited global fields visible.

Keyboard — Ctrl+N focuses quick-add, Ctrl+Shift+N adds a sub-item, Space toggles
completion, F2 renames, Delete confirms deletion, and Alt+↑/↓ reorders. On a focused
item row, Tab indents and Shift+Tab outdents, as in Notion. Ctrl+F opens search in
Phase 4. The legacy port adds Ctrl+Z and Ctrl+Y or Ctrl+Shift+Z (§7.8),
Ctrl+Shift+C and the calendar controls (§7.4), Ctrl+Shift+T (Trash),
Ctrl+Shift+R (Reminders), Ctrl+Shift+D (Today), Ctrl+Shift+P (Push back one day)
and Ctrl+Shift+K (Tickets). The Menu key and Shift+F10 expose row actions.

### Legacy feature port

Keep the React design and floating editor. The workspace gains priority-grouped cards with
nested rows (§7.17). App Settings adds card columns, status management, priority numbers,
reminder defaults and About. Search, Calendar, Trash, Today and Tickets use the shared return
page rules. Home lists saved searches and transfer results.

Port the legacy title-bar navigation and the final File, Edit, Project and View menus. At the
frozen tag, the system title bar identifies the app and leaves room for native window controls.
The menu bar below it holds app-wide actions. File contains App Settings and app-wide import
and export from Home. Edit contains Undo and Redo. Project contains New Project and project
import and export on Home, and Project Settings in the workspace. View contains Search,
Calendar, Today, Tickets, Trash and Reminders. Settings returns to the originating page.

## 9. Delivery phases

The original TypeScript pivot used legacy Phases 0–3 as its behavior reference.
The frozen `legacy-final` tree supplies the subsequent feature behavior.
The owner approved the replacement in [the parity record](PARITY.md).
[Migration work packages](MIGRATION.md) record the execution order and gates.

| Phase | Deliverable | Exit criteria |
|-------|-------------|---------------|
| **Pivot A. Foundation** | pnpm workspace, Vite+ and TypeScript, Windows/Linux CI | Build, static checks and test runner work on both OSes |
| **Pivot B. Rules and data** | Port domain tests and rules, then SQLite persistence and server operations | Domain and database parity, including EF files opened in place (§5.2) |
| **Pivot C. RPC and web** | Shared contracts, local server RPC and React screens (§8) | All shipped behavior works through the renderer, including custom fields |
| **Pivot D. Desktop and acceptance** | Electron shell, packaging, browser interaction and visual coverage, desktop smoke | Packaged app launches and preserves data across restarts. Reviewed baselines and Windows smoke pass |
| **Pivot E. Cutover** | Remove legacy .NET code and tooling | Owner signs off on parity and data continuity. TS checks run without .NET |
| **4. Search** | §7.2 query model, FTS5, filter builder and results across a project or all projects | Search by built-in or custom fields with the semantics in §7.2 |
| **5. Calendar** | Month/week view with click-through and drag or keyboard rescheduling | §7.4 |
| **Legacy feature port** | Database continuity and the remaining features through the final legacy menu bar | WP25 onward and the [parity checklist](PARITY.md) |

## 10. Roadmap

### 10.1 Legacy feature port

WP25 onward carries forward the final legacy feature set in §§7.2 and 7.4–7.18. The
owner defines a ticket for the Tickets view as an open item with a ticket number.
A separate Ticket kind, one-line paste into sub-items, clipboard reconstruction,
child tickets and Pending notes remain proposals from 13 Nov 2026. See
`legacy-final:docs/PLAN.md` §10.1 for the original proposals.

### 10.2 Other ideas

- Task stack, requested by the owner. Agree scope and behavior before designing it.
- Mobile or standalone browser clients reusing the RPC contracts and server rules.
- Optional sync or shared database with time-zone IDs (§5.4).

## 11. Quality bar

- Cover each case in §6.1 and §6.3, multilevel trees and every invariant in §5.1.
- Cover completion flow, completed sections, urgency refresh and move commands
  with web and server behavior tests.
- Keep domain decisions in Core and server services (§4). Use JSDoc for exported
  concepts and non-obvious behavior.
- Review each SQL migration. Test it against real SQLite and back up existing files
  before applying it (§5.2).

### 11.1 Testing standard

| Layer | Tool | What it covers | When it runs |
|-------|------|----------------|--------------|
| Unit | Vitest and `@effect/vitest` | Pure rules, Effect services and controlled clocks | Every build, CI on Windows and Linux |
| Database integration | Vitest, `@effect/vitest`, `node:sqlite` | Real `:memory:` SQLite for repositories, transactions, migrations and future search. Use temporary files for EF compatibility, backup/WAL and reopen tests | Every build, CI on both OSes |
| RPC integration | `@effect/vitest` | Schema validation, message round trips, errors and write/confirmation behavior with real SQLite | Every phase once RPC lands, CI on both OSes |
| Web behavior | Vitest and `@vitest/browser-playwright` | Controller state, mounted React components and real browser input for focus, shortcuts, gestures, click paths and dialogs | Every phase once web work lands, CI on both OSes |
| Visual baselines | Playwright screenshots in Chromium | Approved key screens and dialogs in light and dark. Review changes before updating images | With browser tests on both OSes |
| Desktop smoke | Playwright Electron | Launch the packaged app, navigate, perform 5–10 core workflows and verify persistence after restart | CI on Windows and Linux |
| Owner review | Hands-on demo | Check the phase's deliverable and review changed baselines | End of each phase, before merge |

- A new shortcut, gesture or dialog ships with a simulated-input browser test.
  Use accessible roles/names and stable `data-testid` identifiers on interactive
  controls. A new or changed screen ships with a reviewed baseline.
- Fix clock, time zone, locale, Inter font, viewport and seeded data. Run tests with
  isolated databases. Generate and review Linux baselines on Linux (locally or in
  CI) and Windows baselines on the Windows machine or in Windows CI. Upload
  differing screenshots as CI artifacts.
- A bug found by hand gets a regression test at the lowest layer that catches it.

### 11.2 Commands

Run these root commands with Node 26 and pnpm 12.
Vite+ enables type-aware checking and type diagnostics. Build and
static checks must finish with zero warnings.
[Vite+ check](https://www.viteplus.dev/guide/check)

```sh
pnpm install --frozen-lockfile
pnpm exec vp check --deny-warnings
pnpm run build
pnpm exec playwright install chromium
pnpm exec vp test run
pnpm exec vp test run --project core
pnpm run package:desktop
pnpm run test:desktop
```

`build` builds the workspace in dependency order. `package:desktop` produces the
current platform's electron-builder output and unpacked executable. `test:desktop`
runs Playwright smoke against that executable. On headless Linux, source
`scripts/dev-env.sh` for user-local GTK and run `xvfb-run -a pnpm run test:desktop`.

CI uses the self-hosted runners and local TypeScript gate in [CI.md](CI.md).

## 12. Owner decisions

1. **Stack (18 Nov 2026).** Replace the entire .NET stack with the T3 Code stack in
   §3. Carry over the shipped product and custom fields. Ship the requested UI pass
   as part of the React implementation. This supersedes the 13 Nov Avalonia choice.
2. **Priorities.** Start with Critical/High/Medium/Low as reorderable data (§5).
3. **Urgency thresholds.** Default to 3 days and 24 hours, with project overrides (§6.5).
4. **Parent urgency.** Show the most urgent of the item and its open descendants (§6.3).
5. **Item types.** Users add types in App Settings.
6. **Build/test machines.** Develop on Linux with CI on Windows and Linux and a Windows
   machine for desktop testing.
7. **Testing standard.** Use the layered standard in §11.1, including owner review.
8. **CI without billed minutes (18 Nov 2026).** Enable self-hosted Linux and Windows
   jobs with per-OS repository variables. Run the local gate for an OS whose runner
   is unavailable. GitHub-hosted CI requires explicit manual selection.
9. **Legacy feature port.** Freeze the final .NET behavior at `legacy-final` and
   port it to TypeScript before merging to main.

## Appendix A. Historical review log

### Round 1 (gpt-6-sol) → revision 2

| # | Finding | Decision |
|---|---------|----------|
| 1 | Completion invariant clashed with childless items and with toggling the setting on | Accepted. Rule scoped to items with active children; reconcile prompt on enabling |
| 2 | Delete/restore/move not covered by completion rules | Accepted. Rule re-runs after any tree change; table extended |
| 3 | Completed sub-items stayed visible, unlike the requirement | Accepted. Same collapsed "Completed" pattern at every level |
| 4 | Denormalized hierarchy ids could drift; no cycle checks | Accepted. Dropped `RootItemId` (load by area instead); invariants §5.1 |
| 5 | Choice storage and value validation undefined | Accepted. `FieldChoice` table with stable ids; validator + check constraint; type is immutable once used |
| 6 | R13 overstated what v1 delivers | Accepted. R13 reworded to "metadata-ready" |
| 7 | Query scope and missing-value semantics ambiguous | Accepted. `SearchScope` union; operator table; typed `FilterValue` |
| 8 | Decimal range queries don't work in SQLite | Accepted. `double` for numbers; §5.2 lists SQLite type rules |
| 9 | Soft-delete ownership/restore undefined | Accepted. `DeletionBatchId`; restore per batch; archive for unique-keyed tables |
| 10 | Wall-clock time ambiguity; urgency precedence | Accepted. Floating-time semantics + DST rule (§5.4); effective deadline rule (§6.3) |
| 11 | ViewModel portability not guaranteed | Accepted. Presentation targets `net10.0`; gestures-in-view rule; Avalonia spike on roadmap |
| 12 | Generic query/metadata infra built too early | Partly accepted. Metadata tables and search code moved to Phases 3–4; design kept in §7 because you flagged metadata as a priority |

### Round 2 (gpt-6-sol) → revision 3

All round-1 resolutions were confirmed except #1, which was reopened as round-2 #1.

| # | Finding | Decision |
|---|---------|----------|
| 1 | "No" on the enable prompt left the setting on with data that broke its rule | Accepted. Enabling always reconciles in one transaction; Cancel leaves the setting off |
| 2 | With the setting off, a completed parent with open sub-items would be hidden in Completed | Accepted. Only *finished* items (self + all descendants complete) move to Completed |
| 3 | Custom-field values not checked against project scope or choice ownership | Accepted. Validator checks both; composite FK for choices; no cross-project item moves |
| 4 | FTS5 index maintenance unspecified | Accepted. External-content table with triggers; soft-delete handled by joining back to `TodoItem` |
| 5 | DST rules untestable with only a fake clock | Accepted. Time zone passed explicitly to `FloatingTime`; fixed-zone tests |

### Round 3 (gpt-6-sol) → revision 4

All round-2 resolutions confirmed consistent with the rest of the plan.

| # | Finding | Decision |
|---|---------|----------|
| 1 | `UrgencyCalculator` had no time-zone input, contradicting §5.4 | Accepted. Time zone added to its signature |
| 2 | FTS triggers would not index items that existed before Phase 4 | Accepted. Migration runs FTS5 `rebuild`; test covers pre-existing rows |
| 3 | Phase 1 exit asked for *unit* tests of database behaviour | Accepted. Split into unit tests (domain) and SQLite integration tests (database) |

### Revision 6 (18 Nov 2026)

| # | Finding | Decision |
|---|---------|----------|
| 1 | Owner chose a full pivot after .NET Phases 0–3 | Adopt the Effect, React and Electron stack. Port shipped behavior before resuming the roadmap |
| 2 | EF-created files must remain usable | Open in place, adopt the existing schema into Effect migration history and test both legacy schema versions |
| 3 | UI pass conflicted with the original workspace layout | Make the Notion-like design the initial React UI and keep Tickets on the roadmap |
| 4 | FTS5 storage needs stable item IDs | §7.2 uses the final legacy mapping table to keep FTS rowids stable |
