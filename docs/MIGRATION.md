# Stack migration

**Status:** WP1–WP24 complete. [The project plan](PLAN.md) defines the product and
architecture. WP25 onward ports the additional features frozen at `legacy-final`.

The work packages below record the migration plan and its acceptance gates.
WP1–WP24 legacy paths and commands refer to the pre-cutover tree at `0a84e9d`.
WP25 onward cites `legacy-final` paths from that tree’s root unless a different
revision is named. Browse a path with `git show legacy-final:<path>`.

The migration used C# tests as behavior specifications. Each package called for
porting the relevant tests before implementation, retaining UI intent and
outcomes, and capturing new baselines for the React design. The packages used
these shared build and static checks in addition to their acceptance commands:

```sh
pnpm run build
pnpm exec vp check --deny-warnings
```

See the [README](../README.md) for current build and smoke commands.

## Order and parallel work

Start with WP1. WP2, WP3 and WP5 can proceed as their dependencies land. WP4
can run alongside WP3 after WP2. After WP5, startup (WP6) and services (WP7–WP10)
can proceed independently. After WP11, WP12–WP14 can run in parallel. After WP16,
workspace, settings and desktop work can overlap. Use the dependencies below for handoff and keep concurrent changes
to shared registration and test configuration additive. WP23 joins the tracks
before WP24.

### Legacy feature port

Start application work with WP25. WP41 can run alongside it. After WP26 establishes
transaction history, use these parallel tracks as the stated dependencies land:

| Track | Packages |
| --- | --- |
| Lookups and settings | WP27 and WP28 in parallel, then WP52 after WP28 |
| Search and saved searches | WP29 → WP30 → WP31 |
| Workspace and Trash | WP34 and WP35 in parallel. WP46 follows WP34 and the lookups |
| Calendar and work views | WP32 → WP33. WP43 follows WP33 and WP38, then WP44 and WP45 can run in parallel |
| Editor and reminders | WP36 can start after WP25. WP37 joins search with the editor, then WP38 → WP39 → WP40 |
| Desktop and release | WP41 in parallel with schema work. WP42 follows WP40 and WP41. WP47 joins native tray and item surfaces |
| Transfer and shell | WP48 → WP49, then WP50 joins the routes and menus |
| Sign-off | WP51 audits integrated undo, then WP53 joins the audit and cleanup |

Coordinate overlapping edits to lookup settings, the item editor, navigation and
RPC registration. Add contracts and registrations in small changes as each package
lands. Each UI package owns its input tests and reviewed baselines (§11.1).

## WP1 — Workspace and checks

- **Goal** — Stand up the toolchain and CI with the legacy build still available.
- **Inputs** — `TaskTracker.slnx`, `global.json`, `Directory.Build.props`,
  `Directory.Packages.props`, `.github/workflows/`, and the five legacy test projects.
- **Outputs** — pnpm workspace, shared version catalog, Node 26 and pnpm 12 pins,
  lockfile, strict TypeScript and Vite+ configuration, package boundaries, build
  script, root `pnpm dev` to run the app, and Windows/Linux CI. Keep the existing
  .NET CI job until WP24. Reserve Vitest projects `core`, `server-db`,
  `server-rpc`, `web-unit` and `web-browser`. Align Vitest and its adapters with
  the Vite+ runner. Prove the runner with a small Effect test in `core`. Add the
  browser installer CLI to root dev dependencies. Configure CI to upload differing
  screenshots as artifacts when browser suites land (§11.1). Confirm zero-warning
  flags with `vp check --help` and `vp lint --help`, and update AGENTS.md.
- **Acceptance** — `pnpm install --frozen-lockfile`, `pnpm dev` and
  `pnpm exec vp test run --project core` work on Windows and Linux. Pin Electron
  and verify `node:sqlite` with FTS5 and check Temporal using `process.execPath`
  from Electron main with `ELECTRON_RUN_AS_NODE=1`. Use `temporal-polyfill` in
  Core if that runtime lacks Temporal.
- **Dependencies** — None.

## WP2 — Hierarchy and completion

- **Goal** — Port tree invariants, item/folder order, deletion batch rules and
  bottom-up completion decisions.
- **Inputs** — `TaskTracker.Core/{Items,Projects,Completion}/` and the
  `ItemTreeTests`, `FolderTreeTests` and `CompletionServiceTests` in
  `tests/TaskTracker.Core.Tests/`. Read the delete, restore and move cases in
  `tests/TaskTracker.Infrastructure.Tests/Persistence/`.
- **Outputs** — Pure models and tree operations in `packages/core`, including
  finished-branch classification, blocked and confirmed completion, and tests
  covering §5.1, §6.1 and §6.2.
- **Acceptance** — `pnpm exec vp test run --project core` passes.
- **Dependencies** — WP1.

## WP3 — Lookup and custom-field rules

- **Goal** — Port the pure lookup and custom-field rules.
- **Inputs** — `TaskTracker.Core/{Lookups,Fields}/`, matching tests under
  `tests/TaskTracker.Core.Tests/`, and the validation scenarios in
  `FieldServiceTests.cs` and `ItemServiceTests.cs`.
- **Outputs** — Lookup rank and archive rules, stable seeds, field definitions,
  choices and typed value validation. Cover stable keys, visible-name and label
  uniqueness, archived values, scope, and partial edits. The server later enforces
  concurrent writes through the transaction boundary.
- **Acceptance** — `pnpm exec vp test run --project core` passes.
- **Dependencies** — WP1.

## WP4 — Floating time, urgency and settings

- **Goal** — Port time and settings rules and compute urgency over the item tree.
- **Inputs** — `TaskTracker.Core/{Time,Urgency,Settings}/` and matching tests under
  `tests/TaskTracker.Core.Tests/`, plus urgency cases in `ItemServiceTests.cs`.
