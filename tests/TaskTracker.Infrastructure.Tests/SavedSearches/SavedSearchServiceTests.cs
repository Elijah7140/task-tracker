#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Infrastructure.Persistence;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.SavedSearches;

public sealed class SavedSearchServiceTests
{
    [Fact]
    public async Task A_saved_search_keeps_its_query_scope_and_switches_after_reload()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = await store.Projects(database).CreateAsync("Billing");
        var scope = new SearchScope.Area(project.Id, Guid.NewGuid(), false);

        await store.SavedSearches(database).SaveAsync("Overdue", new SavedSearchDefinition("due<today", scope, true));

        await using var reader = store.Open();
        var loaded = Assert.Single(await store.SavedSearches(reader).ListAsync());
        Assert.Equal("Overdue", loaded.Name);
        Assert.Equal(new SavedSearchDefinition("due<today", scope, true), loaded.ToDefinition());
        Assert.Equal(store.Clock.GetUtcNow().UtcDateTime, loaded.CreatedAtUtc);
    }

    [Fact]
    public async Task Saving_a_duplicate_name_ignoring_case_is_refused_unless_overwriting()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var service = store.SavedSearches(database);
        await service.SaveAsync("Overdue", Definition("due<today"));

        var refused = await Assert.ThrowsAsync<DomainRuleException>(
            () => service.SaveAsync("OVERDUE", Definition("due<tomorrow")));
        await service.SaveAsync("overdue", Definition("due<tomorrow"), overwrite: true);

        Assert.Equal("A saved search named 'Overdue' already exists.", refused.Message);
        var only = Assert.Single(await service.ListAsync());
        Assert.Equal("Overdue", only.Name);
        Assert.Equal("due<tomorrow", only.QueryText);
    }

    [Fact]
    public async Task The_database_itself_rejects_two_names_that_differ_only_by_case()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var clock = store.Clock;
        database.SavedSearches.Add(SavedSearch.Create("Mine", Definition("a"), clock, 0));
        database.SavedSearches.Add(SavedSearch.Create("MINE", Definition("b"), clock, 1));

        await Assert.ThrowsAsync<DbUpdateException>(() => database.SaveChangesAsync());
    }

    [Fact]
    public async Task Saving_a_search_limited_to_a_missing_project_fails_and_stores_nothing()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var service = store.SavedSearches(database);
        var definition = new SavedSearchDefinition("x", new SearchScope.Project(Guid.NewGuid()), false);

        await Assert.ThrowsAsync<DomainRuleException>(() => service.SaveAsync("Ghost", definition));

        Assert.Empty(await service.ListAsync());
    }

    [Fact]
    public async Task Rename_changes_the_name_and_refuses_another_searchs_name()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var service = store.SavedSearches(database);
        var first = await service.SaveAsync("First", Definition("a"));
        await service.SaveAsync("Second", Definition("b"));

        await service.RenameAsync(first.Id, "Renamed");
        await service.RenameAsync(first.Id, "RENAMED");
        await Assert.ThrowsAsync<DomainRuleException>(() => service.RenameAsync(first.Id, "second"));

        var names = (await service.ListAsync()).Select(search => search.Name);
        Assert.Equal(["RENAMED", "Second"], names);
    }

    [Fact]
    public async Task A_failed_operation_leaves_no_tracked_change_for_the_next_one()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var service = store.SavedSearches(database);
        var first = await service.SaveAsync("First", Definition("a"));
        await service.SaveAsync("Second", Definition("b"));

        await Assert.ThrowsAsync<DomainRuleException>(() => service.RenameAsync(first.Id, "Second"));
        await service.SaveAsync("Third", Definition("c"));

        var names = (await service.ListAsync()).Select(search => search.Name).Order();
        Assert.Equal(["First", "Second", "Third"], names);
    }

    [Fact]
    public async Task Delete_removes_the_search_and_deleting_it_again_is_a_rule_error()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var service = store.SavedSearches(database);
        var saved = await service.SaveAsync("Gone", Definition("a"));

        await service.DeleteAsync(saved.Id);

        Assert.Empty(await service.ListAsync());
        Assert.Null(await service.FindAsync(saved.Id));
        await Assert.ThrowsAsync<DomainRuleException>(() => service.DeleteAsync(saved.Id));
    }

    [Fact]
    public async Task Reorder_puts_listed_searches_first_and_keeps_the_rest_in_order()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var service = store.SavedSearches(database);
        var a = await service.SaveAsync("A", Definition("a"));
        var b = await service.SaveAsync("B", Definition("b"));
        var c = await service.SaveAsync("C", Definition("c"));

        await service.ReorderAsync([c.Id]);

        Assert.Equal(["C", "A", "B"], (await service.ListAsync()).Select(search => search.Name));
        await Assert.ThrowsAsync<DomainRuleException>(() => service.ReorderAsync([a.Id, a.Id]));
        await Assert.ThrowsAsync<DomainRuleException>(() => service.ReorderAsync([Guid.NewGuid()]));
        Assert.Equal(["C", "A", "B"], (await service.ListAsync()).Select(search => search.Name));
        Assert.NotEqual(b.Id, c.Id);
    }

    [Fact]
    public async Task A_new_search_goes_after_the_existing_ones()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var service = store.SavedSearches(database);
        await service.SaveAsync("B", Definition("b"));
        await service.SaveAsync("A", Definition("a"));

        Assert.Equal(["B", "A"], (await service.ListAsync()).Select(search => search.Name));
    }

    private static SavedSearchDefinition Definition(string query)
    {
        return new SavedSearchDefinition(query, new SearchScope.AllProjects(), false);
    }
}