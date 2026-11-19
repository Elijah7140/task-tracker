using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using TaskTracker.Core.Settings;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class EfFixtureTests
{
    private const string InitialMigration = "20261113163313_InitialCreate";
    private static readonly Guid ProjectId = Guid.Parse("019A0000-0000-7000-8000-000000000AAA");
    private static readonly Guid FolderId = Guid.Parse("019A0000-0000-7000-8000-000000000BBB");
    private static readonly Guid ChildFolderId = Guid.Parse("019A0000-0000-7000-8000-000000000BBC");
    private static readonly Guid ParentId = Guid.Parse("019A0000-0000-7000-8000-000000000CCA");
    private static readonly Guid ChildId = Guid.Parse("019A0000-0000-7000-8000-000000000CCB");
    private static readonly Guid DeletedId = Guid.Parse("019A0000-0000-7000-8000-000000000CCC");
    private static readonly Guid BatchId = Guid.Parse("019A0000-0000-7000-8000-000000000DDD");
    private static readonly Guid ArchivedTypeId = Guid.Parse("019A0000-0000-7000-8000-000000000EEE");
    private static readonly DateTime Stamp = new DateTime(2026, 11, 13, 12, 0, 0, DateTimeKind.Utc).AddTicks(1234567);

    [Fact]
    public async Task GenerateEfFixtures()
    {
        var cancellation = TestContext.Current.CancellationToken;
        var temporary = Directory.CreateTempSubdirectory("tasktracker-ef-");
        try
        {
            var initial = Path.Combine(temporary.FullName, "initial-create.db");
            var phase3 = Path.Combine(temporary.FullName, "phase-3.db");
            await CreateInitial(initial, cancellation);
            File.Copy(initial, phase3);
            await AddCustomFields(phase3, cancellation);

            // Ordinary infrastructure test runs exercise the generator without changing the checkout.
            if (FixtureCommand.PublishFixtures)
            {
                var root = FindWorkspace();
                var destination = Directory.CreateDirectory(Path.Combine(root, "apps", "server", "test", "fixtures", "ef"));
                File.Copy(initial, Path.Combine(destination.FullName, Path.GetFileName(initial)), overwrite: true);
                File.Copy(phase3, Path.Combine(destination.FullName, Path.GetFileName(phase3)), overwrite: true);
            }
        }
        finally
        {
            temporary.Delete(recursive: true);
        }
    }

    private static TaskTrackerDbContext Open(string path)
    {
        var connection = new SqliteConnectionStringBuilder { DataSource = path, Pooling = false };
        return new TaskTrackerDbContext(new DbContextOptionsBuilder<TaskTrackerDbContext>()
            .UseSqlite(connection.ToString()).Options);
    }

    private static async Task CreateInitial(string path, CancellationToken cancellation)
    {
        await using var database = Open(path);
        await database.GetService<IMigrator>().MigrateAsync(InitialMigration, cancellation);
        await database.Database.ExecuteSqlInterpolatedAsync(
            $"""INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc) VALUES ({ProjectId}, 'Sample project', 0, {Stamp}, {Stamp})""", cancellation);
        await database.Database.ExecuteSqlInterpolatedAsync(
            $"""
                INSERT INTO Folder (Id, ProjectId, ParentFolderId, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc)
                VALUES ({FolderId}, {ProjectId}, NULL, 'Sample folder', 0, {Stamp}, {Stamp}),
                       ({ChildFolderId}, {ProjectId}, {FolderId}, 'Nested folder', 0, {Stamp}, {Stamp})
                """, cancellation);
        await AddItems(database, cancellation);
        await AddSettings(database, cancellation);
        await database.Database.ExecuteSqlInterpolatedAsync(
            $"""INSERT INTO ItemType (Id, Name, IsBuiltIn, IsArchived, SortOrder) VALUES ({ArchivedTypeId}, 'Archived type', {false}, {true}, 3)""", cancellation);
        await database.Database.ExecuteSqlRawAsync("UPDATE ItemType SET Name = 'Renamed Change' WHERE IsBuiltIn = 1 AND SortOrder = 0", cancellation);
        await database.Database.ExecuteSqlInterpolatedAsync(
            $"""UPDATE TodoItem SET ItemTypeId = {ArchivedTypeId}, PriorityLevelId = {Guid.Parse("019A0000-0000-7000-8000-000000000102")} WHERE Id = {ChildId}""", cancellation);
        await database.Database.ExecuteSqlRawAsync("VACUUM", cancellation);
    }

    private static async Task AddItems(TaskTrackerDbContext database, CancellationToken cancellation)
    {
        var due = new DateOnly(2026, 12, 10);
        var time = new TimeOnly(9, 30).Add(TimeSpan.FromTicks(1200000));
        var start = new DateTime(2026, 12, 9, 14, 0, 0).AddTicks(1234567);
        await database.Database.ExecuteSqlInterpolatedAsync(
            $"""
                INSERT INTO TodoItem (Id, ProjectId, FolderId, ParentItemId, Title, SortOrder, CreatedAtUtc, UpdatedAtUtc, CompletedAtUtc, DeletedAtUtc, DeletionBatchId)
                VALUES ({ParentId}, {ProjectId}, {ChildFolderId}, NULL, 'Sample parent', 0, {Stamp}, {Stamp}, {Stamp}, NULL, NULL),
                       ({ChildId}, {ProjectId}, {ChildFolderId}, {ParentId}, 'Sample child', 0, {Stamp}, {Stamp}, {Stamp}, NULL, NULL),
                       ({DeletedId}, {ProjectId}, {ChildFolderId}, {ParentId}, 'Deleted child', 1, {Stamp}, {Stamp}, NULL, {Stamp}, {BatchId})
                """, cancellation);
        await database.Database.ExecuteSqlInterpolatedAsync(
            $"""UPDATE TodoItem SET DueDate = {due}, DueTime = {time}, ScheduledStart = {start}, ScheduledEnd = {start.AddHours(1)} WHERE Id = {ChildId}""", cancellation);
    }

    private static Task AddSettings(TaskTrackerDbContext database, CancellationToken cancellation)
    {
        var duration = new DurationCodec();
        var yellow = SettingsCatalogue.UrgencyYellowThreshold.Key;
        var red = SettingsCatalogue.UrgencyRedThreshold.Key;
        database.GlobalSettings.AddRange(
            new GlobalSettingRow { Key = yellow, Value = duration.Format(TimeSpan.FromDays(1)) },
            new GlobalSettingRow { Key = red, Value = duration.Format(TimeSpan.FromHours(3)) });
        database.ProjectSettings.Add(new ProjectSettingRow { ProjectId = ProjectId, Key = red, Value = duration.Format(TimeSpan.FromSeconds(0.5)) });
        return database.SaveChangesAsync(cancellation);
    }

    private static async Task AddCustomFields(string path, CancellationToken cancellation)
    {
        await using var database = Open(path);
        await database.Database.MigrateAsync(cancellation);
        var text = Guid.Parse("019A0000-0000-7000-8000-00000000F001");
        var number = Guid.Parse("019A0000-0000-7000-8000-00000000F002");
        var date = Guid.Parse("019A0000-0000-7000-8000-00000000F003");
        var boolean = Guid.Parse("019A0000-0000-7000-8000-00000000F004");
        var choice = Guid.Parse("019A0000-0000-7000-8000-00000000F005");
        var option = Guid.Parse("019A0000-0000-7000-8000-00000000FAAA");
        await database.Database.ExecuteSqlInterpolatedAsync(
            $"""
                INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, ProjectId, IsArchived, SortOrder)
                VALUES ({text}, 'notes', 'Notes', 'Text', NULL, {true}, 0),
                       ({number}, 'estimate', 'Estimate', 'Number', {ProjectId}, {false}, 1),
                       ({date}, 'review_date', 'Review date', 'Date', NULL, {false}, 2),
                       ({boolean}, 'reviewed', 'Reviewed', 'Boolean', NULL, {false}, 3),
                       ({choice}, 'status', 'Status', 'Choice', NULL, {false}, 4)
                """, cancellation);
        await database.Database.ExecuteSqlInterpolatedAsync(
            $"""INSERT INTO FieldChoice (Id, FieldDefinitionId, Label, SortOrder, IsArchived) VALUES ({option}, {choice}, 'Retired option', 0, {true})""", cancellation);
        await database.Database.ExecuteSqlInterpolatedAsync(
            $"""
                INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId, TextValue, NumberValue, DateValue, BoolValue, ChoiceId)
                VALUES ({ChildId}, {text}, 'Example text', NULL, NULL, NULL, NULL),
                       ({ChildId}, {number}, NULL, {12.5}, NULL, NULL, NULL),
                       ({ChildId}, {date}, NULL, NULL, {new DateOnly(2026, 12, 8)}, NULL, NULL),
                       ({ChildId}, {boolean}, NULL, NULL, NULL, {false}, NULL),
                       ({ChildId}, {choice}, NULL, NULL, NULL, NULL, {option})
                """, cancellation);
        await database.Database.ExecuteSqlRawAsync("VACUUM", cancellation);
    }

    private static string FindWorkspace()
    {
        for (var root = new DirectoryInfo(AppContext.BaseDirectory); root is not null; root = root.Parent)
        {
            if (File.Exists(Path.Combine(root.FullName, "TaskTracker.slnx")))
            {
                return root.FullName;
            }
        }

        throw new DirectoryNotFoundException("Could not locate TaskTracker.slnx.");
    }
}