- **Outputs** — Temporal conversion with explicit zones, typed setting definitions
  and codecs, effective values and threshold checks, and descendant urgency
  attribution. Port `FloatingTimeTests` exactly. Use `getTimeZoneTransition` for
  the DST gap boundary and 23:59:59.9999999 for date-only end of day (§5.4).
  Read and write .NET `XmlConvert` durations and test `P1D`, `PT3H` and
  `PT0.5S` (§6.5).
- **Acceptance** — `pnpm exec vp test run --project core` passes.
- **Dependencies** — WP2.

## WP5 — SQLite layer and fresh schema

- **Goal** — Bootstrap equivalent SQLite on a fresh installation.
- **Inputs** — `TaskTracker.Infrastructure/Persistence/{Migrations,Configurations}/`,
  `TaskTrackerDbContextTests.cs`, `SqliteTestStore.cs`, and
  `ItemFieldValueConstraintTests.cs`.
- **Outputs** — Small project-owned `node:sqlite` adapter (§5.2) with a single
  connection, exclusive transaction access via `effect/Semaphore` and
  `PRAGMA busy_timeout = 5000`. Use `effect/sql/SqlSchema` row codecs, bound SQL
  and shared active-row filters. Reproduce both legacy schema stages and seeds
  with Effect migrations. Test replay, foreign keys and storage codecs. Interleave
  two operations and assert neither sees the other's uncommitted writes.
- **Acceptance** — `pnpm exec vp test run --project server-db` passes on Node 26
  and under Electron's embedded Node (`ELECTRON_RUN_AS_NODE=1`, the production
  runtime). Add a root script for the second run and a CI step that calls it.
- **Dependencies** — WP1, plus WP3 if needed for seeds.

## WP6 — EF fixture compatibility and startup

- **Goal** — Open existing files in place safely and prove the Effect migration
  handoff.
- **Inputs** — `DatabaseInitializer.cs`, `CompositionRoot.cs`, both EF migration
  classes and the model snapshot, `DatabaseInitializerTests.cs` and
  `CustomFieldMigrationTests.cs`.
- **Outputs** — Path selection, startup validation, adoption, online backup and
  retention from §5.2. Generate and retain two sanitized file fixtures using the
  real EF migrations and provider writes. Include settings rows with `P1D`, `PT3H`
  and `PT0.5S`. Store both files and their provenance under
  `apps/server/test/fixtures/ef/`.
  Cover fresh, v1, and Phase 3 files, unsupported or mismatched schema, backup
  failure and WAL data, failed-migration rollback, and restart. Assert uppercase IDs
  with hexadecimal letters, untouched EF history, and no duplicate seeds or data
  rewrites. Confirm schema parity via SQLite metadata and constraint tests.
- **Acceptance** — Generate fixtures with
  `dotnet test --project tests/TaskTracker.Infrastructure.Tests --filter FullyQualifiedName~GenerateEfFixtures`.
  Run the full legacy infrastructure suite for verification.
  `pnpm exec vp test run --project server-db` passes using only the retained
  fixtures at test time.
- **Dependencies** — WP5.

## WP7 — Projects, folders and lookups

- **Goal** — Port the first server services with one transaction per write.
- **Inputs** — `ProjectService.cs`, `FolderService.cs`, `LookupService.cs`,
  corresponding `Ef*Repository.cs` files, and
  `{ProjectService,FolderService,LookupService,ProjectWorkspaceSnapshot}Tests.cs`.
- **Outputs** — Project summaries, folder/workspace snapshots, create/rename/move/
  reorder, scoped batch deletion and restore (including descendants), plus type and
  priority management. Add the effective-settings reads needed by summaries and
  item operations, leaving settings writes to WP9. Cover rollback, restore order
  and archived values in real SQLite.
- **Acceptance** — `pnpm exec vp test run --project server-db` passes.
- **Dependencies** — WP3, WP4, WP5.

## WP8 — Items and transactional completion

- **Goal** — Port the item service and repository and prove tree writes are atomic.
- **Inputs** — `ItemService.cs`, `EfItemRepository.cs` and the non-field cases in
  `ItemServiceTests.cs`.
- **Outputs** — Area projections, item editing, completion previews and blocked
  results, sibling order, moves, indent/outdent and delete/restore. Include moves
  with deleted descendants and ancestor reconciliation. Verify writes and rollback
  via fresh reads.
- **Acceptance** — `pnpm exec vp test run --project server-db` passes.
- **Dependencies** — WP7.

## WP9 — Settings persistence and reconciliation

- **Goal** — Port global defaults, overrides and transactional reconciliation.
- **Inputs** — `SettingsService.cs`, `ProjectCompletionReconciler.cs`,
  `EfSettingsStore.cs` and `SettingsServiceTests.cs`.
- **Outputs** — Typed reads/writes, source attribution, constraint checks against
  affected effective values, preview and revalidation, and atomic setting updates
  with completion changes. Cancel leaves data intact.
- **Acceptance** — `pnpm exec vp test run --project server-db` passes.
- **Dependencies** — WP8.

## WP10 — Custom-field persistence and item edits

- **Goal** — Port field and choice management and atomic metadata edits.
- **Inputs** — `FieldService.cs`, `FieldWriteGate.cs`, `EfFieldRepository.cs`,
  `FieldServiceTests.cs`, `FieldWriteGateTests.cs` and the custom-field cases in
  `ItemServiceTests.cs`.
- **Outputs** — Field and choice scope, ordering, archive/restore and lookup.
  Save built-in and custom values in the same transaction. Cover concurrent
  definition/value writes, unchanged omitted values, and clear on blank/null.
- **Acceptance** — `pnpm exec vp test run --project server-db` passes.
- **Dependencies** — WP8.

## WP11 — Contracts and local RPC transport

- **Goal** — Define and validate the wire surface for the shipped operations.
- **Inputs** — Public service operations, `AreaSnapshot.cs`,
  `ProjectWorkspaceSnapshot.cs`, `EffectiveSettings.cs`,
  `CompletionResult.cs`, `ReconciliationPreview.cs` and their tests.
