#pragma warning disable xUnit1051
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using TaskTracker.Core;
using TaskTracker.Core.Items;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>Item links (§7.10) through the item Save, trash, undo, search and the migration.</summary>
public sealed class ItemLinkTests
{
    [Fact]
    public async Task Saving_links_stores_them_in_order_with_trimmed_values()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");

        await SaveLinksAsync(world, item, Link("  https://a.example  ", " Aye "), Link("mailto:team@example.com", null));

        var stored = await world.Items.LoadLinksAsync(item.Id);
        Assert.Equal(["https://a.example", "mailto:team@example.com"], stored.Select(link => link.Url));
        Assert.Equal(["Aye", null], stored.Select(link => link.Title));
        Assert.Equal([0, 1], stored.Select(link => link.SortOrder));
    }

    [Fact]
    public async Task Editing_links_updates_removes_adds_and_renumbers()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await SaveLinksAsync(world, item, Link("https://a.example", null), Link("https://b.example", null),
            Link("https://c.example", null));
        var stored = await world.Items.LoadLinksAsync(item.Id);

        await SaveLinksAsync(world, item,
            new ItemLinkInput(stored[2].Id, "https://c.example", "Sea"),
            new ItemLinkInput(null, "https://d.example", null),
            new ItemLinkInput(stored[0].Id, "https://a2.example", null));

        var after = await world.Items.LoadLinksAsync(item.Id);
        Assert.Equal(["https://c.example", "https://d.example", "https://a2.example"], after.Select(link => link.Url));
        Assert.Equal(stored[2].Id, after[0].Id);
        Assert.Equal(stored[0].Id, after[2].Id);
        Assert.Equal("Sea", after[0].Title);
        Assert.Equal([0, 1, 2], after.Select(link => link.SortOrder));
    }

    [Fact]
    public async Task Leaving_the_links_argument_out_keeps_the_stored_links()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await SaveLinksAsync(world, item, Link("https://a.example", null));

        await world.Items.EditAsync(item.Id, EditOf("Renamed"), []);

        Assert.Single(await world.Items.LoadLinksAsync(item.Id));
    }

    [Fact]
    public async Task An_empty_list_removes_every_link()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await SaveLinksAsync(world, item, Link("https://a.example", null));

        await SaveLinksAsync(world, item);

        Assert.Empty(await world.Items.LoadLinksAsync(item.Id));
    }

    [Theory]
    [InlineData("")]
    [InlineData("example.com")]
    [InlineData("file:///C:/secrets.txt")]
    [InlineData("javascript:alert(1)")]
    [InlineData("ftp://example.com/a")]
    [InlineData("custom://open")]
    [InlineData("https://")]
    [InlineData("https://a b.example")]
    public async Task Invalid_addresses_are_rejected_and_nothing_is_saved(string url)
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await SaveLinksAsync(world, item, Link("https://kept.example", null));

        await Assert.ThrowsAsync<DomainRuleException>(() =>
            world.Items.EditAsync(item.Id, EditOf("Changed"), [], [Link("https://new.example", null), Link(url, null)]));

        Assert.Equal(["https://kept.example"], (await world.Items.LoadLinksAsync(item.Id)).Select(link => link.Url));
        Assert.Equal("Task", (await world.ReadItemAsync(item.Id)).Title);
    }

    [Fact]
    public async Task Over_long_addresses_titles_and_lists_are_rejected()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        var longUrl = "https://example.com/" + new string('a', LinkPolicy.UrlMaxLength);
        var longTitle = new string('t', LinkPolicy.TitleMaxLength + 1);
        var tooMany = Enumerable.Range(0, LinkPolicy.MaxLinksPerItem + 1).Select(n => Link($"https://e.example/{n}", null));

        await Assert.ThrowsAsync<DomainRuleException>(() => SaveLinksAsync(world, item, Link(longUrl, null)));
        await Assert.ThrowsAsync<DomainRuleException>(() => SaveLinksAsync(world, item, Link("https://a.example", longTitle)));
        await Assert.ThrowsAsync<DomainRuleException>(() => SaveLinksAsync(world, item, [.. tooMany]));
        Assert.Empty(await world.Items.LoadLinksAsync(item.Id));
    }

    [Fact]
    public async Task The_same_link_id_twice_is_rejected()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await SaveLinksAsync(world, item, Link("https://a.example", null));
        var stored = (await world.Items.LoadLinksAsync(item.Id)).Single();

        await Assert.ThrowsAsync<DomainRuleException>(() => SaveLinksAsync(world, item,
            new ItemLinkInput(stored.Id, "https://a.example", null), new ItemLinkInput(stored.Id, "https://b.example", null)));
    }

    [Fact]
    public async Task Loading_links_of_a_deleted_item_fails_and_restoring_brings_them_back()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await SaveLinksAsync(world, item, Link("https://a.example", null));

        var batch = await world.Items.DeleteAsync(world.Project.Id, null, item.Id);
        await Assert.ThrowsAsync<DomainRuleException>(() => world.Items.LoadLinksAsync(item.Id));
        Assert.Equal(1, await CountLinksAsync(world));

        await world.Trash.RestoreAsync(batch);

        Assert.Equal(["https://a.example"], (await world.Items.LoadLinksAsync(item.Id)).Select(link => link.Url));
    }

    [Fact]
    public async Task Purging_an_item_removes_its_links_and_keeps_others()
    {
        await using var world = await UndoWorld.CreateAsync();
        var doomed = await world.Items.CreateAsync(world.Project.Id, null, null, "Doomed");
        var kept = await world.Items.CreateAsync(world.Project.Id, null, null, "Kept");
        await SaveLinksAsync(world, doomed, Link("https://a.example", null), Link("https://b.example", null));
        await SaveLinksAsync(world, kept, Link("https://c.example", null));
        var batch = await world.Items.DeleteAsync(world.Project.Id, null, doomed.Id);

        await world.Trash.PurgeAsync(batch);

        Assert.Equal(1, await CountLinksAsync(world));
        Assert.Equal(["https://c.example"], (await world.Items.LoadLinksAsync(kept.Id)).Select(link => link.Url));
    }

    [Fact]
    public async Task Purging_a_project_removes_the_links_of_all_its_items()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await SaveLinksAsync(world, item, Link("https://a.example", null));
        var batch = await world.Projects.DeleteAsync(world.Project.Id);

        await world.Trash.PurgeAsync(batch);

        Assert.Equal(0, await CountLinksAsync(world));
    }

    [Fact]
    public async Task Undo_and_redo_of_a_save_remove_and_restore_the_added_links()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await SaveLinksAsync(world, item, Link("https://a.example", "Aye"), Link("https://b.example", null));

        await world.History.UndoAsync();

        Assert.Empty(await world.Items.LoadLinksAsync(item.Id));
        Assert.Equal(["Create 'Task'", "Edit 'Task'"], world.Recorder.Descriptions);

        await world.History.RedoAsync();

        var restored = await world.Items.LoadLinksAsync(item.Id);
        Assert.Equal(["https://a.example", "https://b.example"], restored.Select(link => link.Url));
        Assert.Equal("Aye", restored[0].Title);
    }

    [Fact]
    public async Task Undo_of_a_removal_and_reorder_puts_the_old_links_back()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await SaveLinksAsync(world, item, Link("https://a.example", null), Link("https://b.example", null),
            Link("https://c.example", null));
        var before = await world.Items.LoadLinksAsync(item.Id);
        await SaveLinksAsync(world, item, new ItemLinkInput(before[2].Id, before[2].Url, null),
            new ItemLinkInput(before[0].Id, before[0].Url, null));

        await world.History.UndoAsync();

        var after = await world.Items.LoadLinksAsync(item.Id);
        Assert.Equal(before.Select(link => (link.Id, link.Url, link.SortOrder)), after.Select(link => (link.Id, link.Url, link.SortOrder)));
    }

    [Fact]
    public async Task Link_changes_and_field_changes_are_one_undo_step()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        var edit = new ItemEdit("Task", "New description", null, null, null, null, null, null, null);
        await world.Items.EditAsync(item.Id, edit, [], [Link("https://a.example", null)]);

        await world.History.UndoAsync();

        Assert.Empty(await world.Items.LoadLinksAsync(item.Id));
        Assert.Null((await world.ReadItemAsync(item.Id)).Description);
    }

    [Fact]
    public async Task Undo_is_refused_when_a_link_changed_since()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        await SaveLinksAsync(world, item, Link("https://a.example", null));
        await using (var database = world.OpenContext())
        {
            await database.Database.ExecuteSqlInterpolatedAsync($"UPDATE ItemLink SET Url = {"https://sneaky.example"}");
        }

        var exception = await Assert.ThrowsAsync<DomainRuleException>(() => world.History.UndoAsync());

        Assert.Equal("This item changed since; can't undo.", exception.Message);
    }

    [Fact]
    public async Task Link_urls_and_titles_are_searchable_with_the_link_field()
    {
        await using var world = await UndoWorld.CreateAsync();
        var first = await world.Items.CreateAsync(world.Project.Id, null, null, "First");
        var second = await world.Items.CreateAsync(world.Project.Id, null, null, "Second");
        await world.Items.CreateAsync(world.Project.Id, null, null, "Third");
        await SaveLinksAsync(world, first, Link("https://wiki.example.com/Schema", null));
        await SaveLinksAsync(world, second, Link("https://other.example", "Design Notes"));

        Assert.Equal(["First"], await SearchAsync(world, FilterOperator.Contains, new FilterValue.Text("WIKI")));
        Assert.Equal(["Second"], await SearchAsync(world, FilterOperator.Contains, new FilterValue.Text("design")));
        Assert.Equal(["First", "Second"], await SearchAsync(world, FilterOperator.IsNotEmpty, null));
        Assert.Equal(["Third"], await SearchAsync(world, FilterOperator.IsEmpty, null));
    }

    [Fact]
    public async Task Link_search_treats_wildcards_literally_and_ignores_deleted_items()
    {
        await using var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Task");
        var other = await world.Items.CreateAsync(world.Project.Id, null, null, "Other");
        await SaveLinksAsync(world, item, Link("https://a.example/a_b", null));
        await SaveLinksAsync(world, other, Link("https://a.example/axb", null));

        Assert.Equal(["Task"], await SearchAsync(world, FilterOperator.Contains, new FilterValue.Text("a_b")));

        await world.Items.DeleteAsync(world.Project.Id, null, item.Id);

        Assert.Equal(["Other"], await SearchAsync(world, FilterOperator.IsNotEmpty, null));
    }

    [Fact]
    public void The_link_field_offers_only_contains_and_emptiness()
    {
        var field = new SearchableField("link", "Links", TaskTracker.Core.Fields.FieldDataType.Text, null);

        Assert.Equal([FilterOperator.Contains, FilterOperator.IsEmpty, FilterOperator.IsNotEmpty], SearchOperators.For(field));
    }

    [Fact]
    public async Task Upgrading_from_the_previous_schema_adds_the_link_table_and_frees_the_link_key()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = TaskTrackerSqliteOptions.Configure(
            new DbContextOptionsBuilder<TaskTrackerDbContext>(), connection).Options;
        var projectId = Guid.CreateVersion7();
        var fieldId = Guid.CreateVersion7();
        var stamp = "2026-11-13 12:00:00";
        Guid itemId;

        await using (var old = new TaskTrackerDbContext(options))
        {
            await old.GetService<IMigrator>().MigrateAsync("20261115054310_AddSavedSearches");
            await old.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc) VALUES ({projectId}, {"Kept"}, {0}, {stamp}, {stamp})");
            itemId = (await new ItemService(new TestUnitOfWorkFactory(old), TimeProvider.System, TimeZoneInfo.Utc)
                .CreateAsync(projectId, null, null, "Existing item")).Id;
            await old.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, IsArchived, SortOrder) VALUES ({fieldId}, {"link"}, {"Link"}, {"Text"}, {false}, {0})");
            Assert.Equal(0, await CountTablesAsync(connection, "ItemLink"));
        }

        await using var upgraded = new TaskTrackerDbContext(options);
        await upgraded.Database.MigrateAsync();

        Assert.Equal(1, await CountTablesAsync(connection, "ItemLink"));
        Assert.Equal("Existing item", (await upgraded.TodoItems.SingleAsync(item => item.Id == itemId)).Title);
        Assert.Equal("link-2", (await upgraded.FieldDefinitions.SingleAsync(field => field.Id == fieldId)).Key);
        var items = new ItemService(new TestUnitOfWorkFactory(upgraded), TimeProvider.System, TimeZoneInfo.Utc);
        await items.EditAsync(itemId, EditOf("Existing item"), [], [Link("https://after.example", null)]);
        Assert.Single(await upgraded.ItemLinks.ToListAsync());
        Assert.Equal(4, await CountTriggersAsync(connection));
    }

    [Fact]
    public async Task The_link_migration_rewrites_field_references_and_preserves_quoted_text_and_other_scopes()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<TaskTrackerDbContext>().UseSqlite(connection).Options;
        await using var previous = new TaskTrackerDbContext(options);
        await previous.GetService<IMigrator>().MigrateAsync("20261114032356_AddCustomFields");
        var owner = await AddLegacyLinkFieldAsync(previous);
        await previous.GetService<IMigrator>().MigrateAsync("20261115054310_AddSavedSearches");
        const string query = """ "has:link" HAS:link no:" LiNk " link~wiki LiNk:"link~other" """;
        previous.SavedSearches.AddRange(
            SavedSearch.Create("Owner", new(query, new SearchScope.Area(owner, null, false), false), TimeProvider.System, 0),
            SavedSearch.Create("All", new(query, new SearchScope.AllProjects(), false), TimeProvider.System, 1),
            SavedSearch.Create("Other", new(query, new SearchScope.Project(Guid.CreateVersion7()), false), TimeProvider.System, 2));
        await previous.SaveChangesAsync();

        await using var upgraded = new TaskTrackerDbContext(options);
        await upgraded.Database.MigrateAsync();

        const string rewritten = """ "has:link" HAS:link-3 no:link-3 link-3~wiki link-3:"link~other" """;
        var searches = await upgraded.SavedSearches.ToDictionaryAsync(search => search.Name, search => search.QueryText);
        Assert.Equal(rewritten, searches["Owner"]);
        Assert.Equal(rewritten, searches["All"]);
        Assert.Equal(query, searches["Other"]);
    }

    private static async Task<Guid> AddLegacyLinkFieldAsync(TaskTrackerDbContext database)
    {
        var owner = Guid.CreateVersion7();
        var stamp = "2026-11-13 12:00:00";
        await database.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc) VALUES ({owner}, {"Owner"}, {0}, {stamp}, {stamp})");
        foreach (var key in new[] { "link", "link-2" })
        {
            await database.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO FieldDefinition (Id, Key, DisplayName, DataType, IsArchived, SortOrder, ProjectId) VALUES ({Guid.CreateVersion7()}, {key}, {key}, {"Text"}, {false}, {0}, {owner})");
        }

        return owner;
    }

    [Fact]
    public async Task The_foreign_key_cascades_a_direct_item_delete()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = await store.Projects(database).CreateAsync("P");
        var item = await store.Items(database).CreateAsync(project.Id, null, null, "T");
        await store.Items(database).EditAsync(item.Id, EditOf("T"), [], [Link("https://a.example", null)]);

        await database.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM TodoItem WHERE Id = {item.Id}");

        Assert.Equal(0, await database.ItemLinks.CountAsync());
    }

    private static ItemLinkInput Link(string url, string? title)
    {
        return new ItemLinkInput(null, url, title);
    }

    private static ItemEdit EditOf(string title)
    {
        return new ItemEdit(title, null, null, null, null, null, null, null, null);
    }

    private static async Task SaveLinksAsync(UndoWorld world, TodoItem item, params ItemLinkInput[] links)
    {
        var title = (await world.ReadItemAsync(item.Id)).Title;
        await world.Items.EditAsync(item.Id, EditOf(title), [], links);
    }

    private static async Task<int> CountLinksAsync(UndoWorld world)
    {
        await using var database = world.OpenContext();
        return await database.ItemLinks.CountAsync();
    }

    private static async Task<List<string>> SearchAsync(UndoWorld world, FilterOperator op, FilterValue? value)
    {
        var filter = new FieldFilter("link", op, value);
        var results = await world.Search.SearchAsync(new ItemQuery(new SearchScope.AllProjects(), null, [filter], true));

        return results.Items.Select(item => item.Title).OrderBy(title => title).ToList();
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