# CSV transfer fixtures

Synthetic data only. Generated for WP49 in a temporary detached `git worktree` of
`legacy-final` (`da980c0071fd3ca9516f775956841ea3cae4dcc5`) outside this checkout,
with .NET SDK 10.0.404 from `. scripts/dev-env.sh`. The worktree was removed
afterwards; the generator below was never committed to either tree.

Every legacy run loads a copy of `../legacy-source.db` (the WP48 fixture database)
into the legacy in-memory test store, so the CSV fixtures describe the same data
as the JSON fixtures. The legacy test clock starts at 2026-11-13T12:00:00Z, like
the TypeScript transfer tests, so "completed now" rows match. `.gitattributes`
keeps the files' bytes (CRLF, lone CR and LF line ends) on every OS.

| Files                                          | Written by      | Contents                                                                                                 |
| ---------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| `import-*.csv`                                 | this repository | Hand-written import inputs (script below): every column format, quoting, line ends, Unicode, BOM, errors |
| `legacy-export-{billing,home-lab,unicode}.csv` | legacy-final    | `ExportProjectCsvAsync` of each active project, written as the app writes files (UTF-8 with BOM)         |
| `legacy-search-all.csv`                        | legacy-final    | `ExportResultsCsvAsync` of an all-projects search including completed items                              |
| `legacy-search-billing-open.csv`               | legacy-final    | The same for Billing's root and subfolders, open items only                                              |
| `legacy-reimport-{billing,unicode}.csv`        | legacy-final    | The legacy export imported into a new project `Target`, then that project exported                       |
| `legacy-reimport-home-lab.json`                | legacy-final    | Legacy refuses its own Home Lab export (archived number-only priority); the issues it reported           |
| `legacy-import-*.json`                         | legacy-final    | `PreviewCsvAsync` of each input into Billing (Tables for `import-folder`) and the import's item count    |
| `legacy-import-*-billing.csv`                  | legacy-final    | Billing exported after each input that imported                                                          |
| `legacy-csv-numbers.json`                      | legacy-final    | `double.ToString("R", InvariantCulture)` for the 6,010 WP48 probe doubles plus eleven more               |

The two `import-collisions-*` cases first add global text fields `Type` and `Links`
(the TypeScript test adds them with a JSON import).

## How they are used

`apps/server/test/db/services/transfer/legacy-csv-compatibility.test.ts` adopts a
disposable copy of `legacy-source.db` and checks, byte for byte:

- legacy → TypeScript exports: each project export and both search result exports
  equal the legacy files, BOM and CRLF included;
- TypeScript reading legacy files: each legacy export re-imported into `Target` and
  exported again equals legacy's re-import (or is refused with the same issues);
- every `import-*.csv` previews exactly like legacy (row count, columns, first rows,
  every issue path and message in order) and either imports the same rows, giving
  the same Billing export, or is refused with the same issues;
- every probed number formats like legacy (`ToString("R")` equals the WP48 JSON
  number format for every probe).

Because TypeScript exports are byte-identical to legacy-final's, a TypeScript CSV
export reads in legacy-final exactly as legacy's own export does (the re-import
fixtures above).

## Regenerating

In the temporary legacy worktree, apply the changes below, then:

```sh
. scripts/dev-env.sh
export WP49_FIXTURE_DIR=/tmp/wp49 WP49_SOURCE_DIR=<this repository>/apps/server/test/fixtures/transfer
dotnet test --project tests/TaskTracker.Infrastructure.Tests --filter-method '*.GenerateWp49Exports'
dotnet test --project tests/TaskTracker.Infrastructure.Tests --filter-method '*.Wp49FixtureGenerator.*'
# copy /tmp/wp49/* here
```

Regenerate the inputs with `node make-inputs.mjs apps/server/test/fixtures/transfer/csv`
(script below) before the legacy runs.

## SHA-256