- **Outputs** — Shared Effect Schema wire formats and RPC group registration in
  `packages/contracts`. Carry dates and times as ISO strings and normalize GUIDs
  to uppercase on decode. Use `RpcGroup`, `RpcServer`, `RpcClient` and
  `RpcSerialization` from `effect/rpc`. Start the loopback WebSocket/HTTP service
  with readiness, a per-launch credential and origin checks. Provide the web RPC
  client binding, expose the server's IANA time zone and test schema round trips
  and denied requests.
- **Acceptance** — `pnpm exec vp test run --project server-rpc` passes.
- **Dependencies** — WP6.

In WP12–WP15, add each group's payloads, projections, typed failures and thin
handlers. Exercise them through RPC against real SQLite. Each group passes
`pnpm exec vp test run --project server-db --project server-rpc`.

## WP12 — Project, folder and workspace RPC

- **Inputs** — WP7 and legacy navigation tests.
- **Outputs** — Project, folder and workspace handlers. Cover navigation, hierarchy,
  and scoped deletion and restore.
- **Dependencies** — WP7, WP11.

## WP13 — Item and completion RPC

- **Inputs** — WP8 and legacy edit and completion tests.
- **Outputs** — Item and completion handlers. Cover moves, timestamps, deletion
  batches, failed writes and stale completion confirmations.
- **Dependencies** — WP8, WP11.

## WP14 — Settings and lookup RPC

- **Inputs** — WP7, WP9 and legacy settings confirmation tests.
- **Outputs** — Settings and lookup handlers. Cover overrides, stale reconciliation
  confirmations, archived values and lookup references.
- **Dependencies** — WP9, WP11.

## WP15 — Custom-field RPC and EF fixture round trips

- **Inputs** — WP10 and the retained EF fixtures.
- **Outputs** — Custom-field, choice and item metadata handlers. Open and write both
  fixtures through RPC, then close and reopen them. Verify settings, archived
  values, all five value types, lookup references, timestamps, hierarchy,
  completion and deletion batches.
- **Dependencies** — WP10, WP12, WP13, WP14.

## WP16 — Web shell and home

- **Goal** — Establish the React renderer and project home.
- **Inputs** — `HomeViewModel.cs`, `MainWindowViewModel.cs`, `HomeView.axaml`,
  matching presentation and desktop tests, and §8.
- **Outputs** — TanStack routes, Tailwind theme and Inter, Base UI primitives,
  Zustand interaction state and Effect atom RPC queries. Project cards,
  project navigation and create/rename/delete interactions. Own the shared
  confirmation dialog for project, workspace and settings flows. Add mount and
  input tests and reviewed light/dark baselines.
- **Acceptance** — `pnpm exec vp test run --project web-unit --project web-browser`
  passes.
- **Dependencies** — WP12.

## WP17 — Workspace tree and navigation

- **Inputs** — `ProjectWorkspaceViewModel.cs`, `FolderTreeViewModel.cs`,
  `AreaItemsViewModel.cs`, `WorkspaceUrgencyRefresher.cs`,
  `ProjectWorkspaceView.axaml`, `ItemBranchView.axaml` and matching tests.
- **Outputs** — Sidebar, breadcrumbs, folder actions, item trees and collapsed
  completed sections. Format dates and times with `Intl` using the server's zone.
  Refresh urgency from RPC each minute. Add simulated-input tests and reviewed
  workspace baselines.
- **Acceptance** — `pnpm exec vp test run --project web-unit --project web-browser`
  passes.
- **Dependencies** — WP13, WP16.

## WP18 — Item actions and reorder

- **Inputs** — `AreaItemsViewModel.cs`, `ReorderPlan.cs`, `ItemService.cs` and
  matching tests.
- **Outputs** — Quick-add, completion prompts using WP16's dialog, item moves and
  drag/keyboard reorder. Add indent/outdent to the UI with Tab / Shift+Tab on a
  focused item row as in Notion, using the operations from legacy `ItemService`.
  Add simulated-input tests and reviewed dialog baselines.
- **Acceptance** — `pnpm exec vp test run --project web-unit --project web-browser`
  passes.
- **Dependencies** — WP17.

## WP19 — App and project settings

- **Goal** — Port settings and lookup list flows.
- **Inputs** — `{AppSettings,ProjectSettings,LookupList}ViewModel.cs`, their
  Avalonia views, and corresponding presentation and desktop tests.
- **Outputs** — Global and project settings with overrides and reset, reconciliation
  prompts using WP16's dialog, and lookup add/rename/reorder/archive/restore. Add input tests and
  reviewed settings and lookup baselines. Leave field-manager integration to WP21.
- **Acceptance** — `pnpm exec vp test run --project web-unit --project web-browser`
  passes.
- **Dependencies** — WP14, WP16.

## WP20 — Floating item editor

- **Goal** — Port the floating item editor and its built-in and custom inputs.
- **Inputs** — `ItemEditor{Coordinator,ViewModel}.cs`,
  `CustomFieldInputLoader.cs`, the five `*FieldInputViewModel.cs` files,
  `CustomFieldsView.axaml` and matching tests.
- **Outputs** — Floating editor with grouped metadata and sub-items, all five custom
  input types, and draft save/discard/cancel. Preserve typed edits across loading,
  cancellation and archive states. Add input tests and reviewed editor baselines.
- **Acceptance** — `pnpm exec vp test run --project web-unit --project web-browser`
  passes.
- **Dependencies** — WP15, WP18.

## WP21 — Field and choice management

- **Goal** — Port global and project field management.
- **Inputs** — `FieldManagerViewModel.cs`, `FieldChoicesViewModel.cs`,
  `FieldManagerView.axaml`, `FieldManagerViewModelTests.cs` and
  `FieldManagerViewTests.cs`.
