# EF compatibility fixtures

All SQLite files contain only synthetic data. The WP6 generator used the legacy
`TaskTrackerDbContext` and Microsoft.Data.Sqlite provider bindings with fixed GUIDs,
dates and sample text. It vacuumed both files to remove transient SQLite records.
Each test opens a disposable copy.

| File                   | EF migrations applied                                       |
| ---------------------- | ----------------------------------------------------------- |
| `initial-create.db`    | `20261113163313_InitialCreate`                              |
| `phase-3.db`           | Both migrations, including `20261114032356_AddCustomFields` |
| `legacy-final.db`      | All ten migrations through `20261118072606_AddTicketRank`   |
| `ef-03-…` to `ef-09-…` | Each intermediate history prefix (see below)                |

The first fixture includes nested folders and items, completion timestamps, a
deletion batch, a renamed seed, an archived lookup, and settings encoded as
`P1D`, `PT3H` and `PT0.5S`. The Phase 3 fixture starts from a copy of the
earlier file and adds all five custom-value types, including an archived field
and an archived choice.

The generator was removed at cutover. [WP6 in the migration record](../../../../../docs/MIGRATION.md#wp6--ef-fixture-compatibility-and-startup)
records the original generation command.

## Final legacy schema fixture

Generated in a temporary detached checkout of `legacy-final`
(`da980c0071fd3ca9516f775956841ea3cae4dcc5`) with .NET SDK 10.0.404 and the
tag's EF Core and SQLite provider packages (10.0.15). The tag does not contain the
WP6 generator, so the checkout recovered
`tests/TaskTracker.Infrastructure.Tests/Persistence/EfFixtureTests.cs` from
`a1b941f`. The temporary adaptation migrated to explicit EF targets: InitialCreate,
AddCustomFields, AddSavedSearches and finally the tag's latest schema. It used the
original synthetic seed routines and provider-bound inserts, with two additional
seed stages:

- After AddSavedSearches, insert a project-scoped search named “Completed in sample”
  with the old `status:completed` clause. The final EF migration rewrites it to
  `completed:completed`. The sample custom field keyed `status` becomes `status-2`.
- After AddTicketRank, add the sample link, number 7 on High, a remembered Queued
  status on the completed sample child and the open “Recurring sample ticket”.
  The ticket has rank 1.5, In progress status, a two-day repeat, a 30-minute reminder
  with delivery and snooze timestamps, and is the current item. IDs, dates and text
  are fixed. Vacuum the file and publish only `legacy-final.db`.

After adapting the generator in that checkout, run:

```sh
. scripts/dev-env.sh
TASKTRACKER_GENERATE_EF_FIXTURE=1 dotnet test --project tests/TaskTracker.Infrastructure.Tests --filter-method '*.GenerateEfFixtures'
```

The generator copies the result to `apps/server/test/fixtures/ef/`. The retained
file passed SQLite `integrity_check` and `foreign_key_check`. Its EF history contains
all ten IDs, and a read-only query verified FTS rows, the rewritten saved search
and the sample ticket. WP25 adds TypeScript adoption coverage using disposable copies.

SHA-256: `a340586e4fa7bd2e7bdf076855a3e8207f3868f97cb4dad29339ff0d4768df9d`.

## Intermediate EF schema fixtures

Each file holds the EF history prefix that ends with the named migration. Startup
tests adopt each one and apply only the pending Effect migrations.

| File                                         | Last EF migration applied                      |
| -------------------------------------------- | ---------------------------------------------- |
| `ef-03-add-item-search.db`                   | `20261114120000_AddItemSearch`                 |
| `ef-04-add-saved-searches.db`                | `20261115054310_AddSavedSearches`              |
| `ef-05-add-item-links.db`                    | `20261115121847_AddItemLinks`                  |
| `ef-06-add-recurrence.db`                    | `20261117211849_AddRecurrence`                 |
| `ef-07-add-reminders.db`                     | `20261117220848_AddReminders`                  |
| `ef-08-index-today-completions.db`           | `20261118033043_IndexTodayCompletions`         |
| `ef-09-add-statuses-and-priority-numbers.db` | `20261118045951_AddStatusesAndPriorityNumbers` |

Generated on 19 Nov 2026 in a temporary detached worktree of `legacy-final`
(`da980c0071fd3ca9516f775956841ea3cae4dcc5`) with .NET SDK 10.0.404 and the tag's
EF Core and SQLite provider packages. The worktree recovered
`tests/TaskTracker.Infrastructure.Tests/Persistence/EfFixtureTests.cs` from
`a1b941f` and adapted it as follows:

- Seed the WP6 InitialCreate data, then migrate explicitly to AddCustomFields and add
  the WP6 custom fields and values. This equals `phase-3.db`.
- Copy the previous file and call `IMigrator.MigrateAsync` with the next target, in
  the order above. After AddSavedSearches, insert the project-scoped saved search
  “Completed in sample” (`019A0000-0000-7000-8000-000000005EA1`) with the old
  `status:completed` clause. Later stages inherit it, and AddStatusesAndPriorityNumbers
  rewrites it to `completed:completed`.
- Vacuum each stage, clear the connection pools and copy the files to the directory
  in `TASKTRACKER_EF_FIXTURE_OUT`.

Run from the worktree root:

```sh
. scripts/dev-env.sh
TASKTRACKER_EF_FIXTURE_OUT=<output directory> dotnet test --project tests/TaskTracker.Infrastructure.Tests --filter-method '*.GenerateEfFixtures'
```

Every file passed SQLite `integrity_check` and `foreign_key_check`, and its EF history
holds exactly its prefix. The temporary worktree was removed afterwards.

| File                                         | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `ef-03-add-item-search.db`                   | `59d2f233090a1e1e1588f0b9f876563ff0294e4610373be82207916971abb85b` |
| `ef-04-add-saved-searches.db`                | `09546c8336b2264cfeee09256e8f24cc47d722454244e1f3642965466bac115e` |
| `ef-05-add-item-links.db`                    | `5f7c6197c315fdb02b4864a7a620eecce271d3e4ce8ce38774d636547bbc7bf3` |
| `ef-06-add-recurrence.db`                    | `d83b3b2d51d80a093038f1345ea34ff5ca1a66528b4f05f317141405283a078d` |
| `ef-07-add-reminders.db`                     | `c34904a75dedebe84d8d33f466a0cd421cb650ae50a6594b094f45895672761f` |
| `ef-08-index-today-completions.db`           | `abf5870c75dcab909811e86cee975c48eb581b5612ffdae2d81c079d577a4a51` |
| `ef-09-add-statuses-and-priority-numbers.db` | `c5b0596a6c5c8ea51b559b452fb70f103aab8e0750af5dd84e4e82ffbdb62e64` |
