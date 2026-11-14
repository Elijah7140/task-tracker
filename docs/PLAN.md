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
| `Description` | string? | Plain text v1; Markdown on roadmap |
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

- Items reorder among siblings by Alt+↑/↓ (`SortOrder`, renumbered among siblings on
  each move; sibling counts are small). Drag-and-drop is on the roadmap (§10).
- Moving a top-level item to another area **in the same project** moves its whole
  subtree (invariant 3). Moving between projects is out of scope for v1; if added later
  it must handle project-scoped custom fields.
- Sub-items cannot be moved to another area on their own. They can be re-parented
  within the same tree via indent/outdent (Phase 2 stretch).
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
column (`title`, `ticket`, `priority`, `type`, `due`, `scheduled`, `status`) or a
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

**Implementation** (Infrastructure): `SqlItemSearch` translates `ItemQuery` into LINQ —
built-in fields map to columns, custom fields to `EXISTS` subqueries on `ItemFieldValue`.
Free text uses an SQLite **FTS5** external-content table over title, description and
ticket number:

- Kept current by `AFTER INSERT/UPDATE/DELETE` triggers on `TodoItem`, created in the
  migration, so the index updates in the same transaction as the row.
- Soft-deleted rows stay in the index; search joins FTS hits back to `TodoItem`, so the
  normal deleted-row filter and the scope filters apply. Restore needs no index work.
- The migration that creates the index also runs FTS5's `rebuild` command, so items that
  existed before Phase 4 are searchable immediately.
- Tests cover pre-existing rows, insert, edit, soft delete, restore and hard delete.

All search code is tested against real SQLite.

**Later:** a text syntax (`type:error priority>=high due<2026-12-01 "deadlock"`) that
parses into an `ItemQuery`, and saved searches.

### 7.3 What v1 does to stay ready

- Built-in fields are ordinary typed columns with indexes (above).
- `TodoItem` has no catch-all "extra data" blob that search would have to unpick later.
- Adding the Phase 3 tables is an additive migration; no v1 table changes.

## 8. User interface (Avalonia)

### Screens

1. **Home** — project cards (name, open count, overdue count). New project button.
2. **Project workspace** — three panes:
   - **Left:** folder tree (project root at top). Right-click: new folder, rename, move, delete.
   - **Center:** the selected area's items.
     - Quick-add box at top (type a title, Enter).
     - Open items as an expandable tree, each row showing checkbox, type icon, title,
       ticket, priority, due/scheduled date, with (rolled-up) urgency background.
     - **Completed (n)** expander at the bottom, collapsed by default (§6.2).
   - **Right:** detail editor for the selected item (all fields, sub-item list).
   - Breadcrumb at top: `Home › Billing DB › dbo › Tables`.
3. **App Settings** — global auto-complete and urgency thresholds; manage item types and
   priority levels (add, rename, drag to reorder, archive).
4. **Project Settings** — per-project overrides (§6.5).

### Keyboard

Ctrl+N new item, Ctrl+Shift+N new sub-item, Space toggle complete, F2 rename,
Delete delete (with confirm), Alt+↑/↓ reorder, Ctrl+F search (Phase 4).

## 9. Delivery phases

Each phase ends with a working build, passing tests, and a short demo.

| Phase | Deliverable | Exit criteria |
|-------|-------------|---------------|
| **0. Foundation** | Solution, projects, `.editorconfig`, analyzers, central package versions, CI (GitHub Actions matrix: `windows-latest` + `ubuntu-latest`, build + test), README with build steps | Empty Avalonia window launches; all tests run |
| **1. Core + data** | Entities, hierarchy invariants, EF mappings, first migration, repositories, `CompletionService`, `UrgencyCalculator` (incl. roll-up), floating-time helper, two-level settings service, seed item types and priority levels, DB backup before migrating | Domain rules in §5.1, §5.4, §6.1, §6.3, §6.5 covered by unit tests; database behaviour (§5.2 constraints, §5.3 delete/restore and query filters, transactional moves) covered by SQLite integration tests |
| **2. Main UI** | Home, project workspace, folder tree, item list with sub-items, completed sections, detail editor, urgency colors, app and project settings, delete with confirm, keyboard shortcuts | R1–R15 usable end to end; ViewModel tests pass with no UI framework; every layer of the §11.1 testing standard passes |
| **3. Custom metadata** | §7.1 tables (additive migration), field manager (global + per-project), custom fields in item editor | Users can add a field of each type and fill it in |
| **4. Search** | §7.2 query model, FTS5, filter-builder UI, results across a project or all projects | Search by any built-in or custom field with the operator semantics in §7.2 |
| **5. Calendar** | Month/week view of deadlines and scheduled items; click-through to the item | See §10 |

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
- Trash view with restore (data model already supports it, §5.3).
- Reminders / OS notifications for approaching deadlines.
- Recurring items.
- Markdown descriptions; attachments/links.
- Saved searches and the text query syntax.
- Undo/redo for recent actions.
- Import/export (JSON, CSV).
- Packaged installers per OS (MSIX/Velopack on Windows, .app on macOS, AppImage on Linux).
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
| 4 | FTS5 index maintenance unspecified | Accepted. External-content table with triggers; soft-delete handled by joining back to `TodoItem` |
| 5 | DST rules untestable with only a fake clock | Accepted. Time zone passed explicitly to `FloatingTime`; fixed-zone tests |

### Round 3 (gpt-6-sol) → revision 4

All round-2 resolutions confirmed consistent with the rest of the plan.

| # | Finding | Decision |
|---|---------|----------|
| 1 | `UrgencyCalculator` had no time-zone input, contradicting §5.4 | Accepted. Time zone added to its signature |
| 2 | FTS triggers would not index items that existed before Phase 4 | Accepted. Migration runs FTS5 `rebuild`; test covers pre-existing rows |
| 3 | Phase 1 exit asked for *unit* tests of database behaviour | Accepted. Split into unit tests (domain) and SQLite integration tests (database) |
