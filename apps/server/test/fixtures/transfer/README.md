# JSON transfer fixtures

Synthetic data only. Generated for WP48 in a temporary detached `git worktree` of
`legacy-final` (`da980c0071fd3ca9516f775956841ea3cae4dcc5`) outside this checkout,
with .NET SDK 10.0.404 from `. scripts/dev-env.sh`. The worktree was removed
afterwards; the generator below was never committed to either tree.

| File                         | Written by      | Contents                                                                                                          |
| ---------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `legacy-source.db`           | legacy-final    | The in-memory test database after the legacy `TransferSeed` plus the extras below, saved with SQLite's backup API |
| `legacy-export-all.json`     | legacy-final    | `ExportJsonAsync(AllData)` of that database                                                                       |
| `legacy-export-billing.json` | legacy-final    | `ExportJsonAsync(SingleProject(Billing))`                                                                         |
| `legacy-numbers.json`        | legacy-final    | 6,010 doubles (bit pattern, System.Text.Json text): edge cases and seeded random values                           |
| `legacy-escapes.json`        | legacy-final    | Every BMP code point that `JavaScriptEncoder.UnsafeRelaxedJsonEscaping` escapes, as ranges, plus samples          |
| `ts-export-all.json`         | this repository | `legacy-export-all.json` imported into a fresh TypeScript database and exported again                             |
| `legacy-reimport-all.json`   | legacy-final    | `ts-export-all.json` imported into a fresh legacy database and exported again                                     |

The extras add Open and Done custom statuses with a remembered reopen status,
active and archived number-only priorities, weekly/yearly/monthly/daily repeats
including a completed occurrence with its successor, fractional floating times
and timestamps, reminder offset and None choices, two links, a project with
control, format, private-use, unassigned, astral and other awkward characters in
titles, twenty awkward numbers, project and global settings, and folder-scoped and
all-projects saved searches.

## How they are used

`apps/server/test/db/services/transfer/legacy-json-compatibility.test.ts`:

- adopts a disposable copy of `legacy-source.db` and checks that the TypeScript
  export is byte for byte equal to `legacy-export-all.json` and
  `legacy-export-billing.json` (only `exportedAtUtc` differs: legacy ticks versus
  Effect Clock milliseconds);
- formats every probed double and escapes every BMP code point like legacy-final;
- checks that today's TypeScript output still equals `ts-export-all.json` apart
  from GUIDs, and that legacy-final's re-import (`legacy-reimport-all.json`) lost
  nothing (GUIDs, global settings and renumbered sort orders aside).

The other transfer tests use `legacy-source.db` and `legacy-export-all.json` as the
port of the legacy `TransferSeed`.

## Regenerating

In the temporary legacy worktree, add `SaveTo` to `SqliteTestStore` and the
generator test below, then:

```sh
. scripts/dev-env.sh
WP48_FIXTURE_DIR=/tmp/wp48 dotnet test --project tests/TaskTracker.Infrastructure.Tests --filter-method '*.GenerateWp48Fixtures'
# copy the legacy-* files here, then in this repository:
WP48_WRITE_TS_EXPORT=1 pnpm exec vp test run --project server-db apps/server/test/db/services/transfer/legacy-json-compatibility.test.ts
# copy ts-export-all.json to /tmp/wp48, then in the legacy worktree:
WP48_FIXTURE_DIR=/tmp/wp48 dotnet test --project tests/TaskTracker.Infrastructure.Tests --filter-method '*.ImportWp48TypeScriptExports'
```

GUIDs come from `Guid.CreateVersion7()` and change on every run, so regenerate
all files together.

## SHA-256

| File                         | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `legacy-escapes.json`        | `c0ddf9c6d596d834161fd138482d70505c28893dc0642adf9495139b0216f251` |
| `legacy-export-all.json`     | `6ec02a3ad4ea8d38b936566183d732ae975aa664579109eba216ea53b9e06794` |
| `legacy-export-billing.json` | `1a657617294559cd9cc43855b3893db1f8e7aea58e478de81b4f5e37372ac45e` |
| `legacy-numbers.json`        | `9f9dbcdf97c8e4e659190e8bcdcb0b9d995cff496147553ea4362f6a91e4e780` |
| `legacy-reimport-all.json`   | `6c8751c6c343a3fcf17ce30d18bc57067a21a7ccafdb9009b7225f4e5aea3e23` |
| `legacy-source.db`           | `32e0fcfa593cf9d1fa6d16c19be6ce94a148e01af1b3bb62bd1f35cb4d8c9f6c` |
| `ts-export-all.json`         | `343f8ec5827de0e800e84362989e392b30846eace0d59d0b0452e7c5a601b95f` |

<details><summary>Temporary legacy changes</summary>

