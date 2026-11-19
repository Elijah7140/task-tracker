# EF compatibility fixtures

Both SQLite files contain only synthetic data. The WP6 generator used the legacy
`TaskTrackerDbContext` and Microsoft.Data.Sqlite provider bindings with fixed GUIDs,
dates and sample text. It vacuumed both files to remove transient SQLite records.
Each test opens a disposable copy.

| File                | EF migrations applied                                       |
| ------------------- | ----------------------------------------------------------- |
| `initial-create.db` | `20261113163313_InitialCreate`                              |
| `phase-3.db`        | Both migrations, including `20261114032356_AddCustomFields` |

The first fixture includes nested folders and items, completion timestamps, a
deletion batch, a renamed seed, an archived lookup, and settings encoded as
`P1D`, `PT3H` and `PT0.5S`. The Phase 3 fixture starts from a copy of the
earlier file and adds all five custom-value types, including an archived field
and an archived choice.

The generator was removed at cutover. [WP6 in the migration record](../../../../../docs/MIGRATION.md#wp6--ef-fixture-compatibility-and-startup)
records the original generation command.
