# Stack migration

[Revision 6](PLAN.md) defines the product and the target architecture. The migration
ships Phases 0–3 behavior, including custom fields, with the React design in §8.
Search, Calendar and Tickets follow the roadmap. Keep the .NET implementation and
its five test projects available until WP24 removes them.

For each package, port the relevant tests first. Run them against the new boundary
and see them fail before porting or adding the implementation. Use the C# tests as
behavior specifications. Port UI intent and outcomes, and capture new baselines
for the React design. Add coverage where a new boundary introduces failure modes.
Legacy source paths are under `src/`. Unqualified filenames refer to files in the
legacy projects.

Run the root commands below for every WP, in addition to its acceptance commands.
The names used with `--project` are Vitest projects. WP1 establishes their naming
and the common runner. Enable each project as its first suite lands. Run browser
commands after `pnpm exec playwright install chromium` (provide Chromium OS
dependencies on Linux CI). Maintain the Windows and Linux CI gates as suites land.

```sh
pnpm exec vp check
pnpm run build
```

Legacy verification on Linux uses `. scripts/dev-env.sh` first. Use `dotnet test
--project <project-path>` for focused legacy runs and the Windows machine for
legacy UI Automation smoke.

## Order and parallel work

Start with WP1. WP2, WP3 and WP5 can proceed as their dependencies land. WP4
can run alongside WP3 after WP2. After WP5, startup (WP6) and services (WP7–WP10)
can proceed independently. After WP11, WP12–WP14 can run in parallel. After WP16,
workspace, settings and desktop work can overlap. Use the dependencies below for handoff and keep concurrent changes
to shared registration and test configuration additive. WP23 joins the tracks
before WP24.

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

## WP24 — Cut over and remove .NET

- **Goal** — Leave TypeScript as the single build and release path after sign-off.
- **Inputs** — Accepted WP23 evidence, legacy `src/`, five `tests/TaskTracker.*`
  projects, `TaskTracker.slnx`, `Directory.*.props`, `global.json`,
  `dotnet-tools.json`, and legacy scripts, CI and README.
- **Outputs** — Remove the .NET code, test projects, fixture generator and tooling.
  Retain the EF fixture files and provenance. Update CI and build instructions to
  use the TypeScript stack. The server continues to adopt and read legacy files.
- **Acceptance** — On clean environments without .NET, run
  `pnpm install --frozen-lockfile`, `pnpm exec playwright install chromium`,
  `pnpm exec vp check`, `pnpm run build` and
  `pnpm exec vp test run` on Windows and Linux. Run `pnpm run package:desktop`
  and `pnpm run test:desktop` on Windows against the final tree.
- **Dependencies** — WP23.
