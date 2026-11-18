# Task Tracker — Project Plan

Status: **Revision 5 — approved, in development** · Owner: Elijah Harris · PM: Claude

## 1. Goal

A cross-platform desktop task manager (Windows first), written in C# with Avalonia, that organizes work the way a
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
| R8 | Urgency background color: neutral, yellow, red | Thresholds configurable globally and per project (§6.5). A parent shows the most urgent of itself and its open sub-items |
| R9 | Mark complete / reopen | |
| R10 | Completed items move to a collapsed "Completed" section in the same area | Applies at every level, including under a parent (§6.2) |
| R11 | Sub-items, nested to any depth | |
| R12 | Parent auto-completes when all sub-items complete | Setting, on by default, overridable per project |
| R13 | **Metadata-ready design** | v1 ships a schema and code structure that custom fields and search slot into without rewrites (§7). Users *adding* fields arrives in Phase 3; *searching* by them in Phase 4 |
| R14 | Cross-platform UI (Avalonia), Windows as the primary target | See §3–4 |
| R15 | Two-level settings: global defaults, optional per-project overrides | §6.5 |

### Out of scope for v1 (roadmap, §10)

Calendar view, custom fields, search UI, reminders/notifications, recurring items,
multi-user sync, import/export, mobile/web front ends.

## 3. Key decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Runtime | .NET 10 (LTS) | Current long-term-support release |
| UI | **Avalonia 12** (Fluent theme) | Owner's decision: cross-platform from day one (Windows, macOS, Linux) and a framework the team wants to learn. WPF-like XAML, compiled bindings, mature `TreeView`/`Expander` |
| ViewModels | Separate **UI-agnostic project** (no Avalonia references) | Logic stays testable without a UI, and a future mobile/web head (Avalonia or otherwise) reuses it |
| MVVM toolkit | CommunityToolkit.Mvvm | Microsoft-maintained, source-generated, framework-neutral |
| Storage | SQLite via EF Core 10, file in the OS app-data folder (`Environment.SpecialFolder.LocalApplicationData`/TaskTracker) | Local, zero-install, real SQL for metadata queries, migrations built in |
| IDs | `Guid` (version 7, time-ordered) | Safe for future sync/merge; v7 keeps index locality |
| Time | `TimeProvider` injected everywhere | Urgency and completion logic testable with a fake clock |
| DI | Microsoft.Extensions.DependencyInjection | Standard container; composition root in the desktop app |
| Tests | xUnit, plain asserts | No licensing surprises (FluentAssertions v8 is commercial) |

Rejected alternatives:

- **WPF** — the Windows standard, but Windows-only; a second view layer would be needed later.
- **WinUI 3** — modern look, but weaker tooling and Windows-only.
- **.NET MAUI** — cross-platform, but its desktop story is the weakest of the options.

## 4. Architecture

```
TaskTracker.sln
├── src/
│   ├── TaskTracker.Core            Domain model, domain rules, application services,
│   │                               repository interfaces. No UI, no EF.
│   ├── TaskTracker.Infrastructure  EF Core DbContext, migrations, repositories,
│   │                               settings store.
│   ├── TaskTracker.Presentation    ViewModels (CommunityToolkit.Mvvm), navigation and
│   │                               dialog abstractions. Targets net10.0. References Core only.
│   └── TaskTracker.App.Desktop     Avalonia views (AXAML), converters, behaviors, theme, DI bootstrap.
└── tests/
    ├── TaskTracker.Core.Tests            Domain + service tests (fake repos, fake clock)
    ├── TaskTracker.Infrastructure.Tests  Repository tests against real SQLite (in-memory)
    ├── TaskTracker.Presentation.Tests    ViewModel behaviour tests (no UI framework)
    └── TaskTracker.App.Desktop.Tests     View smoke tests + screenshots (Avalonia headless, Skia)
```

Dependency rule: `App.Desktop → Presentation → Core ← Infrastructure`. `App.Desktop` also
references `Infrastructure` solely to wire up DI.

Rules that keep the code readable and portable:

- ViewModels never touch UI framework types. Dialogs, navigation and clipboard go through
  narrow interfaces (`IDialogService`, `INavigationService`) implemented in `App.Desktop`.
- **Gestures in the view, decisions in the ViewModel.** Drag-and-drop is an Avalonia behavior
  that only translates a drop into a ViewModel command such as
  `MoveItem(itemId, targetParentId, targetIndex)`. Tree expansion/selection state lives
  in the ViewModels, not in `TreeViewItem`s. This keeps a future mobile/web head cheap.
- Colors live in the view layer. Core computes an `Urgency` value
  (`None/Approaching/Imminent/Overdue`); a converter maps it to a theme brush.
- Domain rules (completion, urgency, hierarchy checks) are plain methods on plain
  objects, testable with no database.
- One class per file, file-scoped namespaces, nullable enabled, warnings as errors,
  `.editorconfig` enforced in build.

## 5. Domain model

```
Project ─1:N─ Folder (self-referencing ParentFolderId, null = top level)
Project ─1:N─ TodoItem (FolderId null = project root)
TodoItem ─1:N─ TodoItem (ParentItemId, sub-items)
TodoItem ─1:N─ ItemLink (web or mail links, §7.10)
TodoItem ─N:1─ ItemType
TodoItem ─N:1─ PriorityLevel
GlobalSetting (key/value);  ProjectSetting (ProjectId, key/value)
Phase 3: FieldDefinition ─1:N─ FieldChoice;  TodoItem ─1:N─ ItemFieldValue ─N:1─ FieldDefinition
```

### Entities

**Project** — `Id`, `Name`, `Description?`, `SortOrder`, timestamps, deletion fields (§5.3).

**Folder** — `Id`, `ProjectId`, `ParentFolderId?`, `Name`, `SortOrder`, timestamps, deletion fields.

**TodoItem**

| Field | Type | Notes |
|-------|------|-------|
| `Id` | Guid | |
| `ProjectId` | Guid | Needed because root-area items have no folder; also speeds project-wide search |
| `FolderId` | Guid? | null = project root |
| `ParentItemId` | Guid? | null = top-level item |
| `Title` | string (required, ≤ 300) | |
| `Description` | string? | Markdown (a superset of the plain text stored before); previewed read-only in the editor, §7.10 |
| `TicketNumber` | string? (≤ 100) | Free text, e.g. `JIRA-1234`. Indexed, not unique |
| `PriorityLevelId` | Guid? | null = no priority |
| `ItemTypeId` | Guid? | |
| `DueDate` | DateOnly? | |
| `DueTime` | TimeOnly? | Only valid when `DueDate` is set. Absent = due end of day |
| `ScheduledStart` / `ScheduledEnd` | DateTime? (floating local, §5.4) | For discussions and meetings. End requires start; end ≥ start |
| `CompletedAtUtc` | DateTime? | null = open |
| `SortOrder` | int | Order among siblings |
| `CreatedAtUtc`, `UpdatedAtUtc` | | |
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
order, archive flag) and one generic "manage list" ViewModel and view.

**GlobalSetting** — `Key`, `Value` (text). **ProjectSetting** — `ProjectId`, `Key`,
`Value`. A missing project row means "inherit the global value". See §6.5.

### 5.1 Hierarchy invariants

Enforced in one place, the Core `ItemTree`/`FolderTree` classes, and covered by tests:

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

### 5.2 Database specifics (SQLite + EF Core)

