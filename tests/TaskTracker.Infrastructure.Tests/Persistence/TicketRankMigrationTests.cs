#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using TaskTracker.Core.Search;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>Checks that ticket ranking upgrades and downgrades preserve the item search index.</summary>
public sealed class TicketRankMigrationTests
{
    [Fact]
    public async Task Upgrading_adds_nullable_ranks_and_downgrading_keeps_search_triggers_live()
    {
        const string previous = "20261118045951_AddStatusesAndPriorityNumbers";
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var migrator = database.GetService<IMigrator>();
        await migrator.MigrateAsync(previous);
        var stamp = store.Clock.GetUtcNow().UtcDateTime;
        var projectId = Guid.NewGuid();
        var itemId = Guid.NewGuid();
        await database.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc)
                VALUES ({projectId}, 'Project', 0, {stamp}, {stamp});
            INSERT INTO TodoItem (Id, ProjectId, Title, SortOrder, CreatedAtUtc, UpdatedAtUtc, TicketNumber)
                VALUES ({itemId}, {projectId}, 'Original', 0, {stamp}, {stamp}, 'PAY-7');
            """);

        await migrator.MigrateAsync();
        var ticket = await database.TodoItems.AsNoTracking().SingleAsync();
        await database.Database.ExecuteSqlInterpolatedAsync($"UPDATE TodoItem SET TicketRank = 1.5 WHERE Id = {itemId}");
        var ranked = await database.TodoItems.AsNoTracking().SingleAsync();
        await migrator.MigrateAsync(previous);
        await database.Database.ExecuteSqlInterpolatedAsync($"UPDATE TodoItem SET Title = 'Revised' WHERE Id = {itemId}");
        var factory = new TestUnitOfWorkFactory(database);
        var query = new ItemQuery(new SearchScope.AllProjects(), "Revised", [], false);
        var result = await new ItemSearchService(factory, new ItemQueryValidator(factory)).SearchAsync(query);

        Assert.Null(ticket.TicketRank);
        Assert.Equal(1.5, ranked.TicketRank);
        Assert.Equal(itemId, Assert.Single(result.Items).ItemId);
    }
}