- **Outputs** — Settings views for field creation, ordering, type changes,
  archive/restore, inherited fields and choice management. Cover validation errors
  and updated pickers after schema edits. Add input tests and reviewed manager
  baselines.
- **Acceptance** — `pnpm exec vp test run --project web-unit --project web-browser`
  passes.
- **Dependencies** — WP15, WP19.

## WP22 — Electron shell and packaging

- **Goal** — Start the local server and renderer from a self-contained desktop build.
- **Inputs** — `TaskTracker.App.Desktop/{Program,CompositionRoot}.cs` and
  `tests/TaskTracker.App.Desktop.SmokeTests/{SmokeSession,SmokeProjectTests}.cs`.
- **Outputs** — Electron main, isolated preload, native IPC and server resources.
  Launch the server with Electron's embedded Node (§4). Use
  `app.requestSingleInstanceLock()`. Handle readiness, shutdown and test path
  overrides. Show a startup-failure dialog for an unrecognized schema or backup
  failure. If the server crashes, show an error and offer restart. Package with
  electron-builder and test these paths in Playwright using temporary databases.
- **Acceptance** — `pnpm run package:desktop` and `pnpm run test:desktop` pass
  on Windows. Run the same commands on Linux for the development build.
- **Dependencies** — WP16.

## WP23 — UI acceptance and desktop smoke

- **Goal** — Close parity gaps across the browser and packaged app.
- **Inputs** — All presentation and desktop tests, especially
  `ScreenSnapshotTests.cs`, `Dialogs/AvaloniaDialogServiceTests.cs`, and
  `tests/TaskTracker.App.Desktop.SmokeTests/SmokeTests.cs`. Use §8 and §11.1 for
  the new visual and interaction standard.
- **Outputs** — Cover every ported shortcut, gesture and dialog with real input.
  Generate and review per-OS light/dark baselines on their own OS (§11.1),
  with representative 1080p and 1440p checks. Port the nine legacy workflows into packaged Windows smoke, exercising
  project/folder creation, items, settings, dialog cancel, and custom values across
  relaunch. Include one smoke using a disposable Phase 3 fixture. Record the owner's
  demo sign-off and keep the final parity evidence available for WP24.
- **Acceptance** — `pnpm exec vp test run` passes on Windows and Linux.
  `pnpm run package:desktop` and `pnpm run test:desktop` pass on Windows.
  Owner approves the changed baselines and signs off on feature and data parity.
- **Dependencies** — WP20, WP21, WP22.

## WP24 — Cut over and remove .NET (complete)

- **Goal** — Leave TypeScript as the single build and release path after sign-off.
- **Inputs** — Accepted WP23 evidence, legacy `src/`, five `tests/TaskTracker.*`
  projects, `TaskTracker.slnx`, `Directory.*.props`, `global.json`,
  `dotnet-tools.json`, and legacy scripts, CI and README.
- **Outputs** — Remove the .NET code, test projects, fixture generator and tooling.
  Retain the EF fixture files and provenance. Update CI and build instructions to
  use the TypeScript stack. The server continues to adopt and read legacy files.
- **Acceptance** — On Windows and Linux with the TypeScript toolchain, run
  `pnpm install --frozen-lockfile`, `pnpm exec playwright install chromium`,
  `pnpm run build`, `pnpm exec vp check --deny-warnings`,
  `pnpm exec vp test run` and `pnpm run test:server-db:electron`.
  Run `pnpm run package:desktop` and `pnpm run test:desktop` on both platforms.
  On headless Linux, run desktop smoke under Xvfb.
- **Dependencies** — WP23.

## WP25 — Schema and legacy database adoption

- **Goal** — Open databases from the final .NET release in place and give fresh TypeScript installations the equivalent SQLite schema.
- **Inputs** — `src/TaskTracker.Infrastructure/Persistence/{Migrations,Configurations,DatabaseInitializer.cs,TaskTrackerDbContext.cs}`,
  `tests/TaskTracker.Infrastructure.Tests/Persistence/{TaskTrackerDbContextTests,DatabaseInitializerTests,StatusMigrationTests,TicketRankMigrationTests}.cs`,
  `tests/TaskTracker.Infrastructure.Tests/{SavedSearches/SavedSearchMigrationTests,Reminders/ReminderMigrationTests,Persistence/RecurrenceMigrationTests}.cs`,
  and [the retained final EF fixture and its provenance](../apps/server/test/fixtures/ef/README.md).
  The diff from `fef4e03` to `legacy-final` contains 16 migration-directory changes: eight migrations, seven generated designers and one updated model snapshot.
  No new checked-in database fixture files were present at the tag.

  | EF migration ID | Schema or data change |
  | --- | --- |
  | `20261114120000_AddItemSearch` | Stable item-to-rowid mapping, FTS5, maintenance triggers, backfill and reserved field keys |
  | `20261115054310_AddSavedSearches` | Saved-search scopes and query text, reserved syntax keywords |
  | `20261115121847_AddItemLinks` | Link table and cascading ownership, search key and scoped query rewrites |
  | `20261117211849_AddRecurrence` | Rule and series fields, recurrence search key and scoped rewrites |
  | `20261117220848_AddReminders` | Reminder choice, delivery and snooze fields, reminder search key and scoped rewrites |
  | `20261118033043_IndexTodayCompletions` | Completion timestamp index |
  | `20261118045951_AddStatusesAndPriorityNumbers` | Status seeds, completion and reopen constraints, numbered priorities, saved-query conversion |
  | `20261118072606_AddTicketRank` | Independent ticket ordering |

- **Outputs** — Effect migrations for fresh files and supported intermediate schemas. Match each validated EF history prefix to its Effect equivalents and apply only pending migrations. Preserve the EF history, data, lookup IDs, FTS mapping and triggers, saved-query meanings, and storage codecs. Keep online backup, retention and atomic adoption from §5.2. Use disposable copies of the generated `legacy-final.db` in integration tests. Share schema and codecs with the remaining packages.
- **Acceptance** — Node and Electron SQLite suites compare fresh and adopted schemas, test the final fixture and earlier EF and Effect versions, and verify FTS trigger and status constraint behavior. Check migration rewrites, writes through a fresh connection, WAL-aware backup and recovery, idempotent reopen and failure rollback. Recheck fixture integrity and hash after testing.
- **Dependencies** — WP24.