| File                                      | SHA-256                                                            |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `import-collisions-ambiguous.csv`         | `c29268b9b639aac45a6587cce9a1e4c7edf1505fc3351771a6e23051da346ee5` |
| `import-collisions-ok.csv`                | `624c156c44f19e7c36a5091ccd2726b20afedcb77ec996ae7b925b4c276d4f60` |
| `import-columns.csv`                      | `063a460b46e6cd787172730d4277b00c6494d21a60a53ce7c969d49d12bf451b` |
| `import-empty.csv`                        | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `import-errors.csv`                       | `281226e6c97bb4d7c13a82cbf606547b9b532a17379eb4e39e74734096623ab3` |
| `import-folder.csv`                       | `fe38180dcfe4c481d2782f0e0a0119d2f81d2da0aec7cb7f1122b30b9aeb64eb` |
| `import-header-only.csv`                  | `5acac352d430884e85bc6b455f0d9e5c98b41a232ea87709b29e4666cb082ad4` |
| `import-header-problems.csv`              | `47dbcef269e3ce48512fb60458ffb3583be597f7539938942c1bfe9cbd623761` |
| `import-line-endings.csv`                 | `aaf6f35ee45ea722977f587d0dd4ec0f135a21d80b1d60a359d3b8588f396c90` |
| `import-quotes.csv`                       | `2b90e847cb0db17bfb1eb24de15b3564acde1ecd15220a5797033a913d1c1994` |
| `import-too-many-links.csv`               | `e635702fd601a330d82e59a44f14a613457379c03394e05d88092428a15a5373` |
| `legacy-csv-numbers.json`                 | `85c0c6bd82bd1d982fa9a65e1935de207076a1f98d8bdb005806a7fcfedf951c` |
| `legacy-export-billing.csv`               | `e09f423ead736ffb47616c64b54faf41fe5851b4e6f3e3e8c3975ea039b2c52e` |
| `legacy-export-home-lab.csv`              | `72e1a839165069959ce3c567bdcf61cb9587bc031ea5b804a254de6ec0523eae` |
| `legacy-export-unicode.csv`               | `ad01bad662ea5c81ae517bab6c51262594340a89a7827f1d7948bbc14b318444` |
| `legacy-import-collisions-ambiguous.json` | `72e89bb7721de22e183f9f29b30be7acab1abcb93ed0406f5f6a8a52d654c312` |
| `legacy-import-collisions-ok-billing.csv` | `8cc1895760eec651d3f5963d312c807baa7ad44b6a2543e472be47cd6e46f387` |
| `legacy-import-collisions-ok.json`        | `7fa39c9649eb0fb1ec4911c2bfbe3bbc650c60e69d7a54b8200900607f0cdb9e` |
| `legacy-import-columns-billing.csv`       | `79050c624dee847c02463628291b17de57aa6ef8f3fba48a2d4efa64edea769c` |
| `legacy-import-columns.json`              | `fec586ab878e01a2a7ed6f74207a06fc9709fe97fd60ed53ff381fa3b95afab2` |
| `legacy-import-empty.json`                | `7467b030f718372386bc8e916d30012ae27b66704146e658b5cf606cfcf848a3` |
| `legacy-import-errors.json`               | `2ee8cb7220be410d2233584668dd91c27b0ce674cd56181bb2758da3903d4714` |
| `legacy-import-folder-billing.csv`        | `8feb7ffee9ad5966e7229ba7c74762e1a70e4a2ec601905d200f8ed57d830651` |
| `legacy-import-folder.json`               | `daf2ce6c8b89a3a5e041d606aac67544108bb6c44de10f73f65323dd9797fc58` |
| `legacy-import-header-only.json`          | `a3d7a4334498dbe1655345a68e234aa54e11521909e1c99b23c03491fa97f59c` |
| `legacy-import-header-problems.json`      | `5b7bf88e0760db97f6c705d26dd954e0ea4c6308c44a1cdc202cfbe8ba80175f` |
| `legacy-import-line-endings-billing.csv`  | `121bafb26cdedb7c8644264e869ef43a92f5dff240a41534770673811630fe55` |
| `legacy-import-line-endings.json`         | `e4e847a53147d914c70fb808676477ebf5b139669e8821a368b35060974d776c` |
| `legacy-import-quotes.json`               | `0804e945a7c310ab256899b69c4be44b877a447c5c4a9173784c8ed56482ba4f` |
| `legacy-import-too-many-links.json`       | `ad28302b2fd7935b7b00cd5b883bef47ba25f0cb8ceae110ec9fe83829f74cc2` |
| `legacy-reimport-billing.csv`             | `9975202c942ccd8f41d9534ecb5a0328f0474bf9715de3366eebae158a91140c` |
| `legacy-reimport-home-lab.json`           | `27f102ad2f9d4b0b37edf49fdb205adc2447366e71d41410cb948071ddcd3b1f` |
| `legacy-reimport-unicode.csv`             | `a840c194d12e3fca7841709716abe63a5c8a1940ff67fb24b22fd431789a65a0` |
| `legacy-search-all.csv`                   | `8066d722fadad2247b38248f285a7bf6b4d401275ae4c80dbc68ab2c38258a3e` |
| `legacy-search-billing-open.csv`          | `bda3cd15025099d5b054ab8503da0df21124489525a462c56a245e2899f2f8a2` |

