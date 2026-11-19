# EF compatibility fixtures

All SQLite files contain only synthetic data. The WP6 generator used the legacy
`TaskTrackerDbContext` and Microsoft.Data.Sqlite provider bindings with fixed GUIDs,
dates and sample text. It vacuumed both files to remove transient SQLite records.
Each test opens a disposable copy.

| File                | EF migrations applied                                       |
| ------------------- | ----------------------------------------------------------- |
| `initial-create.db` | `20261113163313_InitialCreate`                              |
| `phase-3.db`        | Both migrations, including `20261114032356_AddCustomFields` |
| `legacy-final.db`   | All ten migrations through `20261118072606_AddTicketRank`   |

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