## WP26 — Undo and redo transaction history

- **Goal** — Provide session history for existing project, folder and item writes, with a shared way for later operations to record steps.
- **Inputs** — `src/TaskTracker.Core/Undo/`, `src/TaskTracker.Infrastructure/Persistence/Undo*.cs`, `src/TaskTracker.Presentation/ViewModels/UndoCoordinator.cs`, and `tests/TaskTracker.Infrastructure.Tests/Persistence/Undo{Recording,Refusal}Tests.cs`.
- **Outputs** — Server undo/redo RPC, a 50-step history, atomic replay with stale-row refusal, and commit-time recording. Add action labels, Edit commands, outcome messages and keyboard shortcuts. Preserve native text editing and the dirty-editor/settings guard. Document how each later package records its writes.
- **Acceptance** — SQLite and RPC tests cover cascades, failed and interrupted writes, stale and purged rows, concurrency, redo invalidation and restart. Browser input covers shortcuts, dirty drafts, focus and disabled actions.
- **Dependencies** — WP25.

## WP27 — Workflow statuses

- **Goal** — Add editable statuses and synchronize them with item completion.
- **Inputs** — `src/TaskTracker.Core/Lookups/{StatusLevel,LookupService.Statuses}.cs`, `src/TaskTracker.Core/Items/{StatusChange,ItemService.Lookups}.cs`, and `tests/TaskTracker.Infrastructure.Tests/Persistence/ItemStatusTests.cs`.
- **Outputs** — Open and Done lookup management, §6.1 completion and reopen behavior, editor selection, reusable row menu and status chip. Preserve the previous open status and the last active Done status. Record changes in undo history.
- **Acceptance** — Core, real SQLite and RPC cover completion cascades, refusals, archive and reopen. Browser input and baselines cover settings, editor and checked menus. Later screen packages use the shared status action.
- **Dependencies** — WP26.

## WP28 — Numbered priority levels

- **Goal** — Add editable priority numbers independent of rank.
- **Inputs** — `src/TaskTracker.Core/Lookups/{PriorityLevel,LookupService}.cs`, `src/TaskTracker.Presentation/ViewModels/LookupListViewModel.cs`, and `tests/TaskTracker.Core.Tests/Lookups/PriorityLevelTests.cs`.
- **Outputs** — Number-only and named levels, settings number edits, display labels and shared Set priority menu. Reserve archived lookup names and keep archive-specific errors. Record list and item changes in history.
- **Acceptance** — Real SQLite and browser tests cover rank 1, 7, 2, number uniqueness, archived names and accessible submenu checkmarks. Review settings and row menu baselines.
- **Dependencies** — WP26.

## WP29 — Scoped search and filter builder

- **Goal** — Search active items across all projects, one project or an area.
- **Inputs** — `src/TaskTracker.Core/Search/`, `src/TaskTracker.Infrastructure/Persistence/{SearchSqlBuilder,SqlItemSearch,SqliteTextFunctions}.cs`, `src/TaskTracker.App.Desktop/Views/SearchView.axaml`, and `tests/TaskTracker.Infrastructure.Tests/Persistence/SqlItemSearchTests.cs`.
- **Outputs** — Typed field registry, bounded parameterized SQLite and FTS5 query, typed RPC and search page. Include custom fields, status, completion and priority rank, plus the link field. Support result activation, scope changes, Back/Escape and draft guards.
- **Acceptance** — Real SQLite covers prefix terms, Unicode equality, operator/missing-value rules, sorting, limits and scope. Browser input covers Ctrl+F, filters, open, pending navigation and error states. Review search baselines.
- **Dependencies** — WP27, WP28.

## WP30 — Text query syntax

- **Goal** — Add the query box and bind its syntax to the typed search model.
- **Inputs** — `src/TaskTracker.Core/Search/Syntax/`, `src/TaskTracker.Presentation/ViewModels/SearchViewModel.QueryText.cs`, and `tests/TaskTracker.Core.Tests/Search/Syntax/`.
- **Outputs** — Scanner, binder, formatter, stable references and syntax help. Handle quotes, operators, presence tests, relative dates with Clock and zone, numbers and priorities, and errors with locations. Keep the filter builder synchronized and provide the parser extensions used by recurrence and reminders.
- **Acceptance** — Port parser and formatting examples, including culture and round-trip cases, and prove invalid input does not issue a new search. Simulate keyboard input and review query/help/error baselines.
- **Dependencies** — WP29.

## WP31 — Saved searches

- **Goal** — Save and rerun scoped search definitions.
- **Inputs** — `src/TaskTracker.Core/SavedSearches/`, `src/TaskTracker.Presentation/ViewModels/SearchViewModel.SavedSearches.cs`, and `tests/TaskTracker.Infrastructure.Tests/SavedSearches/`.
- **Outputs** — Persist stable query text and scope. Provide save/overwrite, open, rename, reorder and delete, and the Home list. Preserve behavior for stale fields and deleted scopes, and record mutations in undo history.
- **Acceptance** — Real SQLite and browser input cover overwrite, stale choices, reopen, order and keyboard access. Review Home and saved-search baselines.
- **Dependencies** — WP30.

## WP32 — Calendar month and week

- **Goal** — Show deadlines and scheduled blocks with navigation to their items.
- **Inputs** — `src/TaskTracker.Core/Calendar/`, `src/TaskTracker.App.Desktop/Views/CalendarView.axaml`, and `tests/TaskTracker.App.Desktop.Tests/Views/CalendarViewTests.cs`, including the fixes in `565c0f9`.
- **Outputs** — Scoped calendar query and RPC, month overflow, week all-day and timed layout, filters, period controls, contextual urgency and guarded entry activation.
- **Acceptance** — Database tests cover scope and range boundaries. Browser tests and baselines cover both views, narrow layouts, touching and overlapping entries, midnight, short blocks, keyboard navigation and Back/Escape.
- **Dependencies** — WP27, WP28.

