# Task Tracker — Project Plan

Status: **Revision 6 — TypeScript cutover complete** · Owner: Elijah Harris · PM: Claude

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
The replacement release includes the shipped Phase 3 custom fields.

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
| `Description` | string? | Plain text v1; Markdown on roadmap |
| `TicketNumber` | string? (≤ 100) | Free text, e.g. `JIRA-1234`. Indexed, not unique |
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
order, archive flag) and a shared management component.

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
- Back up an existing file before the first Effect baseline or a pending schema
  migration, using SQLite's online backup API so committed WAL pages are included.
  Keep the latest five successful `tasktracker-*.db.bak` backups, including legacy
  backups. Abort startup if backup or migration fails. After adoption, reopening
  the adopted file in .NET is unsupported. Restore the pre-adoption backup to roll back.
  [Node SQLite backup API](https://nodejs.org/api/sqlite.html#sqlitebackupsourceDb-path-options)
- Test with disposable copies of fixtures generated by the actual EF migrations for
  both schema versions (§11.1). Read, edit and reopen them with the new server.
  Verify hierarchy, completion, timestamps, deletion batches, settings, seeds,
  archived rows and all custom-value types. Check backups, constraints, rollback,
  restart and fresh-schema parity.

### 5.3 Deletion and restore

Soft delete, so a Trash/restore view can be added without schema change.

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
affected item's ancestors bottom-up and fixes their state. Specifically:

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
  within the same tree via indent/outdent. The React UI exposes these operations on
  focused rows (§8).
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

## 7. Metadata and search design

Phase 3 custom fields carry over in the replacement release. Phase 4 builds on this
schema and adds search.

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
column (`title`, `ticket`, `priority`, `type`, `due`, `scheduled`, `status`) or a
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

`FilterValue` is a typed union of text, number, date, boolean and choice ID.

**Implementation.** The server translates `ItemQuery` into parameterized SQL. Built-in
fields map to columns and custom fields to `EXISTS` subqueries on `ItemFieldValue`.
Free text uses a regular SQLite **FTS5** table indexing title, description and
ticket number. Store the item `Id` as an `UNINDEXED` column and join on it.

- Kept current by `AFTER INSERT/UPDATE/DELETE` triggers on `TodoItem`, created in the
  migration, so the index updates in the same transaction as the row.
- Soft-deleted rows stay in the index; search joins FTS hits back to `TodoItem`, so the
  normal deleted-row filter and the scope filters apply. Restore needs no index work.
- The migration that creates the index populates it from existing `TodoItem` rows.
- Tests cover pre-existing rows, insert, edit, soft delete, restore and hard delete.

All search code is tested against real SQLite.

**Later:** a text syntax (`type:error priority>=high due<2026-12-01 "deadlock"`) that
parses into an `ItemQuery`, and saved searches.

### 7.3 What v1 does to stay ready

- Built-in fields are ordinary typed columns with indexes (above).
- `TodoItem` has no catch-all "extra data" blob that search would have to unpick later.
- Adding the Phase 3 tables is an additive migration; no v1 table changes.

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
Phase 4.

## 9. Delivery phases

The .NET implementation completed Phases 0–2 (the original v1) and Phase 3 (custom
fields). It served as the behavior reference for the completed TypeScript pivot.
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
| **5. Calendar** | Month/week view of deadlines and scheduled items with click-through | See §10 |

## 10. Roadmap (after v1)

### 10.1 Requested by the owner (13 Nov 2026)

**Tickets as a separate item kind.**

- Two kinds of item: **ToDo** (general, as today) and **Ticket** (a ToDo header with
  ticket-specific metadata and features). A ticket's sub-items are ordinary ToDo items.
- Ticket fields: ticket number, title, description. They are usually copied in from
  another system, so pasting them in must be low-friction.
- Paste in: the description is parsed so that each line becomes its own ToDo sub-item.
- Export to clipboard: copy ticket number, copy title, copy description. Copy
  description rebuilds the text from the sub-items, one per line, in two forms: with a
  done/not-done marker on each line, and plain with no markers.
- Child tickets: a ticket can link child tickets, which sit under the parent ticket
  the way sub-items sit under a todo item.
- New item status **Pending**, with a note of what the item is waiting on: a person or
  another ticket.
- Touches §5 (`TodoItem` already has `TicketNumber`; `ItemType` is a lookup list, so
  "ticket" may need to be a real kind rather than an item type), §6.1 (completion
  roll-up with child tickets and Pending) and §6.3 (does Pending affect urgency?).
- Open questions: Is Pending a third state beside Open and Completed, and does it block
  a parent's auto-completion? Is "waiting on a ticket" a link to a ticket in this app,
  free text, or either? Which line formats does the parser handle (bullets, numbers,
  `[ ]`/`[x]`, blank and indented lines), and is the original description kept? Which
  done/not-done marker format on export? How do nested sub-items export?

### 10.2 Other ideas

- **Calendar view** (Phase 5): month and week grids; due dates as all-day or timed
  entries, scheduled items as blocks; drag to reschedule.
- Trash view with restore (data model already supports it, §5.3).
- Reminders / OS notifications for approaching deadlines.
- Recurring items.
- Markdown descriptions; attachments/links.
- Saved searches and the text query syntax.
- Undo/redo for recent actions.
- Import/export (JSON, CSV).
- Broader installer distribution across supported desktop platforms (electron-builder).
- Mobile or standalone browser clients reusing the RPC contracts and server rules.
- Optional sync/shared database (adds time-zone ids, §5.4).

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

## Appendix A. Review log

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
| 4 | FTS5 storage needs stable item IDs | §7.2 supersedes the earlier FTS5 decisions. Store item IDs and populate the index in the migration |
