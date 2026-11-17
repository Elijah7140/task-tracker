#pragma warning disable xUnit1051
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.SavedSearches;

public sealed class SavedSearchMigrationTests
{
    private const string PreviousMigration = "20261114120000_AddItemSearch";

    [Fact]
    public async Task Upgrading_from_the_previous_schema_adds_only_the_saved_search_table()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = TaskTrackerSqliteOptions.Configure(
            new DbContextOptionsBuilder<TaskTrackerDbContext>(), connection).Options;
        var projectId = Guid.CreateVersion7();
        var stamp = "2026-11-13 12:00:00";

        await using (var old = new TaskTrackerDbContext(options))
        {
            await old.GetService<IMigrator>().MigrateAsync(PreviousMigration);
            await old.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc) VALUES ({projectId}, {"Kept"}, {0}, {stamp}, {stamp})");
            Assert.Equal(0, await CountTablesAsync(connection, "SavedSearch"));
        }

        await using var upgraded = new TaskTrackerDbContext(options);
        await upgraded.Database.MigrateAsync();

        Assert.Equal(1, await CountTablesAsync(connection, "SavedSearch"));
        Assert.Equal("Kept", (await upgraded.Projects.SingleAsync()).Name);
        Assert.Empty(await upgraded.SavedSearches.ToListAsync());
        Assert.Equal(4, await CountTriggersAsync(connection));
    }

    [Fact]
    public async Task A_saved_search_survives_deleting_its_project_without_a_foreign_key()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using (var database = store.Open())
        {
            var project = await store.Projects(database).CreateAsync("Doomed");
            var scope = new SearchScope.Project(project.Id);
            await store.SavedSearches(database).SaveAsync(
                "Orphan", new SavedSearchDefinition("x", scope, false), overwrite: false);
            var batch = await store.Projects(database).DeleteAsync(project.Id);
            await store.Trash(database).PurgeAsync(batch);
        }

        await using var fresh = store.Open();
        var saved = Assert.Single(await fresh.SavedSearches.AsNoTracking().ToListAsync());
        Assert.Equal("Orphan", saved.Name);
        Assert.Equal(SavedSearchScopeKind.Project, saved.ScopeKind);
    }

    [Fact]
    public async Task Migration_renames_keyword_keys_to_first_free_suffix_without_losing_values()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = TaskTrackerSqliteOptions.Configure(
            new DbContextOptionsBuilder<TaskTrackerDbContext>(), connection).Options;
        var fieldIds = new Dictionary<string, Guid>();
        Guid itemId;

        await using (var old = new TaskTrackerDbContext(options))
        {
            await old.GetService<IMigrator>().MigrateAsync(PreviousMigration);
            var projectId = Guid.CreateVersion7();
            var stamp = "2026-11-13 12:00:00";
            await old.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc) VALUES ({projectId}, {"Migration"}, {0}, {stamp}, {stamp})");
            itemId = (await new TaskTracker.Core.Items.ItemService(
                new TestUnitOfWorkFactory(old), TimeProvider.System, TimeZoneInfo.Utc)
                .CreateAsync(projectId, null, null, "Keep value")).Id;

            foreach (var key in new[] { "has", "has-2", "has-3", "no", "no-2", "is" })
            {
                var fieldId = Guid.CreateVersion7();
                fieldIds[key] = fieldId;
                await old.Database.ExecuteSqlInterpolatedAsync(
                    $"INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, IsArchived, SortOrder) VALUES ({fieldId}, {key}, {key}, {"Text"}, {false}, {0})");
            }

            await old.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO ItemFieldValue (ItemId, FieldDefinitionId, TextValue) VALUES ({itemId}, {fieldIds["has"]}, {"preserved"})");
        }

        await using var upgraded = new TaskTrackerDbContext(options);
        await upgraded.Database.MigrateAsync();

        Assert.Equal("has-4", (await upgraded.FieldDefinitions.SingleAsync(field => field.Id == fieldIds["has"])).Key);
        Assert.Equal("no-3", (await upgraded.FieldDefinitions.SingleAsync(field => field.Id == fieldIds["no"])).Key);
        Assert.Equal("is-2", (await upgraded.FieldDefinitions.SingleAsync(field => field.Id == fieldIds["is"])).Key);
        Assert.Equal("preserved", (await upgraded.ItemFieldValues.SingleAsync(value => value.ItemId == itemId)).TextValue);
    }

    private static async Task<long> CountTablesAsync(SqliteConnection connection, string name)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = $name";
        command.Parameters.AddWithValue("$name", name);
        return (long)(await command.ExecuteScalarAsync())!;
    }

    private static async Task<long> CountTriggersAsync(SqliteConnection connection)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'TodoItemSearch%'";
        return (long)(await command.ExecuteScalarAsync())!;
    }
}