## WP33 — Calendar rescheduling

- **Goal** — Reschedule via pointer and keyboard with the same server rules.
- **Inputs** — `src/TaskTracker.Core/Calendar/CalendarRescheduleService.cs`, `src/TaskTracker.App.Desktop/Views/CalendarDragController.cs`, and `tests/TaskTracker.App.Desktop.Tests/Views/CalendarDragTests.cs`.
- **Outputs** — Month and week drop targets, time snapping, ghost feedback, queued key moves, focus recovery and undo. Preserve block duration and validate the latest entry when applying a move.
- **Acceptance** — SQLite and browser tests cover range and stale-write rules, no-op and cancelled drops, day and time-grid moves, focus and held keys. Review drag baselines.
- **Dependencies** — WP32.

## WP34 — Workspace item drag and drop

- **Goal** — Move tree items with a consistent pointer and keyboard model.
- **Inputs** — `src/TaskTracker.App.Desktop/Views/ItemDragController.cs`, `src/TaskTracker.Core/Items/ItemService.cs`, and `tests/TaskTracker.App.Desktop.Tests/Views/ItemDragControllerTests.cs`.
- **Outputs** — Before/after, reparent, promote and folder drops with indicators. Reconcile both ancestor chains from the final tree in one transaction. Provide keyboard equivalents, preserve selection and drafts, and record one undo step.
- **Acceptance** — SQLite and browser tests cover cycles, completed rows, two-chain reconciliation, moved subtrees, cancellation and newer edits during save. Review drop feedback baselines.
- **Dependencies** — WP26.

## WP35 — Trash and restore

- **Goal** — Manage deleted batches and safely restore or permanently delete them.
- **Inputs** — `src/TaskTracker.Core/Trash/`, `src/TaskTracker.App.Desktop/Views/TrashView.axaml`, and `tests/TaskTracker.Infrastructure.Tests/Trash/TrashServiceTests.cs`.
- **Outputs** — Scoped Trash listing, restore, permanent delete, empty, blocked restore/purge rules, confirmation and refresh. Undo restores, using §7.8 rules for purged rows.
- **Acceptance** — SQLite covers nested batches, completion reconciliation, ownership cascades and rollback. Browser input covers Ctrl+Shift+T, default Cancel, busy states, empty and inline failures. Review Trash baselines.
- **Dependencies** — WP26.

## WP36 — Markdown description preview

- **Goal** — Render stored descriptions with the bounded preview in §7.10.
- **Inputs** — `src/TaskTracker.Presentation/Markdown/`, `src/TaskTracker.App.Desktop/Views/MarkdownControlBuilder.cs`, and `tests/TaskTracker.App.Desktop.Tests/Views/MarkdownEditorViewTests.cs`.
- **Outputs** — Edit and Preview tabs, readable code blocks and read-only task lists. Render unsupported or raw HTML as text and never load embedded images. Use a validated Electron link launcher for http, https and mailto.
- **Acceptance** — Tests cover limits, link policy, unsupported markup and dirty state. Review preview snapshots and simulate tab and link activation.
- **Dependencies** — WP25.

## WP37 — Item links

- **Goal** — Store ordered web or mail links with an item.
- **Inputs** — `src/TaskTracker.Core/Items/{ItemLink,ItemLinkEditor,LinkPolicy}.cs`, `src/TaskTracker.App.Desktop/Views/ItemLinksView.axaml`, and `tests/TaskTracker.Infrastructure.Tests/Persistence/ItemLinkTests.cs`.
- **Outputs** — Link draft controls and a transactional item save with stable link IDs, reorder, validation, open and undo. Integrate the built-in link filter. Preserve links on soft delete and remove through the permanent-delete cascade.
- **Acceptance** — SQLite and browser tests cover draft rollback, invalid URLs, keyboard edits, search and undo. Review links baseline.
- **Dependencies** — WP26, WP29, WP36.

## WP38 — Recurring items

- **Goal** — Generate the next occurrence through normal completion and repeat commands.
- **Inputs** — `src/TaskTracker.Core/Items/Recurrence/`, `src/TaskTracker.Core/Completion/RecurringCompletion.cs`, `src/TaskTracker.App.Desktop/Views/ItemRecurrenceView.axaml`, and `tests/TaskTracker.Infrastructure.Tests/Persistence/ItemRecurrenceTests.cs`.
- **Outputs** — Recurrence rules, Repeat editor, Skip and Stop, repeat badges and `has:repeats`. Copy links and values from the final draft, apply status reopen semantics, and create the successor and completion in one undoable transaction. Preserve the series receipt preventing duplicates.
- **Acceptance** — Core and SQLite cover all frequencies, stop conditions, date rules, copy, cascade, reopen and repeated commands. Browser input and reviewed baselines cover Repeat, status messages and badges.
- **Dependencies** — WP30, WP37.

## WP39 — Reminder rules and in-app panel

- **Goal** — Schedule, deliver, snooze and act on reminders through the app.
- **Inputs** — `src/TaskTracker.Core/Reminders/`, `src/TaskTracker.Presentation/Reminders/ReminderScheduler.cs`, `src/TaskTracker.App.Desktop/Views/RemindersView.axaml`, and `tests/TaskTracker.Infrastructure.Tests/Reminders/`.
- **Outputs** — Global and project defaults, item override, bounded Clock-driven delivery and rearming, grouped recent and silent old handling, panel and pending count, snooze undo and `has:reminder`. Keep automatic delivery bookkeeping outside history.
- **Acceptance** — Controlled-clock and SQLite tests cover DST, resume, edits, snooze and delivery failure. Browser input covers panel actions, Escape priority, settings and editor. Review baselines and run reminder smoke.
- **Dependencies** — WP38.

