#pragma warning disable xUnit1051
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class CustomFieldMigrationTests
{
    [Fact]
    public async Task Migration_adds_custom_fields_to_an_existing_database_with_data()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<TaskTrackerDbContext>()
            .UseSqlite(connection).Options;
        var projectId = Guid.CreateVersion7();
        var folderId = Guid.CreateVersion7();
        var parentId = Guid.CreateVersion7();
        var childId = Guid.CreateVersion7();
        var name = "Existing";
        var stamp = "2026-11-13 12:00:00";

        await using (var oldDatabase = new TaskTrackerDbContext(options))
        {
            var migrator = oldDatabase.GetService<IMigrator>();
            await migrator.MigrateAsync("20261113163313_InitialCreate");
            await oldDatabase.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc) VALUES ({projectId}, {name}, {0}, {stamp}, {stamp})");
            await oldDatabase.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO Folder (Id, ProjectId, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc) VALUES ({folderId}, {projectId}, {name}, {0}, {stamp}, {stamp})");
            await oldDatabase.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO TodoItem (Id, ProjectId, FolderId, Title, SortOrder, CreatedAtUtc, UpdatedAtUtc) VALUES ({parentId}, {projectId}, {folderId}, {name}, {0}, {stamp}, {stamp})");
            await oldDatabase.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO TodoItem (Id, ProjectId, FolderId, ParentItemId, Title, SortOrder, CreatedAtUtc, UpdatedAtUtc) VALUES ({childId}, {projectId}, {folderId}, {parentId}, {name}, {0}, {stamp}, {stamp})");
        }

        await using var upgraded = new TaskTrackerDbContext(options);
        await upgraded.Database.MigrateAsync();
        var fields = new FieldService(new TestUnitOfWorkFactory(upgraded));
        var items = new ItemService(new TestUnitOfWorkFactory(upgraded), TimeProvider.System, TimeZoneInfo.Utc);
        var field = await fields.CreateAsync("Metadata", FieldDataType.Text, null);
        var edit = new ItemEdit("Existing", null, null, null, null, null, null, null, null);
        await items.EditAsync(childId, edit, [new FieldValueInput(field.Id, TextValue: "attached")]);
        await using var reader = new TaskTrackerDbContext(options);

        Assert.Equal("Existing", (await reader.Projects.SingleAsync(project => project.Id == projectId)).Name);
        Assert.Equal(folderId, (await reader.TodoItems.SingleAsync(item => item.Id == childId)).FolderId);
        Assert.Equal(parentId, (await reader.TodoItems.SingleAsync(item => item.Id == childId)).ParentItemId);
        Assert.Equal("attached", (await reader.ItemFieldValues.SingleAsync()).TextValue);
    }
}