- `DateOnly`, `TimeOnly`, `DateTime` are stored as ISO-8601 text by the provider, which
  sorts and compares correctly. `DateTimeOffset` is **not** used (the SQLite provider
  cannot order or compare it server-side).
- No `decimal` columns in queried paths (SQLite stores them as text, so range queries
  break). Numeric metadata uses `double` (REAL).
- Indexes: `TodoItem(ProjectId, FolderId)`, `TodoItem(ParentItemId)`,
  `TodoItem(TicketNumber)`, `TodoItem(DueDate)`, `Folder(ProjectId, ParentFolderId)`.
- Check constraints for simple row rules (e.g. `DueTime` requires `DueDate`;
  `ScheduledEnd >= ScheduledStart`).

### 5.3 Deletion and restore

Soft delete, so a Trash/restore view can be added without schema change.

- Deletion fields on Project, Folder, TodoItem: `DeletedAtUtc?`, `DeletionBatchId?`.
- Deleting a node stamps it **and all its descendants** with the same `DeletionBatchId`
  in one transaction. Rows already deleted earlier keep their original batch.
- Restore works per batch: it restores exactly what was deleted together. Restoring is
  blocked if the batch's top node's parent is itself deleted ("restore the folder first").
- An EF global query filter hides deleted rows. Admin/trash queries opt out explicitly.
- Uniqueness: folder and item names are **not** unique (duplicates are legitimate).
  Unique keys that exist (`ItemType.Name`, later `FieldDefinition.Key`) use archive,
  not soft delete, so they never collide with deleted rows.
- Deleting a sub-item re-runs the completion rule on its ancestors (§6.1).

### 5.4 Dates and times

- System timestamps (`CreatedAtUtc`, `CompletedAtUtc`, …) are UTC.
- User-entered dates/times are **floating local time**: "due Friday 15:00" means
  15:00 on the user's clock wherever they are, the same way all-day and floating events
  work in calendar apps. This fits a single-user desktop app and avoids surprise shifts.
- To compare with "now", a `FloatingTime` helper converts a floating value to an instant
  using a `TimeZoneInfo` **passed in explicitly** (the app supplies `TimeZoneInfo.Local`;
  tests supply fixed zones). A time in a DST gap becomes the first valid instant after
  it; an ambiguous (repeated) time uses the earlier instant. Tests cover gap, repeat and
  end-of-day cases in fixed zones, alongside a fake `TimeProvider` for "now".
- If sync is ever added, we add a `TimeZoneId` column and convert; the field names do not change.

## 6. Business rules

### 6.1 Completion and sub-items

Setting: `AutoCompleteParentWhenChildrenComplete` — **default on**.

Definitions: an item's **active children** are its non-deleted sub-items. A **leaf** has
no active children and is completed/reopened manually like any task.

With the setting **on**, the invariant is: *an item with active children is complete
exactly when all of its active children are complete.* After **any** change to a tree —
complete, reopen, add, delete, restore, move, indent/outdent — the app re-evaluates the
affected item's ancestors bottom-up and fixes their state. Reparenting evaluates the union of
both chains, deepest first, using the final tree. Specifically:

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

`UrgencyCalculator.Calculate(item, now, timeZone, thresholds)` in Core. It resolves the
item's floating deadline with `FloatingTime` (§5.4) using the `timeZone` passed in.

**Effective deadline** = the due date/time if set; otherwise the scheduled start if set;
otherwise none. So a discussion with only a meeting time still turns yellow/red as it nears.

| Condition | Urgency | Default color |
|-----------|---------|---------------|
| No effective deadline, or item complete | `None` | Neutral (theme background) |
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

- The UI re-evaluates urgency on a one-minute timer so colors change without a refresh.
- Colors are theme resources with readable contrast (pale backgrounds, dark text), and
  urgency is never shown by color alone (the badge/icon carries it too).

### 6.4 Moving and ordering

- Items reorder among siblings by Alt+↑/↓ or row drag (`SortOrder`, renumbered among
  siblings on each move; sibling counts are small).
- Moving a top-level item to another area **in the same project** moves its whole
  subtree (invariant 3). Moving between projects is out of scope for v1; if added later
  it must handle project-scoped custom fields.
- Sub-items cannot be moved to another area on their own. They can be re-parented
  within the same area by row drag or Alt+→/← (§7.5).
- Folders move within the same project only (invariant 1).

### 6.5 Settings: global and per project

Two sources: **global** values, which every project uses by default, and optional
**project overrides**. The effective value for a project is its override if present,
otherwise the global value.

| Setting | Type | Default | Per-project override |
|---------|------|---------|----------------------|
| `AutoCompleteParents` | bool | on | yes |
| `UrgencyYellowThreshold` | duration | 3 days | yes |
| `UrgencyRedThreshold` | duration | 24 hours | yes |

Design:

- Each setting is declared once in Core as a typed definition, e.g.
  `public static readonly SettingDefinition<bool> AutoCompleteParents = new("autoCompleteParents", defaultValue: true, projectOverridable: true);`
  Adding a setting later is one line plus its UI control.
- `ISettingsService` gives `GetGlobal(def)`, `SetGlobal(def, value)`,
  `SetProjectOverride(projectId, def, value)`, `ClearProjectOverride(projectId, def)` and
  `GetEffective(projectId)`, which returns an `EffectiveSettings` record. Each value in
  it carries its source (`Global`/`Project`) so the UI can show "Inherited from global"
  with a "Reset to global" button.
- Values are stored as invariant-culture text (`true`, ISO-8601 durations) and parsed by
  the definition, so the tables never change when settings are added.
- **Auto-complete and reconciliation (§6.1)** apply to the *effective* value: a change
  that turns auto-complete on for some projects (a project override, or a global change
  that inheriting projects pick up) runs the reconcile prompt for exactly those projects,
  in one transaction with the setting change.