## WP40 — Native notifications and tray lifecycle

- **Goal** — Deliver native notifications and keep the desktop reachable while reminders run.
- **Inputs** — `src/TaskTracker.App.Desktop/{Reminders,SingleInstance}/`, and `tests/TaskTracker.App.Desktop.Tests/{Reminders,SingleInstance}/`.
- **Outputs** — Native notification adapter, activation routing, platform failure backoff, hide/minimize/quit behavior, scoped single-instance activation and resume/clock-change triggers. Reuse the checklist assets.
- **Acceptance** — Desktop tests cover same-path launch races, distinct paths, tray-unavailable fallback, hidden-window activation and cleanup. Verify notifications and tray behavior on Windows and Linux.
- **Dependencies** — WP39.

## WP41 — Installers and release publishing

- **Goal** — Publish the Electron application for the legacy release platforms.
- **Inputs** — `docs/PLAN.md` §7.13, `README.md`, `.github/workflows/{build,release}.yml`, and `scripts/{pack.ps1,pack.sh,publish-release.sh,verify-package-id.ps1}`.
- **Outputs** — Extend electron-builder for Windows x64 per-user NSIS, Linux x64 AppImage and macOS arm64. Tag-driven draft release and verified artifacts, safe retries and prereleases, shared app icon and install instructions. Keep CI on self-hosted runners as configured.
- **Acceptance** — Package and run smoke on supported targets. Verify release assembly before publication and confirm install/uninstall/reinstall leaves database and backups intact.
- **Dependencies** — WP24. This track can start alongside WP25.

## WP42 — Updates, About and start with system

- **Goal** — Bring installed-build controls to App Settings.
- **Inputs** — `src/TaskTracker.App.Desktop/Installation/`, `src/TaskTracker.Presentation/Installation/`, and `tests/TaskTracker.Presentation.Tests/ViewModels/AppUpdateViewModelTests.cs`.
- **Outputs** — Version, manual update check/download/restart, configurable update feed, pending state and draft guard. Add Windows and Linux startup registration and uninstall behavior per §7.13.
- **Acceptance** — Fakes cover missing feed, update errors, pending and uninstalled state, and idempotent startup writes. Review settings baselines and verify an installed Windows update and startup registration.
- **Dependencies** — WP40, WP41.

## WP43 — Push back one day

- **Goal** — Provide one local calendar-day reschedule action across item surfaces.
- **Inputs** — `src/TaskTracker.Core/Items/PushBackOneDay.cs`, `tests/TaskTracker.Core.Tests/Items/PushBackOneDayTests.cs`, and `docs/PLAN.md` §7.14.
- **Outputs** — Reusable action and Ctrl+Shift+P. Shift due and scheduled values together per §7.14, preserving calendar duration and refreshing urgency and reminders. Record one undo step.
- **Acceptance** — Test boundary dates, timed and undated rows, repeats and rollback. Browser input covers menus, shortcut, draft guard and refresh in workspace, Search and Calendar. Later views reuse the action.
- **Dependencies** — WP33, WP38.

## WP44 — Today view

- **Goal** — Show items completed today that are still complete.
- **Inputs** — `src/TaskTracker.Core/Today/`, `src/TaskTracker.Infrastructure/Persistence/EfTodayRepository.cs`, `src/TaskTracker.App.Desktop/Views/TodayView.axaml`, and `tests/TaskTracker.Infrastructure.Tests/Today/TodayServiceTests.cs`.
- **Outputs** — Zone-aware day and scope RPC, project/area grouping and ancestor context, collapse state, rollover and row actions. Restore the originating page on Back.
- **Acceptance** — SQL and Clock tests cover DST, reopened rows, context and midnight. Review Today baselines and simulate Ctrl+Shift+D, expansion, menus and open.
- **Dependencies** — WP27, WP28, WP43.

## WP45 — Tickets view

- **Goal** — Show open items with a ticket number in their manually maintained priority order.
- **Inputs** — `src/TaskTracker.Core/Tickets/`, `src/TaskTracker.App.Desktop/Views/{TicketsView.axaml,TicketDragController.cs}`, and `tests/TaskTracker.Infrastructure.Tests/Tickets/TicketServiceTests.cs`.
- **Outputs** — Optional project filter, no-priority first, independent ranks, drag and keyboard step, edge auto-scroll, row commands and undo. Preserve tree order and rank across filtered moves and between priority sections.
- **Acceptance** — SQLite and browser tests cover initial and archived levels, non-monotonic labels, filtered rank writes, undo refusal, repeated moves and deterministic auto-scroll. Capture reviewed Tickets baselines.
- **Dependencies** — WP43.

## WP46 — Priority-grouped workspace card grid

- **Goal** — Present top-level items as cards while keeping the nested item tree accessible.
- **Inputs** — `src/TaskTracker.App.Desktop/Views/{CardGridPanel.cs,ItemCardView.axaml}`, `src/TaskTracker.Presentation/ViewModels/{CardDropMapper,PriorityGroupBuilder}.cs`, and `tests/TaskTracker.Infrastructure.Tests/Persistence/ItemPriorityGroupMoveTests.cs`.
- **Outputs** — Configurable card columns, equal height per row, priority sections and completed cards. Preserve nested row actions. Cross-section drag and Alt+arrows update priority and tree order together with undo. Keep the floating editor.
- **Acceptance** — Test reading order, empty and archived headers, sub-item promotion and undo. Simulate card/header drops and keyboard moves. Review 1080p and 1440p layouts.
- **Dependencies** — WP27, WP28, WP34.

## WP47 — Current item and tray card