<details><summary>Temporary legacy changes</summary>

```diff
diff --git a/tests/TaskTracker.Infrastructure.Tests/Persistence/SqliteTestStore.cs b/tests/TaskTracker.Infrastructure.Tests/Persistence/SqliteTestStore.cs
index 62e3678..58412f8 100644
--- a/tests/TaskTracker.Infrastructure.Tests/Persistence/SqliteTestStore.cs
+++ b/tests/TaskTracker.Infrastructure.Tests/Persistence/SqliteTestStore.cs
@@ -20,6 +20,13 @@ internal sealed class SqliteTestStore : IAsyncDisposable

     public FakeTimeProvider Clock { get; } = new(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));

+    public void LoadFrom(string path)
+    {
+        using var file = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path, Pooling = false, Mode = SqliteOpenMode.ReadOnly }.ToString());
+        file.Open();
+        file.BackupDatabase(connection);
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
using System.Text.Json;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Search;
using TaskTracker.Core.Transfer.Csv;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Transfer;

/// <summary>WP49 fixture generator (temporary, not part of legacy-final).</summary>
public sealed class Wp49FixtureGenerator
{
    private static readonly Guid BillingId = Guid.Parse("01A1F637-4758-7C47-B023-75B62030AF1E");
    private static readonly Guid TablesId = Guid.Parse("01A1F637-47A1-7044-B6DE-849D10AEBA1A");

    private static string Output => Environment.GetEnvironmentVariable("WP49_FIXTURE_DIR")!;

    private static string Fixtures => Environment.GetEnvironmentVariable("WP49_SOURCE_DIR")!;

    private static readonly JsonSerializerOptions Indented = new() { WriteIndented = true };

    private static async Task<TransferWorld> LoadAsync()
    {
        var world = await TransferWorld.CreateAsync();
        world.Store.LoadFrom(Path.Combine(Fixtures, "legacy-source.db"));
        return world;
    }

    private static Task WriteCsvAsync(string name, string text)
    {
        return File.WriteAllTextAsync(Path.Combine(Output, name), text, CsvFormat.Utf8WithBom);
    }

    [Fact]
    public async Task GenerateWp49Exports()
    {
        Assert.SkipWhen(Output is null, "Set WP49_FIXTURE_DIR.");
        Directory.CreateDirectory(Output);
        await using var world = await LoadAsync();
        var projects = await world.ReadProjectsAsync();
        var names = new Dictionary<string, string> { ["Billing"] = "billing", ["Home Lab"] = "home-lab", ["Café Überblick 🚀"] = "unicode" };
        foreach (var project in projects.Where(project => project.DeletedAtUtc is null))
        {
            await WriteCsvAsync($"legacy-export-{names[project.Name]}.csv", await world.Transfer.ExportProjectCsvAsync(project.Id));
        }

        var search = new ItemSearchService(new TestUnitOfWorkFactory(world.Store.Open()), new ItemQueryValidator(new TestUnitOfWorkFactory(world.Store.Open())));
        var all = await search.SearchAsync(new ItemQuery(new SearchScope.AllProjects(), null, [], true), 1_000_000);
        await WriteCsvAsync("legacy-search-all.csv", await world.Transfer.ExportResultsCsvAsync(all.Items));
        var area = await search.SearchAsync(new ItemQuery(new SearchScope.Area(BillingId, null, true), null, [], false), 1_000_000);
        await WriteCsvAsync("legacy-search-billing-open.csv", await world.Transfer.ExportResultsCsvAsync(area.Items));
    }

    [Fact]
    public async Task GenerateWp49Reimports()
    {
        Assert.SkipWhen(Output is null, "Set WP49_FIXTURE_DIR.");
        foreach (var name in new[] { "billing", "home-lab", "unicode" })
        {
            await using var world = await LoadAsync();
            var csv = await File.ReadAllTextAsync(Path.Combine(Output, $"legacy-export-{name}.csv"));
            var target = await world.Projects.CreateAsync("Target");
            var result = await world.Transfer.ImportCsvAsync(csv, target.Id, null);
            if (!result.Succeeded)
            {
                var issues = result.Issues.Select(issue => new { path = issue.Path, message = issue.Message });
                await File.WriteAllTextAsync(Path.Combine(Output, $"legacy-reimport-{name}.json"), JsonSerializer.Serialize(new { issues }, Indented) + "\n", new UTF8Encoding(false));
                continue;
            }

            await WriteCsvAsync($"legacy-reimport-{name}.csv", await world.Transfer.ExportProjectCsvAsync(target.Id));
        }
    }

    [Fact]
    public async Task GenerateWp49ImportCases()
    {
        Assert.SkipWhen(Output is null, "Set WP49_FIXTURE_DIR.");
        foreach (var path in Directory.GetFiles(Path.Combine(Fixtures, "csv"), "import-*.csv").Order(StringComparer.Ordinal))
        {
            var name = Path.GetFileNameWithoutExtension(path);
            await using var world = await LoadAsync();
            if (name.StartsWith("import-collisions", StringComparison.Ordinal))
            {
                await world.Fields.CreateAsync("Type", FieldDataType.Text, null);
                await world.Fields.CreateAsync("Links", FieldDataType.Text, null);
            }

            var folderId = name == "import-folder" ? TablesId : (Guid?)null;
            var text = Decode(await File.ReadAllBytesAsync(path));
            var preview = await world.Transfer.PreviewCsvAsync(text, BillingId, folderId);
            var result = await world.Transfer.ImportCsvAsync(text, BillingId, folderId);
            var outcome = new
            {
                preview = new
                {
                    rowCount = preview.RowCount,
                    recognizedColumns = preview.RecognizedColumns,
                    unknownColumns = preview.UnknownColumns,
                    ignoredColumns = preview.IgnoredColumns,
                    sampleRows = preview.SampleRows.Select(row => new { rowNumber = row.RowNumber, title = row.Title, type = row.Type, priority = row.Priority, dueDate = row.DueDate, hasError = row.HasError }),
                    issues = preview.Issues.Select(issue => new { path = issue.Path, message = issue.Message }),
                    canImport = preview.CanImport
                },
                imported = result.Succeeded ? result.Summary.Items : (int?)null
            };
            await File.WriteAllTextAsync(Path.Combine(Output, $"legacy-{name}.json"), JsonSerializer.Serialize(outcome, Indented) + "\n", new UTF8Encoding(false));
            if (result.Succeeded)
            {
                await WriteCsvAsync($"legacy-{name}-billing.csv", await world.Transfer.ExportProjectCsvAsync(BillingId));
            }
        }
    }

    [Fact]
    public async Task GenerateWp49Numbers()
    {
        Assert.SkipWhen(Output is null, "Set WP49_FIXTURE_DIR.");
        var probe = JsonSerializer.Deserialize<string[][]>(await File.ReadAllTextAsync(Path.Combine(Fixtures, "legacy-numbers.json")))!;
        var extra = new[] { 1e14, 1e15, 999999999999999.0, 1234567890123456.7, 0.0001, 0.00001, 2.5, -2.5, 3.75, 1e3, 0.1 + 0.2 };
        var bits = probe.Select(entry => entry[0]).Concat(extra.Select(value => BitConverter.DoubleToInt64Bits(value).ToString("x16", CultureInfo.InvariantCulture)));
        var entries = bits.Select(hex =>
        {
            var value = BitConverter.Int64BitsToDouble(long.Parse(hex, NumberStyles.HexNumber, CultureInfo.InvariantCulture));
            return new[] { hex, value.ToString("R", CultureInfo.InvariantCulture) };
        });
        await File.WriteAllTextAsync(Path.Combine(Output, "legacy-csv-numbers.json"), JsonSerializer.Serialize(entries), new UTF8Encoding(false));
    }

    private static string Decode(byte[] bytes)
    {
        var skip = bytes.AsSpan().StartsWith((byte[])[0xEF, 0xBB, 0xBF]) ? 3 : 0;
        return new UTF8Encoding(false, true).GetString(bytes, skip, bytes.Length - skip);
    }
}
```