- UI: **App Settings** holds global values and the item type / priority lists. **Project
  Settings** (from the project's menu) shows each overridable setting with an
  "Override" checkbox.

## 7. Metadata and search design

Metadata will grow and search will be built on it. This section is the **design** that
v1 must not contradict; the code arrives in Phases 3 and 4.

### 7.1 Custom fields (Phase 3)

**FieldDefinition** — `Id`, `Key` (stable, unique, e.g. `severity`), `DisplayName`,
`DataType` (`Text, Number, Date, Boolean, Choice`), `ProjectId?` (null = global),
`IsArchived`, `SortOrder`.

**FieldChoice** — `Id`, `FieldDefinitionId`, `Label`, `SortOrder`, `IsArchived`.
Values store the choice `Id`, so renaming a label never breaks data or saved searches.
Removing a choice archives it; items keep their value.

**ItemFieldValue** — `ItemId`, `FieldDefinitionId`, and one typed column per data type:
`TextValue`, `NumberValue` (double), `DateValue` (DateOnly), `BoolValue`, `ChoiceId`.

- Exactly one value column is set, matching the definition's type. Enforced by a
  `FieldValueValidator` in Core at the service boundary, backed by a DB check constraint
  ("exactly one non-null").
- The validator also checks that the field is global or belongs to the item's project,
  and that a `ChoiceId` belongs to that field. The database backs the second rule with a
  composite foreign key `(FieldDefinitionId, ChoiceId)` → `FieldChoice(FieldDefinitionId, Id)`.
- Items do not move between projects (§6.4), so a project-scoped value can never end up
  on an item in another project.
- An absent row means "no value". Empty strings are normalized to absent.
- A field's `DataType` cannot change once any value exists; create a new field instead.
- Indexes on `(FieldDefinitionId, TextValue)`, `(FieldDefinitionId, NumberValue)`,
  `(FieldDefinitionId, DateValue)`, `(FieldDefinitionId, ChoiceId)`.
- Keys are creation-time lowercase slugs of display names, globally unique with numeric
  collision suffixes, and never change on rename; the database has a unique key index.
- Built-in search keys (`title`, `ticket`, `type`, `priority`, `due`, `scheduled`,
  `status`, `link`) and the query-syntax keywords (`has`, `no`, `is`, §7.7) are reserved. Custom fields use the next numeric collision suffix.
  The saved-search migration renames existing keyword keys with the same first-free suffix rule;
  field ids and values remain unchanged.
- Display names are required and trimmed, and are case-insensitively unique among active
  fields visible together (global plus project fields).
- Fields archive instead of deleting; unarchive rechecks name uniqueness, and archived
  fields retain existing values.
- A field's type changes only before any value exists.
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

**Field registry.** `IFieldRegistry` returns every searchable field as a
`SearchableField { Key, DisplayName, DataType, Source }`. `Source` is either a built-in
column (`title`, `ticket`, `priority`, `type`, `due`, `scheduled`, `status`, `link`) or a
`FieldDefinition`. Search code treats both the same.

**Query model** (Core, storage-agnostic):

```csharp
public abstract record SearchScope
{
    public sealed record AllProjects : SearchScope;
    public sealed record Project(Guid ProjectId) : SearchScope;
    public sealed record Area(Guid ProjectId, Guid? FolderId, bool IncludeSubfolders) : SearchScope;
}

public sealed record ItemQuery(
    SearchScope Scope,
    string? Text,                       // title, description, ticket
    IReadOnlyList<FieldFilter> Filters, // all must match (AND)
    bool IncludeCompleted);

public sealed record FieldFilter(string FieldKey, FilterOperator Operator, FilterValue? Value);
```

Operator semantics are fixed up front, including missing values:

| Operator | Matches |
|----------|---------|
| `Equals`, `GreaterThan`, `LessThan`, `Between`, `Contains` | Items that **have** a value satisfying it |
| `NotEquals` | Items that have a value different from the given one (no value → no match) |
| `IsEmpty` / `IsNotEmpty` | Items without / with a value |

`FilterValue` is a small typed union (text, number, date, bool, choice id), not `object`.

**Implementation** (Infrastructure): `SqlItemSearch` builds one parameterized, bounded
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

- Built-in field types are title and ticket (Text), type and priority (Choice), due
  and scheduled (Date), and status (Boolean, displayed as "Completed"). Scheduled
  comparisons use the date of `ScheduledStart`; status true means completed.
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
- Today comes from the injected TimeProvider and explicit local time zone. Previous, Today, Next, Month and Week control the period. PageUp/PageDown change periods (also with an entry focused, but not while a text box has focus); Ctrl+Shift+M/W switch views.
- The scope is All projects from Home or This project from a workspace. Include completed is available in either scope.
- Home, workspace, and Ctrl+Shift+C open the calendar. Back or Escape (with no modifiers) restores the previous page. Search and Calendar never stack: opening one from the other disposes it and keeps the original page as the single return target, so Back lands on that page and activating an entry or result asks that page's unsaved-changes guard once. An entry activation still pending when the calendar is left is dropped. Activating an entry opens its current workspace folder and selects it, subject to the unsaved-changes guard. A deleted item reloads the calendar and reports “This item no longer exists”. Month navigation moves from the first day of the month.
- Entries use their own urgency, refreshed each minute, and show it as a label (Approaching, Imminent, Overdue) with a bold title when overdue, never by colour alone; tooltips show type and priority.
- Drag to reschedule (Phase 5b). Pointer and keyboard use the same rules, planned in Presentation (`CalendarReschedule`, `CalendarDropMapper`) and saved by `ICalendarRescheduler` (`MoveDueAsync`, `MoveScheduleAsync`; one unit of work each, deleted items fail with a rule error):
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
- Alt+→ indents under the previous sibling; Alt+← places the item immediately after
  its parent. Ctrl+Shift+L opens Move to… for a selected top-level item; the context
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
  `IDialogService.ConfirmAsync(..., cancelIsDefault: true)` makes Cancel the default and focused
  button, so Enter or Escape cancels and only a click on the confirm button destroys data. Other
  dialogs keep their existing behaviour.
- **One change at a time.** A second Restore, Delete permanently or Empty trash is ignored
  while one (or its confirmation) is in progress.
- **Empty trash** (behind a confirmation) permanently deletes everything in scope in one
  transaction: all deleted folders and items, and deleted projects with all they own. Live rows
  are never touched; one that points at a deleted row stops the operation.
- **Navigation.** A Trash button on Home and in the workspace header, and Ctrl+Shift+T (exact
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
- **Code.** Core `TrashService` (`ListAsync`, `RestoreAsync`, `PurgeAsync`, `EmptyAsync`; one
  unit of work each) over `ITrashRepository`, the only place that queries deleted rows across
  projects and removes rows.

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
| `is:done` / `is:open` | `status` Equals true / false; a query with `is:done` (or `status:yes`) turns Include completed on |

Values: Text as written (quote when it has spaces); Number with the **invariant** culture (a dot for
decimals; a saved search must mean the same on every machine); Boolean `yes|no|true|false`; Choice by
label (case-insensitive) or by unquoted `#<guid>` id (quote an id-shaped label); Date `yyyy-MM-dd`, `today`, `tomorrow`, `yesterday`, or an
offset such as `+3d` / `-1w`, resolved with the injected `TimeProvider` and the explicit time zone (§5.4).
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
- **Opening** (`INavigationService.OpenSavedSearchAsync`) shows the Search page with the saved scope
  (a project or folder scope uses it as the page's origin), include-completed, text and rows, and runs it.
  Opened from the Search page it replaces that page and keeps the original return page (§7.4).
- **Stale searches** show an inline error instead of results: `The saved search 'X' can't be run.` plus the
  reason: an archived or deleted field (unknown field), a deleted choice ("no longer exists"), or a
  deleted project or folder ("Search project does not exist."). A saved search deleted meanwhile reports
  "This saved search no longer exists." and the lists refresh.
- **`SavedSearchService`** (one unit of work per operation): `ListAsync`, `FindAsync`, `SaveAsync(name,
  definition, overwrite)`, `RenameAsync`, `DeleteAsync` (hard delete), `ReorderAsync`. Saving an existing
  name without `overwrite` is a rule error; the UI asks "Replace it?" first. Names clash case-insensitively
  (the database backs this with a `NOCASE` unique index). Saving requires the scope's project to exist.
  Reordering is service-only for now; the lists show the stored order.
- **UI.** The Search page has Save search, Rename and Delete (acting on the saved search currently open) and
  a chip per saved search that opens it. Home has a "Saved searches" section (hidden when empty) with each
  search as a link plus Rename and Delete. Returning to Home reloads the list.

### 7.8 Undo and redo

**History.** `UndoHistory` (Core, singleton) keeps the last 50 undoable steps in memory for the
session; restarting clears it. One user action is one step however many rows it touches (a
completion cascade, a deleted branch, a renumbered sibling list). Recording a new step drops
every step that was undone, so redo is cleared by any new action.

**What is recorded.** Recording is opt-in and explicit. A service that performs an undoable user
action saves with a label, `unitOfWork.SaveChangesAsync(UndoLabels.Complete(title), ct)`; only
labelled saves are recorded, and the label names the item the user acted on (completing a child
that auto-completes its parent is "Complete 'Child'"). Everything else saves without a label and
is never recorded: settings (including the auto-complete reconciliation they trigger), lookups,
field definitions, saved searches, creating a project or folder, trash purge and empty, seeding
and migrations. Search the services for `UndoLabels.` to see exactly what is undoable: create item
or sub-item; one item Save (built-in and custom fields together, cleared fields included);
complete and reopen with their cascade; delete item, folder or project (a soft-delete batch);
reorder, indent, outdent, re-parent, drag and move to a folder; calendar reschedule; rename
folder or project; and restore from the trash (undoing it deletes the batch again). On a labelled
save `EfUnitOfWork` snapshots the before and after values of every added, modified or deleted
item, folder, project, item field value and item link (§7.10), in the operation's own save, and hands the step to an
`IUndoRecorder` (tests substitute a fake). A row whose only change is its `UpdatedAtUtc` stamp is
left out, so steps stay small and do not widen conflicts. Purging a batch also makes the delete it
followed un-undoable.

**Applying a step.** Undo and redo write the recorded values back in one unit of work. Before
writing, every affected row (soft-deleted ones included) is compared with the values the step left
behind. If any row differs the whole step is refused and the history position does not move:
"This item changed since; can't undo." (or "redo"; "folder" or "project" for those rows). A row
that no longer exists, because its deletion was purged from the trash, gives "This item was
permanently deleted since; can't undo." A refused step changes nothing; there is no partial undo.

**UI.** Ctrl+Z undoes; Ctrl+Y and Ctrl+Shift+Z redo. The shortcuts work anywhere in the main window
(workspace, calendar, search, trash, Home) except while a text box has focus (quick add, search
box, a date picker's text, an editable combo box), where Ctrl+Z keeps its normal text-editing
meaning. With nothing to undo or redo the keys do nothing at all, silently. The workspace header
has Undo and Redo buttons whose tooltips name the action ("Undo: Complete 'Write report'"); they
are disabled when there is nothing to do. A status toast at the bottom of the workspace (an
overlay, so nothing moves) shows "Undid: ...", "Redid: ..." or a refusal. It clears on the next
recorded action and when the user goes to another screen. Refusals on screens without the toast
are shown in a message box. `UndoCoordinator` (Presentation) holds this behaviour; the shell
creates it and hands it to each workspace. A failure other than a refused step is reported
through the shell's unexpected-error message instead of crashing the app. If a write-back would
break a foreign key (a choice or lookup the step used was removed since), it is refused as
"This change references something that was removed; can't undo."

**Reloading.** After a step the screen on show reloads: the workspace keeps its folder and the
selected item when they still exist, the calendar and trash lists reload, a search that has run runs again, Home recounts. A search,
calendar or trash page also marks the page behind it out of date, so going back reloads it
through the existing unsaved-changes guard.

**Dirty editor rule.** While the item editor holds unsaved edits, undo and redo are blocked with
"Save or discard your item edits before undoing or redoing." The draft is untouched. (Reloading
under a draft would either lose it or ask a question the user did not trigger.)

### 7.9 Import and export

`DataTransferService` (Core, `Transfer`) exports and imports; every public operation is one unit of work.

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

**JSON import** reads a file produced by export and adds it as **new data**; nothing existing is overwritten.

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
quotes doubled. Columns: `Title, Description, Ticket, Type, Priority, Due date, Due time, Scheduled start, Scheduled end,
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
Type and priority match by name; an unknown or archived name is an **error** (it never creates a lookup, so typos do not create junk)
and the message lists the valid names. Custom fields match by display name among the project's active fields; values follow §7.1:
number with a dot (a decimal comma is refused with a hint), `yyyy-MM-dd` date, yes/no, choice by label, blank cell = no value.
`Completed` = yes without `Completed at` completes now; `Completed at` needs `Z`. Rows with fewer cells than the header are padded;
more is an error. Row numbers count like a spreadsheet (header = row 1) and appear in every error (`Row 4, Type`).
The **preview** (`PreviewCsvAsync`, no writes) reports row count, columns used, unknown and ignored columns, the first five rows and
every error; nothing is imported while there is an error. Commit re-checks the file and creates all rows in one save, after a backup.

**UI.** Home has an Import / Export menu: Export everything (JSON), Export project (JSON), Export project (CSV), Import JSON, Import
CSV into project. A project is chosen from a list, a folder from the usual folder list (only when the project has folders), the file
through the platform file picker (`IFilePickerService`, implemented with Avalonia's `StorageProvider`; no Avalonia types in
Presentation). Cancelling any picker or confirmation does nothing. A JSON import first shows the validation errors, or asks
"Import N projects ...? ... can't be undone ... a backup is saved first". The CSV preview is a dialog with an Import button only when
it has no errors; its rows with errors are marked. Home reloads after an import and shows a status line. Reading, checking, exporting and importing run
off the UI thread; while one runs, the menu and every command are disabled (a second click is ignored) and a progress bar shows.
The Search page's "Export results (CSV)" re-runs the last search without the 200-row limit. For end-to-end tests only,
`CompositionRoot` swaps in a picker that answers with a fixed path, and only when **both** `TASKTRACKER_TEST_FILE_PATH` and
`TASKTRACKER_SMOKE=1` are set (README.md); the real picker never reads those variables.

### 7.10 Markdown and links

**Markdown descriptions.** `TodoItem.Description` is the same column as before and holds Markdown. Markdown is a superset of the
plain text already stored, so there is no data migration. The item editor shows **Edit | Preview** tabs above the description: Edit is
the multi-line text box; Preview renders the text read-only. Previewing is a view mode only (it never makes the editor dirty, and a
newly selected item opens in Edit).

- **Parsing** is Markdig 1.5.1 (pinned in `Directory.Packages.props`; 1.6.0 was under two weeks old). `MarkdownParser` (Presentation,
  `Markdown`) maps Markdig's tree into small display records (`MarkdownParagraph`, `MarkdownList`, ...), so no parser type reaches the
  view. App.Desktop's `MarkdownView`/`MarkdownControlBuilder` turn those records into ordinary Avalonia controls. No web view, no HTML.
- **Supported:** headings, emphasis and strong, inline code, fenced and indented code blocks, bullet and numbered lists (nested, a
  numbered list keeps its start number), task-list checkboxes (display only: not focusable, clicks do nothing, the stored text never
  changes), links and bare http(s) addresses, block quotes, horizontal rules. Single newlines are kept as line breaks, so existing plain
  multi-line descriptions look the same as before. Nothing else (tables, footnotes...) is interpreted; it shows as written.
- **Raw HTML is never interpreted.** The parser has HTML switched off, so `<b>x</b>` or an HTML block reaches the preview as literal text.
- **Images are never loaded.** An offline desktop app makes no network fetches and reads no local files for a description, so an image
  is shown as a link whose text is the alt text ("image" when empty); it is clickable only under the link rule below.
- **Limits** keep hostile or huge text from freezing the preview. The source is capped at 100,000 characters. Blocks, list entries
  and inline nodes share a 2,000-node limit and a 100,000-character display text limit that includes expanded link addresses.
  Containers nested deeper than 16 levels show as plain text. Input Markdig refuses as too deeply nested is shown verbatim as a
  code block. A notice line says when the preview was cut short. The stored text is never changed.

**Opening links.** Links in the preview open in the OS default handler through `ILinkLauncher` (Presentation; Avalonia's `Launcher` in
App.Desktop, a fake in tests), and **only for `http`, `https` and `mailto`** (`LinkPolicy`, Core). Any other scheme (`file:`,
`javascript:`, `ftp:`, custom schemes, relative paths) is shown as text followed by its address in parentheses and is not clickable; it
is never launched, and the launcher checks the policy again itself. There is no confirmation dialog: the user wrote or pasted the text,
and the address is shown in a tooltip. A failed launch shows a message. Both the preview and the Links list use the workspace's
`OpenLinkCommand`.

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
- **Save.** `ItemService.EditAsync(id, edit, values, links)`: a non-null `links` replaces the whole list in the same unit of work
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
  ViewModel tests, headless interaction tests for the Repeat section, Skip and Stop repeating,
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
  migration is additive and follows the AGENTS.md trigger rule. Recurring copies (§7.11) and
  import/export (§7.9, JSON only) carry it. A change is part of the item edit's undo step.
- **Delivery state.** `ReminderDeliveredFor` records the reminder instant (UTC) that was last
  delivered for the item. A reminder is due when its instant is ≤ now and differs from
  `ReminderDeliveredFor`. Changing the due date, time or offset therefore re-arms the reminder
  without extra bookkeeping. Recording delivery is application state, not user data: it is not
  undoable and not exported.
- **Scheduler.** `ReminderScheduler` lives in Presentation and uses the injected `TimeProvider`.
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
  - The panel opens from a bell button in the title bar, with a count badge, and with Ctrl+Shift+R.
  - Snooze options are 10 minutes, 1 hour or tomorrow at `DateOnlyReminderTime`. Snooze sets a
    nullable `SnoozedUntilUtc`, which overrides the computed instant once; it is a labelled undo step.
  - Dismiss clears the entry from the panel.
  - Escape closes the panel only after focused controls have had it. An open combo box or a
    drag in progress takes Escape first. While the panel is open, Escape closes it before it
    can leave search, the calendar or the trash.
  - If **Mark complete** is blocked, the reason is shown in a message.
- **OS notifications.** `IReminderNotifier` is implemented in App.Desktop, and the in-app panel
  always shows reminders as well.
  - **Windows:** a native notification through the notification-area icon (Shell_NotifyIcon with a
    balloon, which Windows 10/11 shows as a toast). No packaging and no AUMID registration are
    needed.
    - The main window owns one persistent icon, added on the first reminder. It stays hidden
      except while a balloon shows.
    - Each balloon is an `NIM_MODIFY` with `NIF_INFO`. A click opens the item of the latest
      balloon.
    - The icon is deleted and the window subclass removed when the window closes, at the latest
      on `WM_DESTROY`. Disposal is idempotent.
  - **Linux:** the freedesktop `org.freedesktop.Notifications` D-Bus service through a managed D-Bus
    client. A connection is kept only once it has connected, and a failed call drops it so the
    next attempt reconnects. `Tmds.DBus.Protocol` is pinned to 0.94.1, the version Avalonia
    12.1.6 brings in.
  - **Elsewhere, or when the platform call fails:** in-app only. The failure is logged once.
    Platform notifications pause for 5 minutes (measured with `TimeProvider`) and are then
    tried again. The app keeps working throughout.
  - Clicking a notification brings the window forward and opens the item.
  - Any new package needs an exact, at least two-weeks-old version in
    `Directory.Packages.props`. Prefer no new dependency on Windows.
- **Tray.** With `KeepRunningInTray` on, closing the window hides it to a notification-area icon
  instead of quitting, so reminders keep firing. The tray menu has **Open** and **Quit**.
  Starting with the OS is out of scope; it belongs with installers.
  - The window hides only when a tray host really shows the icon. Windows and macOS always
    have one. On Linux, a `StatusNotifierWatcher` must own its name on the session bus.
  - Without a tray host, closing minimises instead, so the window is never unreachable.
    Closing an already minimised window, for example from the taskbar, quits.
  - The tray re-reads the setting only after a save that changed a global setting
    (`DataSaved.GlobalSettingsCommitted`), not after every save.
- **Single instance.** One app runs per user and database file.
  - The first launch holds a named mutex and listens on a named pipe. Both names come from a
    hash of the user name and the full database path.
  - A second launch on the same database connects to that pipe, which brings the running
    window forward, and then exits.
  - Different databases, such as test and smoke runs with their own `TASKTRACKER_DB_PATH`, run
    side by side.
  - If the running instance does not answer within 3 seconds (still starting, or stuck), the
    new launch starts normally rather than vanish.
- **Search (§7.7).** `has:reminder` matches open items whose effective reminder is not None.
- **Implementation decisions.** Offsets are subtracted in floating local time before converting to UTC.
  The 24-hour startup window includes its lower boundary. The panel keeps a session list, and a
  grouped notification opens that panel. A snooze applies to the base instant it deferred, so a
  different base instant re-arms the item. Undoing a pending snooze restores its panel entry.
  Version 1 JSON carries the optional item choice and project settings. Snoozes are local to the
  database. An existing custom field keyed `reminder` gets a free numeric suffix, and its saved
  searches are rewritten as for `repeats`. Windows uses system change messages, Linux uses logind
  for resume where available, and the scheduler checks the wall clock against monotonic time once
  a second to catch clock jumps. Linux activation uses the notification server's default action.
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
  - **ViewModel:** the scheduler with a fake `TimeProvider`, the missed-while-closed grouping and
    the panel actions.
  - **Headless interaction:** the bell button, Ctrl+Shift+R, snooze, Open, Mark complete, Dismiss,
    Escape (including an open combo box keeping its Escape) and the editor Reminder choice.
  - **Desktop units:** the single-instance name and handshake, the hide-or-minimise decision and
    the notifier cool-down.
  - **Snapshots:** the panel and the editor, light and dark.
  - **Smoke:** a reminder due in under a minute appears in the in-app panel; the OS toast itself
    is checked by hand.

### 7.13 Installers and releases

Decisions (made autonomously per the owner's 2026-11-14 instruction; listed for review):

- **One tool for every OS: Velopack.** It produces a Windows `Setup.exe` (per-user install, no admin,
  Start-menu shortcut), a Linux `AppImage` and a macOS `.app` bundle. MSIX is not used: it needs
  signing and packaging identity, and it would change where the app may write data.
  - Velopack's `vpk` CLI is a local dotnet tool pinned in `.config/dotnet-tools.json`.
  - The `Velopack` NuGet package is pinned in `Directory.Packages.props` at an exact stable version at
    least two weeks old, the same as the CLI version.
- **Startup hook.** `VelopackApp.Build().Run()` is the first statement in `Main`, before the
  single-instance guard (§7.12), so install, update and uninstall hooks run without opening a window.
- **Self-contained publish.** The publish is self-contained, so users need no .NET install. It targets
  `win-x64`, `linux-x64` and `osx-arm64`. It is not trimmed,
  because Avalonia and EF Core reflection make trimming risky.
- **Version.** One `<Version>` in `Directory.Build.props`, `0.1.0` for now. The release workflow takes
  the version from the tag (`v0.2.0` becomes `0.2.0`) and passes it to both `dotnet publish` and `vpk`.
  App Settings shows the version in an **About** line.
- **The default data location is preserved.** The database, its backups and the settings stay in the user's
  local-app-data folder (`DatabaseInitializer.DefaultPath`). Install, update and uninstall leave that
  folder alone. A reinstall picks up the existing data. A custom `TASKTRACKER_DB_PATH` inside the
  install folder can be lost during install, update, or uninstall. Migrations run at startup with a backup
  first (§11).
- **Updates.** App Settings has a **Check for updates** button. Velopack's GitHub source checks
  stable releases anonymously. If a newer version exists, it offers **Download**.
  - The `TaskTrackerUpdateFeedUrl` MSBuild property defaults to
    `https://github.com/Elijah7140/task-tracker` in `Directory.Build.props` and is embedded in
    the desktop assembly metadata. Both pack scripts accept an override. The release workflow
    reads the optional GitHub Actions repository variable `TASKTRACKER_UPDATE_FEED_URL`.
  - Auto-update requires releases published to a public repository. The default repository is
    currently private. Making it public or using a separate public release repository is an
    open owner decision. The workflow uploads to its own repository.
  - There is no automatic background check, so the app makes no network call unless the user asks.
  - HTTP 404 and 401 show “No update feed is available yet. Releases are published to a private or
    missing repository.” Network failures keep the generic check error. Uninstalled builds have
    their own message.
  - The update service sits behind an interface, so tests use a fake.
- **Start with the OS.** There is a global `StartWithSystem` setting, default off, in App Settings
  next to `KeepRunningInTray`.
  - Windows: the per-user `HKCU\...\Run` key.
  - Linux: a `~/.config/autostart/task-tracker.desktop` file.
  - macOS: not supported yet, so the setting is hidden.
  - The setting is only offered when the app is installed; a dev build has no stable path.
  - Uninstalling removes the entry through the Velopack uninstall hook.
- **Signing.** The builds are unsigned for now. Windows SmartScreen and macOS Gatekeeper will warn;
  the README says how to get past that. Signing is a later decision for the owner, as it needs
  certificates or an Apple developer account.
- **CI.**
  - **On pull requests:** a `package` job runs on Windows and Linux. It publishes and runs `vpk pack`
    to catch packaging breakage, checks the actual package ids in the release manifest, then uploads
    the installer as a workflow artifact. Pull requests
    publish no release.
  - **On a `v*` tag:** a `release.yml` workflow builds Windows, Linux and macOS packages and creates
    a GitHub Release with the Velopack release files, which update checks need.
- **Tests.**
  - Unit tests: the version text, the update-check states with a fake service (up to date, update
    available, failure, not installed), and the start-with-system entry writer with a temp folder or
    a registry abstraction.
  - Headless tests: the About line, Check for updates and the real discard prompt after an edit
    made during a download.
  - App Settings snapshots cover the ready-to-restart state.
  - The CI pack job proves the package builds.
  - Installing, updating and uninstalling are checked by hand on Windows; the README has a checklist.
- **Implementation decisions** (made where the bullets above are silent):
  - **Velopack 1.2.161** is used for both the package and `vpk`. It was the newest stable release at
    least two weeks old on 2026-11-17. The GitHub update source (`GithubSource`) ships in the main
    package.
  - **The pack id is `TaskTrackerApp`, not `TaskTracker`.** Velopack installs to
    `%LocalAppData%\<packId>` and deletes that whole folder on uninstall, so the id `TaskTracker`
    would delete the database. Tests guard the pack id passed to Velopack, and CI checks
    `Assets[].PackageId` in the generated channel manifest.
    - The main executable stays `TaskTracker.App.Desktop`, and shortcuts show the title "Task Tracker".
    - The exe embeds `app.ico`. Linux and macOS packages use Velopack's default icon, because the
      repository has no `.png` or `.icns` icon yet.
  - **Packages.**
    - `osx-x64` is not built: it would share the `osx` update channel with `osx-arm64`.
    - Releases carry full packages only, with no deltas.
    - Both scripts run .NET commands from the repository root. They validate the runtime
      against `win-x64`, `linux-x64` and `osx-arm64` and check both output paths under
      `artifacts/` before cleaning up. Symlinks and junctions in those paths are rejected.
    - Each OS packs on its own runner. One `publish` job then uploads the three channels in turn with
      `vpk upload github --merge` into a draft. Runs for the same tag are serialized. A rerun
      replaces any package artifacts it rebuilds, deletes a leftover draft and uploads from
      scratch. The job verifies all three uploaded channel manifests before publishing once.
      A rerun after a complete publication is a no-op.
    - A release version containing `-` uses `--pre`, so it is published as a GitHub prerelease
      and excluded from stable update checks.
  - **StartWithSystem saving.** It saves with the other global defaults on **Save defaults**.
    - After a successful save, the entry is written or removed. This happens on every save while the
      option is available; the operation is idempotent.
    - If the system refuses, the setting stays saved and the page shows a message.
    - While the option is unavailable, the stored value is left unchanged.
  - **The entries.**
    - Windows: a `TaskTracker` value under the `HKCU` `Run` key, holding the quoted path of the running
      exe. Velopack keeps that path stable across updates (`…\current\`).
    - Linux: `Exec` uses the AppImage path from Velopack's locator. The path is quoted under the
      Exec argument rules, then escaped as a desktop entry string value. The mounted copy's path
      changes on every run.
    - `XDG_CONFIG_HOME` is used only when it is an absolute path.
  - **Hooks.** Only Windows has a Velopack uninstall hook, which removes the `Run` value. No install or
    update hooks are needed, because the exe path does not change on update.
    - On Linux the user deletes the AppImage, and the README says to delete the autostart file too.
    - A reinstall keeps the stored setting but not the entry; saving the setting again recreates it.
  - **Download, then restart.**
    - While downloading, it shows "Downloading version X…", without a percentage.
    - When the download completes, App Settings shows "Ready to restart" with a **Restart to
      update** button. The update state survives navigating away and back.
    - Restart checks the active page for unsaved changes immediately before the updater handoff.
      If the user declines, the app stays open and the downloaded update is applied by Velopack
      on the next normal start. The UI says “The update will be installed the next time Task Tracker starts”.
    - When approved, the app starts Velopack's updater with `WaitExitThenApplyUpdates` and shuts
      down normally, so the tray icon, services and single-instance guard are disposed.
  - **Uninstalled builds** never call the network. They say "Updates are available only in installed
    builds."
  - **App Settings layout.** The About card sits between the global defaults and the lookup lists. UI
    tests use a fixed version (0.1.0) and fakes, so snapshots do not change when the version does.
  - The tool manifest moved from the repository root to `.config/dotnet-tools.json`. The `dotnet-ef`
    entry is unchanged.

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
- **Opening it.** A **Today** button in the top navigation and on Home, and **Ctrl+Shift+D**,
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
- **Live updates.** The view refreshes after any save. It also refreshes at local midnight, through
  a `TimeProvider` timer, so a new day starts empty.
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

**Not in this slice:** browsing earlier days.
- **Tests.**
  - Core/SQLite: the day boundaries in fixed zones, including DST days; the reopened-today exclusion;
    the ancestor context rows; and the exclusion of deleted items.
  - ViewModel: grouping and collapse state, and the midnight rollover with a fake `TimeProvider`.
  - Headless interaction: Ctrl+Shift+D, Ctrl+Shift+P, the context menu, and unchecking.
  - Light and dark snapshots of the Today view and of the row menu.
  - A smoke scenario.

## 8. User interface (Avalonia)

### Screens

1. **Home** — project cards (name, open count, overdue count). New project button. An **Import / Export** menu
   (§7.9) and a status line for its last result. The **Search** page has an "Export results (CSV)" button.
2. **Project workspace** — three panes:
   - **Left:** folder tree (project root at top). Right-click: new folder, rename, move, delete.
   - **Center:** the selected area's items.
     - Quick-add box at top (type a title, Enter).
     - Open items as an expandable tree, each row showing checkbox, type icon, title,
       ticket, priority, due/scheduled date, with (rolled-up) urgency background.
     - **Completed (n)** expander at the bottom, collapsed by default (§6.2).
   - **Right:** detail editor for the selected item (all fields, the Markdown description with Edit and Preview, links, sub-item list; §7.10).
   - Breadcrumb at top: `Home › Billing DB › dbo › Tables`.
3. **App Settings** — global auto-complete and urgency thresholds; manage item types and
   priority levels (add, rename, drag to reorder, archive).
4. **Project Settings** — per-project overrides (§6.5).
5. **Calendar** — scoped month and week views of due dates and scheduled blocks; activating an entry opens its item (§7.4).
6. **Trash** — deletion batches with Restore, Delete permanently and Empty trash, scoped to all projects or one (§7.6).
7. **Search** — query box with text syntax, filter rows, saved searches (§7.2, §7.7); Home lists saved searches.
8. **Today** — today's completions grouped by project and area, with their ancestor rows (§7.14).

### Keyboard

Ctrl+Z undo, Ctrl+Y or Ctrl+Shift+Z redo (§7.8; not while a text box has focus, where text
editing keeps its own undo). Ctrl+N new item, Ctrl+Shift+N new sub-item, Space toggle complete, F2 rename,
Delete delete (with confirm), Alt+↑/↓ reorder, Alt+→ indent, Alt+← outdent,
Ctrl+Shift+L move to area, Ctrl+F search (Phase 4),
Ctrl+Shift+C calendar, PageUp/PageDown previous/next calendar period,
Ctrl+Shift+T trash (§7.6), Ctrl+Shift+D Today and Ctrl+Shift+P push back one day (§7.14),
Ctrl+Shift+M/W month/week calendar view. On the calendar, with an entry focused, Alt+←/→ moves it a day
and Alt+↑/↓ moves it 15 minutes (§7.4); this is a different screen from the workspace, where
Alt+↑/↓ reorders items, so the two never clash.

## 9. Delivery phases

Each phase ends with a working build, passing tests, and a short demo.

| Phase | Deliverable | Exit criteria |
|-------|-------------|---------------|
| **0. Foundation** | Solution, projects, `.editorconfig`, analyzers, central package versions, CI (GitHub Actions matrix: `windows-latest` + `ubuntu-latest`, build + test), README with build steps | Empty Avalonia window launches; all tests run |
| **1. Core + data** | Entities, hierarchy invariants, EF mappings, first migration, repositories, `CompletionService`, `UrgencyCalculator` (incl. roll-up), floating-time helper, two-level settings service, seed item types and priority levels, DB backup before migrating | Domain rules in §5.1, §5.4, §6.1, §6.3, §6.5 covered by unit tests; database behaviour (§5.2 constraints, §5.3 delete/restore and query filters, transactional moves) covered by SQLite integration tests |
| **2. Main UI** | Home, project workspace, folder tree, item list with sub-items, completed sections, detail editor, urgency colors, app and project settings, delete with confirm, keyboard shortcuts | R1–R15 usable end to end; ViewModel tests pass with no UI framework; every layer of the §11.1 testing standard passes |
| **3. Custom metadata** | §7.1 tables (additive migration), field manager (global + per-project), custom fields in item editor | Users can add a field of each type and fill it in |
| **4. Search** | §7.2 query model, FTS5, filter-builder UI, results across a project or all projects | Search by any built-in or custom field with the operator semantics in §7.2 |
| **5. Calendar** | Month/week view of deadlines and scheduled items; click-through to the item; drag (or Alt+arrows) to reschedule | See §10 |

Phases 0–2 are v1.

## 10. Roadmap (after v1)

### 10.1 Requested by the owner (13 Nov 2026)

When one of these is picked up, its agreed design replaces the sections it conflicts with.

**UI pass: modern, Notion-like look.** The current UI needs a full visual pass.

- Rounded corners on controls and surfaces throughout; a modern, clean style like Notion.
- A Notion-style sidebar for navigation.
- Circles, not square checkboxes, to show completion.
- Urgency/severity as a subtle indicator (dot, pill or edge accent), not a background
  color across the whole row.
- Sized for 1080p and 1440p displays (density, font scale, spacing).
- No long form with one field per row. Quick add by typing into an empty line at the
  end of the list and pressing Enter; right-click → Edit opens a floating panel for the
  item's metadata.
- Conflicts with §8 (checkbox, urgency background, quick-add box at top, right-hand
  detail pane) and §6.3 (pale row backgrounds).

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

**Drag-and-drop items** (added 14 Nov 2026).

- Drag a row up or down to change its order among its siblings.
- Drop it onto another item to make it a sub-item, or drag it out of a parent to
  promote it.
- Drop it onto a folder in the folder tree (or sidebar) to move it, with its whole
  subtree, to that area (list).
- The rules in §6.4 and §6.1 still apply; the view only translates a drop into the
  existing reorder, move and move-to-area operations (§4).
- Needs a drop indicator, a keyboard path for every drop, and headless drag tests
  (§11.1).

### 10.2 Other ideas

- **Calendar view** (Phase 5): month and week grids; due dates as all-day or timed
  entries, scheduled items as blocks; drag to reschedule.
- **Drag-and-drop items** in the item tree: drag a row up or down to change its order
  among siblings; onto another item to make it a sub-item (or out of a parent to promote
  it); onto a folder in the left tree to move it to that area (list) with its subtree.
  The rules in §6.4 and §6.1 still apply; the view only translates a drop into the
  existing reorder/move/move-to-area operations (§4). Needs a drop indicator, a
  keyboard-equivalent path for every drop, and headless drag tests (§11.1).
- ~~Trash view with restore~~ (done, §7.6).
- Reminders / OS notifications for approaching deadlines (decisions in §7.12).
- Recurring items (decisions in §7.11).
- ~~Markdown descriptions; attachments/links~~ (done, §7.10; file attachments stay out of scope).
- ~~Saved searches and the text query syntax~~ (done, §7.7).
- ~~Undo/redo for recent actions~~ (done, §7.8).
- ~~Import/export (JSON, CSV)~~ (done, §7.9).
- Packaged installers per OS (decisions in §7.13: Velopack for Windows, Linux and macOS).
- **Quick reschedule from the context menu** (decisions in §7.14). Right-click an item (tree, search results,
  calendar) and choose "Push back one day", which moves its due date (and its scheduled
  block, if any) one day later. A labelled undo step, with a keyboard equivalent.
- **Tickets view.** A list of tickets in the order the owner wants to work on them. A
  ticket is an open item that has a ticket number (confirmed by the owner; an explicit
  ticket flag may come later but is not needed now).
  - **Numbered priority levels.** Extend the existing Priority field (§6.2) so it supports
    numbered levels (e.g. 1, 2, 3) alongside or instead of the named ones. This is the
    same Priority used everywhere, not a separate ticket priority.
  - **A level's number is not its rank.** The number is only a label, and the level's
    sort order is set separately. For example, the owner's levels rank 1, 7, 2, ...: level
    7 sits between 1 and 2. Nothing may sort or compare levels by number; the number
    and the sort order must be editable independently. Tests cover a non-monotonic
    mapping like 1, 7, 2.
  - **Ordering.** Items with no priority come first, ordered only by drag and drop. Below
    them are the prioritized items, grouped into one section per level in level sort
    order, and within a section by drag-and-drop order. The drag order is stored
    separately from the tree order.
  - **Dropping into a section.** Dragging an item to a spot below a prioritized item puts
    it in that section and sets its Priority to that level. Assumption: dragging an item
    up into the no-priority group clears its Priority. Every drop has a keyboard
    equivalent.
  - **Context menu.** "Set priority" on each item. If the level changes, the item moves to
    the bottom of the drag order in its new section.
  - Priority changes made here are labelled undo steps.
- **Statuses.** The owner asked for this on 2026-11-18; it is built in the same slice as the
  numbered priority levels and the Tickets view.
  - **One status per item.** Each item has at most one status, such as Queued, In progress,
    Testing or Completed. Statuses are mutually exclusive, like priority: one status and one
    priority at a time. An item may also have no status.
  - **Context menu.** "Set status" is on each item's context menu, everywhere item rows appear
    (tree, search, calendar, Today, Tickets), and in the editor. Changes are labelled undo steps.
  - **Editable list (owner's choice).** Statuses are an editable, reorderable list in App
    Settings, like item types and priority levels: add, rename, reorder and archive. The
    starting set is Queued, In progress, Testing and Completed.
  - **Linked to completion (owner's choice).** Each status is either *open* or *done*; the seeded
    Completed is done.
    - Setting a done status completes the item, with all the §6.1 rules.
    - Checking an item off sets the first done status.
    - Reopening restores the open status the item had before, or no status if it had none.
    - Auto-completed parents also get the done status.
    - Completion and status can therefore never disagree.
  - **Still to decide when building:**
    - The query key and filter field. The existing built-in `status` search key means
      open/completed, so saved searches must keep their meaning; migrate them if the key is
      reused.
    - What happens to a user custom field already named "Status". The existing built-in-key
      collision rules (§7.7) apply.
    - Import/export and recurrence copy. A copy probably resets to the first open status.
- **Today view (done today)** (decisions in §7.14). Shows the items completed today (local day, §5.4) that are
  still completed: an item checked off today and then unchecked does not appear.
  - Completed sub-items are grouped under their parent and collapsed by default.
  - A parent that is not itself completed still appears, as context, so its completed
    children are shown. It is expanded rather than collapsed, and visibly marked as
    not completed.
- **Undo everywhere it is feasible.** Audit every operation that changes user data and make
  it a labelled undo step (§7.8) wherever it can work reliably. This covers settings,
  lookup and field management, priority levels, links, trash actions and the new views.
  Each feature added from here on ships with undo unless that is infeasible. Operations
  left out, such as import (§7.9) and permanent purge, are listed in §7.8 with the
  reason.
- **Task stack.** Requested by the owner; scope and behaviour still to be agreed. Discuss
  with the owner before designing or building it.
- Mobile or browser head (Avalonia supports both) reusing the Presentation project.
- Optional sync/shared database (adds time-zone ids, §5.4).

## 11. Quality bar

- Domain rules: a unit test per row in §6.1 and §6.3, multi-level trees, and every
  hierarchy invariant in §5.1.
- Repositories and search: integration tests on real SQLite (not the EF in-memory provider).
- ViewModels: tests for completion flow, completed sections, urgency refresh, move commands.
- No business logic in code-behind. Code-behind is limited to view-only concerns.
- Public types and non-obvious methods get XML doc comments; no comments that restate code.
- Every migration is reviewed and committed; the DB file is backed up before applying one.

### 11.1 Testing standard

Every phase is tested at these layers. Most coverage sits in the cheap layers; the
expensive ones stay small.

| Layer | Project | What it covers | When it runs |
|-------|---------|----------------|--------------|
| Unit | `Core.Tests` | Domain rules, services with fake repositories and clock | Every build, CI on both OSes |
| Database integration | `Infrastructure.Tests` | Real SQLite (in-memory connection) | Every build, CI on both OSes |
| ViewModel | `Presentation.Tests` | Commands, prompts, state, navigation, with fake dialogs | Every build, CI on both OSes |
| Headless interaction | `App.Desktop.Tests` | Real views on Avalonia's headless platform, driven by simulated keyboard and mouse input: every keyboard shortcut, focus on page open, every click path that bindings or code-behind handle (checkboxes, context menus, buttons, dialogs with Enter/Escape) | Every build, CI on both OSes |
| Snapshot baselines | `App.Desktop.Tests` | Approved images of each key screen and dialog in light and dark; a change fails the test until the new image is reviewed and approved | Every build, CI on both OSes |
| End-to-end smoke | `App.Desktop.SmokeTests` (Windows) | The real app on a real desktop through UI Automation (FlaUI), using stable `AutomationProperties.AutomationId`s; 5–10 core scenarios | Before each phase sign-off, on the Windows machine |
| Owner review | — | A short hands-on pass by the owner | End of each phase, before merge |

Rules:

- A new keyboard shortcut, gesture or dialog ships with a headless interaction test.
- A new or changed screen ships with an updated, reviewed snapshot baseline.
- Snapshot and interaction tests are deterministic: fixed clock and time zone, embedded
  Inter font, fixed window size, temp database.
- A bug found by hand gets a regression test at the lowest layer that can catch it.
- A phase is done when every layer above passes and the owner has signed off.

## 12. Owner decisions (13 Nov 2026)

1. **UI: Avalonia from the start.** The owner wants to learn it; cross-platform comes free.
2. **Priorities:** start with Critical/High/Medium/Low, stored as reorderable data so
   levels can be added and reordered later (§5).
3. **Urgency thresholds:** 3 days / 24 hours as defaults, configurable through two-level
   settings: global, overridable per project (§6.5).
4. **Parent urgency:** a row shows the most urgent of itself and its open sub-items (§6.3).
5. **Item types:** more to come; user-addable in App Settings.
6. **Build/test machines:** develop and test on Linux (Avalonia runs there); a Windows
   machine will be added to the T3 Code machine set for Windows testing, plus CI on both OSes.
7. **Testing standard:** the layered approach in §11.1 (headless interaction tests, snapshot
   baselines, a Windows end-to-end smoke suite, owner review) is the standard for every phase.

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
| 4 | FTS5 index maintenance unspecified | Accepted. Trigger-maintained index; Phase 4 uses a stable mapping rowid and joins hits back to `TodoItem` |
| 5 | DST rules untestable with only a fake clock | Accepted. Time zone passed explicitly to `FloatingTime`; fixed-zone tests |

### Round 3 (gpt-6-sol) → revision 4

All round-2 resolutions confirmed consistent with the rest of the plan.

| # | Finding | Decision |
|---|---------|----------|
| 1 | `UrgencyCalculator` had no time-zone input, contradicting §5.4 | Accepted. Time zone added to its signature |
| 2 | FTS triggers would not index items that existed before Phase 4 | Accepted. Phase 4 migration backfills mapping and FTS rows; test covers pre-existing rows |
| 3 | Phase 1 exit asked for *unit* tests of database behaviour | Accepted. Split into unit tests (domain) and SQLite integration tests (database) |