- **Goal** — Pin one item and surface it from a tray click.
- **Inputs** — `src/TaskTracker.Core/CurrentItem/`, `src/TaskTracker.App.Desktop/Tray/`, and `tests/TaskTracker.App.Desktop.Tests/Tray/`.
- **Outputs** — Global `currentItemId`, row choices and a card star, editor marker, surviving selection through trash restore, and a native tray popup. Include details, open-in-app, empty state, dismissal, screen clamping, and menu fallback.
- **Acceptance** — Test the persisted selection, deleting and restoring it, pinning from each surface, popup positioning and activation. Review tray/card baselines and verify shared checklist art.
- **Dependencies** — WP35, WP40, WP44, WP45, WP46.

## WP48 — JSON import and export

- **Goal** — Exchange complete active task data with version 1 legacy JSON.
- **Inputs** — `src/TaskTracker.Core/Transfer/{DataTransferService.cs,Json}`, `src/TaskTracker.Infrastructure/Persistence/SqliteDatabaseBackup.cs`, and `tests/TaskTracker.Infrastructure.Tests/Transfer/Json*Tests.cs`.
- **Outputs** — Full and project export, validation with paths, remapping including saved queries and lookup references, typed RPC and Electron file selection. Back up before a confirmed import, revalidate and commit once. Preserve recurrence, link, reminder and status semantics. Apply ticket rank assignment on import per §7.16.
- **Acceptance** — Round-trip frozen legacy examples on real SQLite, including collision, backup, concurrency and rollback cases. Simulate file selection, cancellation and confirmation with isolated paths.
- **Dependencies** — WP31, WP39, WP45.

## WP49 — CSV import and export

- **Goal** — Exchange spreadsheet rows and export the full result of the last search.
- **Inputs** — `src/TaskTracker.Core/Transfer/Csv/`, `src/TaskTracker.App.Desktop/Views/ImportPreviewView.axaml`, `tests/TaskTracker.Infrastructure.Tests/Transfer/Csv*Tests.cs`, and `tests/TaskTracker.Presentation.Tests/ViewModels/SearchResultsExportTests.cs`.
- **Outputs** — Project export and validated target-area import with preview, row errors, formula safety and backup. Support fixed and custom columns, priority reference, links and status. Export search results beyond the UI display cap. Reuse the file picker and transfer progress flow.
- **Acceptance** — SQLite and browser tests cover legacy column formats, quoted cells, Unicode, collisions, invalid rows, rollback, and success after confirmation. Review preview/menu baselines.
- **Dependencies** — WP48.

## WP50 — Title bar and menu navigation

- **Goal** — Integrate the final shell navigation at the frozen tag.
- **Inputs** — `src/TaskTracker.App.Desktop/Views/MainWindow.axaml`, `src/TaskTracker.Presentation/ViewModels/MainWindowViewModel.cs`, `tests/TaskTracker.App.Desktop.Tests/MainWindowTests.cs`, and commits `499999b`, `f8fb2ed`, `9b63b7f`, `0c8c24e`.
- **Outputs** — Single window title, drag region and native caption spacing, plus File, Edit, Project and View menus. Centralize return-page behavior, context-dependent commands and draft guards. Preserve notification and search/calendar/trash navigation.
- **Acceptance** — Simulate menu keyboard navigation and all return contexts. Check Windows caption controls and scaling for overlap, menu availability and selection, and review changed full-shell baselines.
- **Dependencies** — WP31, WP35, WP39, WP44, WP45, WP46, WP49.

## WP51 — Undo coverage audit

- **Goal** — Match the write coverage and refusal rules in §7.8 across the finished features.
- **Inputs** — `src/TaskTracker.Infrastructure/Persistence/{EfUndoableChange,UndoDependencyGuard,UndoHierarchyGuard,UndoLookupGuard,UndoSettingsGuard}.cs`,
  `tests/TaskTracker.Infrastructure.Tests/Persistence/*UndoTests.cs`, and commits `38f144f` and `2097319`.
- **Outputs** — Map each write operation to a history step or documented exclusion. Close settings, lookups, choices, saved searches, restore and feature replay gaps, including guards for overwritten data, new dependents and effective settings.
- **Acceptance** — Verify persisted before/after states, refusal atomicity and correct menu, refresh and draft handling on every integrated surface.
- **Dependencies** — WP42, WP47, WP50.

## WP52 — Settings and editor interaction cleanup

- **Goal** — Port the final field type, time picker and settings fixes.
- **Inputs** — `src/TaskTracker.App.Desktop/Views/{CommitOnChoiceComboBox,TimePickerPlaceholder}.cs`,
  `tests/TaskTracker.App.Desktop.Tests/Views/{FieldManagerViewTests,TimePickerPlaceholderTests}.cs`, and commits `a7beb1f` and `554616e`.
- **Outputs** — Browse field types without saving until commit. Handle Escape, pointer blur, wheel, keyboard and teardown as specified by the legacy tests. Use empty time placeholders in both 12-hour and 24-hour modes. Cover archived-name messages, override/reset isolation, discarded settings edits and failed reconciliation with invalid thresholds.
- **Acceptance** — Real browser input reproduces the legacy cleanup cases. Real SQLite confirms an invalid settings write after reconciliation approval persists nothing. Review changed settings and editor baselines.
- **Dependencies** — WP28.

## WP53 — Final feature and data parity

- **Goal** — Verify the integrated TypeScript port against the final legacy release.
- **Inputs** — `tests/TaskTracker.App.Desktop.SmokeTests/SmokeTests.cs`, `tests/TaskTracker.App.Desktop.Tests/Snapshots/`, `docs/PLAN.md`, and the [parity checklist](PARITY.md).
- **Outputs** — Update parity rows with evidence. Review Windows and Linux light/dark baselines and core interactions. Run packaged workflows including a disposable copy of the latest EF fixture, feature state after relaunch, native behavior, and backup recovery.
- **Acceptance** — Warning-free build and static gate, workspace tests, embedded SQLite, packaging and smoke pass on Windows and Linux. Verify macOS release packaging and record owner sign-off.
- **Dependencies** — WP51, WP52.