```diff
diff --git a/tests/TaskTracker.Infrastructure.Tests/Persistence/SqliteTestStore.cs b/tests/TaskTracker.Infrastructure.Tests/Persistence/SqliteTestStore.cs
index 62e3678..a7a6f5a 100644
--- a/tests/TaskTracker.Infrastructure.Tests/Persistence/SqliteTestStore.cs
+++ b/tests/TaskTracker.Infrastructure.Tests/Persistence/SqliteTestStore.cs
@@ -20,6 +20,13 @@ internal sealed class SqliteTestStore : IAsyncDisposable

     public FakeTimeProvider Clock { get; } = new(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));

+    public void SaveTo(string path)
+    {
+        using var file = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path, Pooling = false }.ToString());
+        file.Open();
+        connection.BackupDatabase(file);
+    }
+
     public async Task InitializeAsync()
     {
         await connection.OpenAsync();
```

```csharp
#pragma warning disable xUnit1051
using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Items.Recurrence;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Transfer;

namespace TaskTracker.Infrastructure.Tests.Transfer;

/// <summary>WP48 fixture generator (temporary, not part of legacy-final).</summary>
public sealed class Wp48FixtureGenerator
{
    private static string Output => Environment.GetEnvironmentVariable("WP48_FIXTURE_DIR")!;

    [Fact]
    public async Task GenerateWp48Fixtures()
    {
        Assert.SkipWhen(Output is null, "Set WP48_FIXTURE_DIR.");
        Directory.CreateDirectory(Output);
        await using var world = await TransferWorld.CreateAsync();
        var ids = await TransferSeed.PopulateAsync(world);
        await AddExtrasAsync(world, ids);

        var all = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());
        var billing = await world.Transfer.ExportJsonAsync(new TransferScope.SingleProject(ids.BillingId));
        await File.WriteAllTextAsync(Path.Combine(Output, "legacy-export-all.json"), all, new UTF8Encoding(false));
        await File.WriteAllTextAsync(Path.Combine(Output, "legacy-export-billing.json"), billing, new UTF8Encoding(false));
        world.Store.SaveTo(Path.Combine(Output, "legacy-source.db"));
        await File.WriteAllTextAsync(Path.Combine(Output, "legacy-escapes.json"), EscapeProbe(), new UTF8Encoding(false));
        await File.WriteAllTextAsync(Path.Combine(Output, "legacy-numbers.json"), NumberProbe(), new UTF8Encoding(false));
    }

    /// <summary>Imports each TypeScript export, reports issues and re-exports the imported data.</summary>
    [Fact]
    public async Task ImportWp48TypeScriptExports()
    {
        Assert.SkipWhen(Output is null, "Set WP48_FIXTURE_DIR.");
        foreach (var path in Directory.GetFiles(Output, "ts-export-*.json"))
        {
            await using var world = await TransferWorld.CreateAsync();
            var text = await File.ReadAllTextAsync(path);
            var result = await world.Transfer.ImportJsonAsync(text);
            Assert.True(result.Succeeded, string.Join("; ", result.Issues));
            var again = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());
            var name = Path.GetFileName(path).Replace("ts-export-", "legacy-reimport-");
            await File.WriteAllTextAsync(Path.Combine(Output, name), again, new UTF8Encoding(false));
        }
    }

    private static async Task AddExtrasAsync(TransferWorld world, SeedIds ids)
    {
        var clock = world.Store.Clock;
        clock.Advance(TimeSpan.FromTicks(1234567));
        await world.Lookups.AddStatusAsync("Verification", StatusKind.Open);
        await world.Lookups.AddStatusAsync("Shipped", StatusKind.Done);
        var statuses = await world.Lookups.StatusesAsync();
        var verification = statuses.Single(status => status.Name == "Verification");
        var shipped = statuses.Single(status => status.Name == "Shipped");
        var seven = await world.Lookups.AddPriorityLevelAsync(string.Empty, 7);
        var oldSeven = await world.Lookups.AddPriorityLevelAsync(string.Empty, 7 + 1);

        var lab = ids.HomeLabId;
        var review = await world.Items.CreateAsync(lab, null, null, "Review release");
        await world.Items.SetPriorityAsync(review.Id, seven.Id);
        await world.Items.SetStatusAsync(review.Id, verification.Id);
        await world.Items.SetStatusAsync(review.Id, shipped.Id);
        var testing = await world.Items.CreateAsync(lab, null, null, "Being verified");
        await world.Items.SetStatusAsync(testing.Id, verification.Id);
        await world.Items.SetPriorityAsync(testing.Id, oldSeven.Id);
        await world.Lookups.ArchivePriorityLevelAsync(oldSeven.Id);
        clock.Advance(TimeSpan.FromTicks(98765));

        await AddRepeatsAsync(world, lab);
        await AddRemindersAndLinksAsync(world, lab, ids);
        await AddUnicodeProjectAsync(world);
        await AddNumbersAsync(world, lab);
        await AddSettingsAndSearchesAsync(world, ids);
    }

    private static async Task AddRepeatsAsync(TransferWorld world, Guid projectId)
    {
        var weekly = new RecurrenceRule(RecurrenceFrequency.Weekly, 2,
            RecurrenceWeekdays.Monday | RecurrenceWeekdays.Thursday, EndKind: RecurrenceEndKind.AfterCount, Remaining: 4);
        var audit = await EditAsync(world, projectId, "Audit", new DateOnly(2026, 11, 16), null, null, null, weekly);
        await world.Items.SetCompletedAsync(projectId, null, audit.Id, true);
        var yearly = new RecurrenceRule(RecurrenceFrequency.Yearly, 1, null, 29, 2,
            RecurrenceAnchor.CompletionDate, RecurrenceEndKind.OnDate, new DateOnly(2030, 1, 1));
        await EditAsync(world, projectId, "Leap check", new DateOnly(2028, 2, 29), null, null, null, yearly);
        var monthly = new RecurrenceRule(RecurrenceFrequency.Monthly, 3, null, 0);
        var start = new DateTime(2026, 11, 30, 8, 15, 30, DateTimeKind.Unspecified).AddTicks(1234567);
        await EditAsync(world, projectId, "Month end", null, null, start, start.AddMinutes(45), monthly);
        var everyDay = new RecurrenceRule(RecurrenceFrequency.Weekly, 1, RecurrenceWeekdays.All);
        await EditAsync(world, projectId, "Every weekday", new DateOnly(2026, 11, 20), new TimeOnly(7, 5, 3).Add(TimeSpan.FromTicks(5000000)), null, null, everyDay);
        await EditAsync(world, projectId, "Daily", new DateOnly(2026, 11, 21), null, null, null, new RecurrenceRule(RecurrenceFrequency.Daily, 5));
    }

    private static async Task<TodoItem> EditAsync(TransferWorld world, Guid projectId, string title, DateOnly? due,
        TimeOnly? time, DateTime? start, DateTime? end, RecurrenceRule? rule)
    {
        var item = await world.Items.CreateAsync(projectId, null, null, title);
        var edit = new ItemEdit(title, null, null, null, null, due, time, start, end)
        {
            UpdateRecurrence = rule is not null,
            Recurrence = rule
        };
        await world.Items.EditAsync(item.Id, edit);
        world.Store.Clock.Advance(TimeSpan.FromTicks(31));
        return item;
    }

    private static async Task AddRemindersAndLinksAsync(TransferWorld world, Guid projectId, SeedIds ids)
    {
        var item = await world.Items.CreateAsync(projectId, null, null, "Call vendor");
        await world.Items.EditAsync(item.Id, new ItemEdit(item.Title, "Line one\r\nLine \"two\"\ttabbed", "TKT-9", null, null,
            new DateOnly(2026, 11, 25), new TimeOnly(16, 45), null, null)
        {
            UpdateReminder = true,
            ReminderMode = ReminderMode.Offset,
            ReminderOffsetMinutes = 15
        }, [], [new ItemLinkInput(null, "https://a.example/x?y=1&z=<2>", "Aye ü"),
            new ItemLinkInput(null, "mailto:team@example.com", null)]);
        var quiet = await world.Items.CreateAsync(projectId, null, null, "Quiet");
        await world.Items.EditAsync(quiet.Id, new ItemEdit(quiet.Title, null, "TKT-10", null, null,
            new DateOnly(2026, 11, 26), null, null, null)
        {
            UpdateReminder = true,
            ReminderMode = ReminderMode.None
        });
        world.Store.Clock.Advance(TimeSpan.FromTicks(7));
    }

    private static async Task AddUnicodeProjectAsync(TransferWorld world)
    {
        var project = await world.Projects.CreateAsync("Café Überblick 🚀");
        string[] titles =
        [
            "Tab\there", "Ctl\u0001\u001f\u007f", "LS\u2028PS\u2029", "ZW\u200b\u200d\u200e", "NBSP\u00a0\u00ad",
            "BOM\ufeff", "PUA\ue000", "<html> & 'quotes' \"dq\" back\\slash /", "emoji 🚀👍🏽", "combining e\u0301",
            "NEL\u0085", "unassigned \u0378", "Han 漢字 Arabic مرحبا", "replacement \ufffd", "nonchar \ufffe",
            "ascii `~!@#$%^*()_+-={}[]|:;?,."
        ];
        foreach (var title in titles)
        {
            await world.Items.CreateAsync(project.Id, null, null, title);
        }
    }

    private static async Task AddNumbersAsync(TransferWorld world, Guid projectId)
    {
        var estimate = (await world.ReadFieldsAsync()).Single(field => field.Key == "estimate");
        double[] numbers =
        [
            1e20, 1.5e-7, 0.1, -3, 1e15, 999999999999999, 0.0001, 0.00001, double.MaxValue, double.Epsilon, -0.0,
            123.456, 1.0 / 3, 12345678901234567890.0, 1e-5, 4.35, 100, 1e16, 1e21, 2e-6
        ];
        for (var index = 0; index < numbers.Length; index++)
        {
            var item = await world.Items.CreateAsync(projectId, null, null, $"Number {index:00}");
            await world.Items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null, null, null, null, null),
                [new FieldValueInput(estimate.Id, NumberValue: numbers[index])]);
        }
    }

    private static async Task AddSettingsAndSearchesAsync(TransferWorld world, SeedIds ids)
    {
        await world.Settings.SetProjectOverrideAsync(ids.HomeLabId, SettingsCatalogue.DateOnlyReminderTime, new TimeOnly(10, 30));
        await world.Settings.SetProjectOverrideAsync(ids.HomeLabId, SettingsCatalogue.RemindersEnabled, false);
        await world.Settings.SetProjectOverrideAsync(ids.HomeLabId, SettingsCatalogue.DefaultReminderOffset, TimeSpan.FromMinutes(30));
        await world.Settings.SetProjectOverrideAsync(ids.HomeLabId, SettingsCatalogue.AutoCompleteParents, false);
        await world.Settings.SetGlobalAsync(SettingsCatalogue.UrgencyRedThreshold, TimeSpan.FromHours(12));
        await world.Settings.SetGlobalAsync(SettingsCatalogue.WorkspaceCardColumns, 3);
        await world.SavedSearches.SaveAsync("Tables only",
            new SavedSearchDefinition("is:open priority:high", new SearchScope.Area(ids.BillingId, ids.TablesFolderId, false), true));
        await world.SavedSearches.SaveAsync("Root area",
            new SavedSearchDefinition("title~invoice", new SearchScope.Area(ids.BillingId, null, true), false));
        await world.SavedSearches.SaveAsync("verification",
            new SavedSearchDefinition("status:Verification priority:#7", new SearchScope.AllProjects(), true));
    }

    /// <summary>Every BMP code point (surrogates excluded) that the export escapes, as ranges, plus a few samples.</summary>
    private static string EscapeProbe()
    {
        var options = new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        var ranges = new List<int[]>();
        int? start = null;
        for (var code = 0; code <= 0x10000; code++)
        {
            var escaped = code < 0x10000 && (code < 0xD800 || code > 0xDFFF) &&
                JsonSerializer.Serialize(((char)code).ToString(), options) != $"\"{(char)code}\"";
            if (escaped && start is null)
            {
                start = code;
            }
            else if (!escaped && start is not null && (code < 0xD800 || code > 0xDFFF))
            {
                ranges.Add([start.Value, code - 1]);
                start = null;
            }
        }

        var samples = new Dictionary<string, string>
        {
            ["controls"] = JsonSerializer.Serialize("\b\f\n\r\t\u0000\u001b\"\\/", options),
            ["astral"] = JsonSerializer.Serialize("🚀", options),
            ["html"] = JsonSerializer.Serialize("<>&'+`", options),
            ["lone"] = JsonSerializer.Serialize("a\ud800b", options),
        };
        return JsonSerializer.Serialize(new { ranges, samples }, new JsonSerializerOptions { WriteIndented = true });
    }

    /// <summary>Doubles as bit patterns and how the export writes them.</summary>
    private static string NumberProbe()
    {
        var random = new Random(48);
        var values = new List<double> { 0, -0.0, 1, -1, 0.5, 1e15, 1e-5, 1e-4, 123456789012345.6, 9007199254740993 };
        for (var index = 0; index < 4000; index++)
        {
            var bits = random.NextInt64(long.MinValue, long.MaxValue);
            var value = BitConverter.Int64BitsToDouble(bits);
            if (double.IsFinite(value))
            {
                values.Add(value);
            }
        }

        for (var index = 0; index < 2000; index++)
        {
            var exponent = random.Next(-30, 30);
            values.Add(Math.Round(random.NextDouble() * 1000, random.Next(0, 6)) * Math.Pow(10, exponent));
        }

        var entries = values.Select(value => new[]
        {
            BitConverter.DoubleToInt64Bits(value).ToString("x16", CultureInfo.InvariantCulture),
            JsonSerializer.Serialize(value)
        });
        return JsonSerializer.Serialize(entries, new JsonSerializerOptions { WriteIndented = false });
    }
}
```

</details>