</details>

<details><summary>Input script (make-inputs.mjs)</summary>

```js
// Writes the hand-authored CSV import inputs for WP49 with exact bytes.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2];
const BOM = "\uFEFF";
const write = (name, text) => writeFileSync(join(dir, name), text, "utf8");
const crlf = (lines) => lines.join("\r\n") + "\r\n";

write(
  "import-columns.csv",
  BOM +
    crlf([
      "title,TYPE,priority,Priority reference,Status,Ticket,Due date,Due time,Scheduled start,Scheduled end,Completed,Completed at,Description,severity,Estimate,Reviewed,Flag,Notes,Customer,Links,Project,Folder path,Parent title,Repeats,Mystery,",
      'Plan release,change,HIGH,,Testing,T-100,2026-12-01,09:30,2026-12-02 10:00,2026-12-02T11:30,,,"Line one\r\nline two, with comma and ""quotes""",major,3.75,2026-10-01,yes,  trimmed  ,Acme,https://a.example https://b.example/x?y=1,Billing,dbo/Tables,Fix invoice totals,Every day,ignored me,',
      '  Padded title  ,Error,,#7,,\'-9,2026-12-03,15:00:00.5,,,yes,,"LF only\ninside",Minor,-2.5,,0,"\'=SUM(1,2)",\'quote,,,,,,,',
      "Done with time,,Low,#name:Urgent,,,,,,,Y,2026-10-01T08:00:00Z,,,1e3,,TRUE,'+1 note,,mailto:team@example.com\thttps://c.example,,,,,,",
      "Shipped by status,Spike,critical,#id:019a0000-0000-7000-8000-000000000103,Shipped,,,,,,,,,,,,,,,,,,,,,",
      "",
      "Completed status only,,,,Completed,TKT-1,,,,,,,,,,,,,,,,,,,,",
      "Unicode 🚀👍🏽 e\u0301 漢字 مرحبا,Discussion,Medium,,,,2028-02-29,,,,no,,\u00a0NBSP padded\u00a0,,  0.1  ,2026-11-30,n,Café,,,,,,,,",
      "Short row,Change",
      "'@mention title,,,,,'=ticket,,,,,,,,,,,,,,,,,,,,",
    ]),
);

write(
  "import-line-endings.csv",
  'Title,Description,Ticket\nLF row,plain,A-1\rCR row,"quoted\rwith CR",A-2\r\nCRLF row,"two\r\nlines",A-3\n\n"Quoted, title","say ""hi""",A-4\r\nNo final newline,,A-5',
);

const long = "x".repeat(301);
const longTicket = "T".repeat(101);
write(
  "import-errors.csv",
  crlf([
    "Title,Type,Priority,Priority reference,Status,Due date,Due time,Scheduled start,Scheduled end,Completed,Completed at,Severity,Estimate,Reviewed,Flag,Links,Ticket",
    "Good,Change,High,,,2026-12-01,,,,,,Major,1,,,,",
    "Bad type,Bug,High,,,,,,,,,,,,,,",
    ",Change,Urgent,,,13/01/2026,,,,,,Huge,abc,,,,",
    "Archived priority,,Someday,,,,,,,,,,,,,,",
    "Archived number,,,#8,,,,,,,,,,,,,",
    "Archived by id,,,#id:01A1F637-48EB-7D52-B5CA-49B075DEEE4F,,,,,,,,,,,,,",
    "Unknown reference,,,#99,,,,,,,,,,,,,",
    "Time without date,,,,,,15:00,,,,,,,,,,",
    "Bad time,,,,,2026-12-01,25:00,,,,,,,,,,",
    "End before start,,,,,,,2026-12-02T10:00,2026-12-02T09:00,,,,,,,,",
    "End without start,,,,,,,,2026-12-02T09:00,,,,,,,,",
    "Bad start,,,,,,,tomorrow,,,,,,,,,",
    "Maybe completed,,,,,,,,,maybe,,,,,,,",
    "Says no,,,,,,,,,no,2026-10-01T08:00:00Z,,,,,,",
    "No zone,,,,,,,,,yes,2026-10-01T08:00:00,,,,,,",
    "Open but done,,,,Testing,,,,,yes,,,,,,,",
    "Done but open,,,,Completed,,,,,no,,,,,,,",
    "Unknown status,,,,Blocked,,,,,,,,,,,,",
    'Decimal comma,,,,,,,,,,,,"2,5",,,,',
    "Bad date field,,,,,,,,,,,,,2026-02-30,maybe,,",
    long + ",,,,,,,,,,,,,,,,",
    "Long ticket,,,,,,,,,,,,,,,," + longTicket,
    "Bad links,,,,,,,,,,,,,,,https://a.example file:///C:/x not-a-link,",
    "Too many cells,,,,,,,,,,,,,,,,,extra",
    "Legacy label,,7,,,,,,,,,,,,,,",
  ]),
);

write(
  "import-header-problems.csv",
  crlf(["Description,Mystery,description,", "No title column,x,y,"]),
);
write("import-quotes.csv", crlf(["Title,Ticket", '"a"x,T-1', 'Fine,"never closed']));
write("import-empty.csv", "");
write("import-header-only.csv", crlf(["Title,Type"]));
write("import-folder.csv", crlf(["Title,Priority", "First in tables,High", "Second in tables,"]));
write(
  "import-collisions-ok.csv",
  crlf([
    "Title,Type,Type (field),Links,Links (field),Ticket",
    "Colliding,Change,custom kind,https://example.com,legacy text,T-7",
  ]),
);
write("import-collisions-ambiguous.csv", crlf(["Title,Links", "Wiki,internal wiki"]));
write(
  "import-too-many-links.csv",
  crlf([
    "Title,Links",
    "One," + Array(100).fill("https://example.com").join(" ") + " invalid another-invalid",
  ]),
);
```

</details>
