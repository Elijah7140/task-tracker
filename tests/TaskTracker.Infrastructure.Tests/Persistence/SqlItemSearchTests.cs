#pragma warning disable xUnit1051
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

public sealed class SqlItemSearchTests
{
    [Fact]
    public async Task Contains_treats_percent_and_underscore_as_literal_text()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        var literal = TodoItem.Create(project.Id, null, null, "ÉCOLE%_", store.Clock);
        var wildcardLookalike = TodoItem.Create(project.Id, null, null, "ÉCOLEab", store.Clock);
        database.Projects.Add(project);
        database.TodoItems.AddRange(literal, wildcardLookalike);
        await database.SaveChangesAsync();
        var search = CreateSearch(database);
        var filter = new FieldFilter("title", FilterOperator.Contains, new FilterValue.Text("%_"));
        var query = new ItemQuery(new SearchScope.AllProjects(), null, [filter], true);

        var results = await search.SearchAsync(query);

        Assert.Equal(literal.Id, Assert.Single(results.Items).ItemId);
    }

    [Fact]
    public async Task Scheduled_filters_handle_minimum_and_maximum_dates()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        var earliest = TodoItem.Create(project.Id, null, null, "Earliest", store.Clock);
        var latest = TodoItem.Create(project.Id, null, null, "Latest", store.Clock);
        earliest.SetSchedule(DateOnly.MinValue.ToDateTime(TimeOnly.MinValue), null, store.Clock);
        latest.SetSchedule(DateOnly.MaxValue.ToDateTime(TimeOnly.MaxValue), null, store.Clock);
        database.Projects.Add(project);
        database.TodoItems.AddRange(earliest, latest);
        await database.SaveChangesAsync();
        var search = CreateSearch(database);

        await AssertScheduledAsync(search, FilterOperator.Equals,
            new FilterValue.Date(DateOnly.MaxValue), "Latest");
        await AssertScheduledAsync(search, FilterOperator.LessThan,
            new FilterValue.Date(DateOnly.MaxValue), "Earliest");
        await AssertScheduledAsync(search, FilterOperator.Between,
            new FilterValue.DateRange(DateOnly.MinValue, DateOnly.MaxValue), "Earliest,Latest");
        await AssertScheduledAsync(search, FilterOperator.Equals,
            new FilterValue.Date(DateOnly.MinValue), "Earliest");
        await AssertScheduledAsync(search, FilterOperator.LessThan,
            new FilterValue.Date(DateOnly.MinValue), "");
    }

    private static async Task AssertScheduledAsync(ItemSearchService search, FilterOperator operation,
        FilterValue value, string expected)
    {
        var filter = new FieldFilter("scheduled", operation, value);
        var query = new ItemQuery(new SearchScope.AllProjects(), null, [filter], true);

        var results = await search.SearchAsync(query);

        var expectedTitles = expected.Length == 0 ? [] : expected.Split(',');
        Assert.Equal(expectedTitles, results.Items.Select(item => item.Title));
    }

    [Fact]
    public async Task Unicode_text_filters_fold_title_ticket_and_custom_values()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        var matching = TodoItem.Create(project.Id, null, null, "ÉCOLE", store.Clock);
        var different = TodoItem.Create(project.Id, null, null, "Other", store.Clock);
        var missing = TodoItem.Create(project.Id, null, null, "Missing", store.Clock);
        matching.SetTicketNumber("ÉCOLE-1", store.Clock);
        different.SetTicketNumber("OTHER-1", store.Clock);
        var field = FieldDefinition.Create("Note", FieldDataType.Text, null, 0, []);
        database.Projects.Add(project);
        database.TodoItems.AddRange(matching, different, missing);
        database.FieldDefinitions.Add(field);
        database.ItemFieldValues.Add(ItemFieldValue.Create(matching.Id,
            new FieldValueInput(field.Id, TextValue: "ÉCOLE")));
        database.ItemFieldValues.Add(ItemFieldValue.Create(different.Id,
            new FieldValueInput(field.Id, TextValue: "Other")));
        await database.SaveChangesAsync();
        var search = CreateSearch(database);

        foreach (var key in new[] { "title", "ticket", field.Key })
        {
            await AssertUnicodeMatchesAsync(search, key, matching.Id, different.Id, missing.Id);
        }
    }

    [Fact]
    public async Task Text_filters_treat_every_greek_sigma_form_as_the_same_letter()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        var greek = TodoItem.Create(project.Id, null, null, "ΟΣ", store.Clock);
        database.Projects.Add(project);
        database.TodoItems.Add(greek);
        await database.SaveChangesAsync();
        var search = CreateSearch(database);
        var scope = new SearchScope.AllProjects();
        var equals = new FieldFilter("title", FilterOperator.Equals, new FilterValue.Text("ος"));
        var notEquals = new FieldFilter("title", FilterOperator.NotEquals, new FilterValue.Text("ος"));
        var contains = new FieldFilter("title", FilterOperator.Contains, new FilterValue.Text("ς"));

        var equalRows = await search.SearchAsync(new ItemQuery(scope, null, [equals], true));
        var differentRows = await search.SearchAsync(new ItemQuery(scope, null, [notEquals], true));
        var containedRows = await search.SearchAsync(new ItemQuery(scope, null, [contains], true));

        Assert.Equal(greek.Id, Assert.Single(equalRows.Items).ItemId);
        Assert.Empty(differentRows.Items);
        Assert.Equal(greek.Id, Assert.Single(containedRows.Items).ItemId);
    }

    [Fact]
    public async Task Search_results_carry_every_projected_item_property()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Billing", store.Clock);
        var folder = Folder.Create(project.Id, null, "Tables", store.Clock);
        var parent = TodoItem.Create(project.Id, folder.Id, null, "Parent", store.Clock);
        var child = TodoItem.Create(project.Id, folder.Id, parent.Id, "Child", store.Clock);
        var itemType = ItemType.Create("Kind", 0);
        var priority = PriorityLevel.Create("Rank", 0);
        var dueTime = new TimeOnly(9, 30, 15).Add(TimeSpan.FromTicks(1234567));
        child.SetTicketNumber("OPS-42", store.Clock);
        child.SetLookups(itemType.Id, priority.Id, store.Clock);
        child.SetDue(new DateOnly(2026, 11, 20), dueTime, store.Clock);
        child.SetCompletion(store.Clock.GetUtcNow().UtcDateTime, store.Clock);
        database.Projects.Add(project);
        database.Folders.Add(folder);
        database.ItemTypes.Add(itemType);
        database.PriorityLevels.Add(priority);
        database.TodoItems.AddRange(parent, child);
        await database.SaveChangesAsync();
        var filter = new FieldFilter("ticket", FilterOperator.Equals, new FilterValue.Text("OPS-42"));
        var query = new ItemQuery(new SearchScope.AllProjects(), null, [filter], true);

        var results = await CreateSearch(database).SearchAsync(query);

        var expected = new ItemSearchResult(child.Id, project.Id, "Billing", folder.Id, parent.Id,
            "Child", "OPS-42", itemType.Id, priority.Id, new DateOnly(2026, 11, 20), dueTime, true);
        Assert.Equal(expected, Assert.Single(results.Items));
    }

    private static async Task AssertUnicodeMatchesAsync(ItemSearchService search, string key,
        Guid matchingId, Guid differentId, Guid missingId)
    {
        var expectedText = key == "ticket" ? "école-1" : "école";
        var equals = new FieldFilter(key, FilterOperator.Equals, new FilterValue.Text(expectedText));
        var notEquals = new FieldFilter(key, FilterOperator.NotEquals, new FilterValue.Text(expectedText));
        var contains = new FieldFilter(key, FilterOperator.Contains, new FilterValue.Text("COL"));
        var scope = new SearchScope.AllProjects();

        var equalRows = await search.SearchAsync(new ItemQuery(scope, null, [equals], true));
        var differentRows = await search.SearchAsync(new ItemQuery(scope, null, [notEquals], true));
        var containedRows = await search.SearchAsync(new ItemQuery(scope, null, [contains], true));

        Assert.True(equalRows.Items.Count == 1, $"Equals did not match {key}.");
        Assert.Equal(matchingId, equalRows.Items[0].ItemId);
        Assert.Equal(matchingId, Assert.Single(containedRows.Items).ItemId);
        Assert.DoesNotContain(differentRows.Items, item => item.ItemId == matchingId);
        Assert.Contains(differentRows.Items, item => item.ItemId == differentId);

        if (key != "title")
        {
            Assert.DoesNotContain(differentRows.Items, item => item.ItemId == missingId);
        }
    }

    [Fact]
    public async Task Text_search_handles_diacritics_tickets_and_fts_syntax()
    {
        await using var scenario = await FtsScenario.CreateAsync();
        var query = new ItemQuery(new SearchScope.AllProjects(), "resume", [], true);

        var found = await scenario.Search.SearchAsync(query);
        var ticket = await scenario.Search.SearchAsync(query with { Text = "JIRA-1234" });
        var quoted = await scenario.Search.SearchAsync(query with { Text = "\"resume OR status:open\"" });
        var operators = await scenario.Search.SearchAsync(query with { Text = "* ( ) :" });

        Assert.Single(found.Items);
        Assert.Single(ticket.Items);
        Assert.Empty(quoted.Items);
        Assert.Single(operators.Items);
    }

    [Fact]
    public async Task Editing_and_soft_deleting_update_search_visibility()
    {
        await using var scenario = await FtsScenario.CreateAsync();
        scenario.Item.Rename("Changed", scenario.Clock);
        await scenario.SaveAsync();

        var oldTitle = await scenario.SearchTextAsync("resume");
        var newTitle = await scenario.SearchTextAsync("Chan");

        Assert.Empty(oldTitle.Items);
        Assert.Single(newTitle.Items);
        scenario.Item.Delete(Guid.CreateVersion7(), scenario.Clock);
        await scenario.SaveAsync();
        var deleted = await scenario.SearchTextAsync("Changed");

        Assert.Empty(deleted.Items);
        scenario.Item.Restore(scenario.Clock);
        await scenario.SaveAsync();
        var restored = await scenario.SearchTextAsync("Changed");
        Assert.Single(restored.Items);
    }

    [Fact]
    public async Task Search_triggers_exist_and_keep_rows_in_sync()
    {
        await using var scenario = await FtsScenario.CreateAsync();

        var triggers = await scenario.TriggerNamesAsync();

        Assert.Equal(["TodoItemSearchRow_Delete", "TodoItemSearch_Delete",
            "TodoItemSearch_Insert", "TodoItemSearch_Update"], triggers);
        Assert.Equal(1, await scenario.MappingRowCountAsync());
        Assert.Equal(1, await scenario.FtsRowCountAsync());
        scenario.Item.Rename("Updated", scenario.Clock);
        await scenario.SaveAsync();
        Assert.Single((await scenario.SearchTextAsync("Updated")).Items);
        Assert.Empty((await scenario.SearchTextAsync("Résumé")).Items);
        scenario.DeleteItem();
        await scenario.SaveAsync();
        Assert.Equal(0, await scenario.MappingRowCountAsync());
        Assert.Equal(0, await scenario.FtsRowCountAsync());
    }

    [Fact]
    public async Task Hard_delete_removes_mapping_and_fts_rows()
    {
        await using var scenario = await FtsScenario.CreateAsync();
        scenario.DeleteItem();
        await scenario.SaveAsync();

        var hardDeleted = await scenario.SearchTextAsync("resume");
        var mappingCount = await scenario.MappingRowCountAsync();
        var ftsCount = await scenario.FtsRowCountAsync();

        Assert.Empty(hardDeleted.Items);
        Assert.Equal(0, mappingCount);
        Assert.Equal(0, ftsCount);
    }

    [Fact]
    public async Task Vacuum_preserves_search_mapping_for_existing_items()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        var removed = TodoItem.Create(project.Id, null, null, "Removed", store.Clock);
        var survivor = TodoItem.Create(project.Id, null, null, "Surviving record", store.Clock);
        database.Projects.Add(project);
        database.TodoItems.AddRange(removed, survivor);
        await database.SaveChangesAsync();
        database.TodoItems.Remove(removed);
        await database.SaveChangesAsync();
        var rowIdBefore = await database.Database.SqlQuery<long>(
            $"SELECT RowId AS Value FROM TodoItemSearchRow WHERE ItemId = {survivor.Id}").SingleAsync();

        await database.Database.ExecuteSqlRawAsync("VACUUM");
        var search = CreateSearch(database);
        var results = await search.SearchAsync(new ItemQuery(new SearchScope.AllProjects(), "surviv", [], true));
        var rowIdAfter = await database.Database.SqlQuery<long>(
            $"SELECT RowId AS Value FROM TodoItemSearchRow WHERE ItemId = {survivor.Id}").SingleAsync();

        Assert.Single(results.Items);
        Assert.Equal(survivor.Id, results.Items[0].ItemId);
        Assert.Equal(rowIdBefore, rowIdAfter);
    }

    [Fact]
    public async Task Scopes_include_subitems_and_exclude_deleted_ancestors()
    {
        await using var areas = await AreaMatrix.CreateAsync();

        await areas.AssertTitlesAsync(new SearchScope.AllProjects(), true,
            "Child,Complete,Folder,Other project,Parent,Root,Sibling,Subitem");
        await areas.AssertTitlesAsync(new SearchScope.Project(areas.FirstProject.Id), true,
            "Child,Complete,Folder,Parent,Root,Sibling,Subitem");
        await areas.AssertTitlesAsync(new SearchScope.Area(areas.FirstProject.Id, null, false), true,
            "Complete,Root");
        await areas.AssertTitlesAsync(new SearchScope.Area(areas.FirstProject.Id, null, true), true,
            "Child,Complete,Folder,Parent,Root,Sibling,Subitem");
        await areas.AssertTitlesAsync(new SearchScope.Area(areas.FirstProject.Id, areas.Folder.Id, false), true,
            "Folder");
        await areas.AssertTitlesAsync(new SearchScope.Area(areas.FirstProject.Id, areas.Folder.Id, true), true,
            "Child,Folder,Parent,Subitem");
        await areas.AssertTitlesAsync(new SearchScope.AllProjects(), false,
            "Child,Folder,Other project,Parent,Root,Sibling,Subitem");
    }

    [Fact]
    public async Task Deleted_projects_and_status_filters_constrain_results()
    {
        await using var areas = await AreaMatrix.CreateAsync();
        var completed = new FieldFilter("status", FilterOperator.Equals, new FilterValue.Bool(true));
        var query = new ItemQuery(new SearchScope.AllProjects(), null, [completed], false);

        var hiddenCompleted = await areas.Search.SearchAsync(query);

        Assert.Empty(hiddenCompleted.Items);
        areas.OtherProject.Delete(Guid.CreateVersion7(), areas.Clock);
        await areas.SaveAsync();
        await areas.AssertTitlesAsync(new SearchScope.AllProjects(), true,
            "Child,Complete,Folder,Parent,Root,Sibling,Subitem");
    }

    [Fact]
    public async Task Equal_fts_scores_use_project_order_before_item_id()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var later = Project.Create("Later", store.Clock, 1);
        var earlier = Project.Create("Earlier", store.Clock, 0);
        var firstInserted = TodoItem.Create(later.Id, null, null, "Needle", store.Clock);
        var secondInserted = TodoItem.Create(earlier.Id, null, null, "Needle", store.Clock);
        database.Projects.AddRange(later, earlier);
        database.TodoItems.AddRange(firstInserted, secondInserted);
        await database.SaveChangesAsync();
        var search = CreateSearch(database);
        var query = new ItemQuery(new SearchScope.AllProjects(), "needle", [], true);

        var results = await search.SearchAsync(query, 1);

        Assert.True(results.HasMore);
        Assert.Equal(secondInserted.Id, Assert.Single(results.Items).ItemId);
    }

    [Fact]
    public async Task Text_rank_precedes_project_sort_order()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var firstProject = Project.Create("First", store.Clock, 0);
        var secondProject = Project.Create("Second", store.Clock, 1);
        var descriptionHit = TodoItem.Create(firstProject.Id, null, null, "Unrelated", store.Clock);
        descriptionHit.SetDescription("needle plus many extra unrelated words", store.Clock);
        var titleHit = TodoItem.Create(secondProject.Id, null, null, "Needle", store.Clock);
        database.Projects.AddRange(firstProject, secondProject);
        database.TodoItems.AddRange(descriptionHit, titleHit);
        await database.SaveChangesAsync();
        var search = CreateSearch(database);
        var query = new ItemQuery(new SearchScope.AllProjects(), "needle", [], true);

        var results = await search.SearchAsync(query);

        Assert.Equal([titleHit.Id, descriptionHit.Id], results.Items.Select(item => item.ItemId));
    }

    [Fact]
    public async Task Equal_titles_are_ordered_by_item_id()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        var first = TodoItem.Create(project.Id, null, null, "Same", store.Clock);
        var second = TodoItem.Create(project.Id, null, null, "same", store.Clock);
        database.Projects.Add(project);
        database.TodoItems.AddRange(second, first);
        await database.SaveChangesAsync();
        var search = CreateSearch(database);
        var query = new ItemQuery(new SearchScope.AllProjects(), null, [], true);

        var results = await search.SearchAsync(query);

        Assert.Equal(new[] { first.Id, second.Id }.Order(), results.Items.Select(item => item.ItemId));
    }

    [Fact]
    public async Task Result_limit_and_order_are_stable()
    {
        await using var areas = await AreaMatrix.CreateAsync();
        var query = new ItemQuery(new SearchScope.AllProjects(), null, [], true);

        var firstPage = await areas.Search.SearchAsync(query, 2);
        var secondPage = await areas.Search.SearchAsync(query, 2);

        Assert.True(firstPage.HasMore);
        Assert.Equal(2, firstPage.Items.Count);
        Assert.Equal(["Child", "Complete"], firstPage.Items.Select(item => item.Title));
        Assert.Equal(firstPage.Items.Select(item => item.ItemId), secondPage.Items.Select(item => item.ItemId));
    }

    [Fact]
    public async Task Built_in_text_filters_cover_every_allowed_operator()
    {
        await using var matrix = await SearchMatrix.CreateAsync();

        await matrix.AssertMatchesAsync("title", FilterOperator.Equals, new FilterValue.Text(" alpha "), "Alpha");
        await matrix.AssertMatchesAsync("title", FilterOperator.NotEquals, new FilterValue.Text("alpha"), "Beta,Gamma");
        await matrix.AssertMatchesAsync("title", FilterOperator.Contains, new FilterValue.Text("LPH"), "Alpha");
        await matrix.AssertMatchesAsync("title", FilterOperator.IsEmpty, null, "");
        await matrix.AssertMatchesAsync("title", FilterOperator.IsNotEmpty, null, "Alpha,Beta,Gamma");
        await matrix.AssertMatchesAsync("ticket", FilterOperator.Equals, new FilterValue.Text("jira-1234"), "Alpha");
        await matrix.AssertMatchesAsync("ticket", FilterOperator.NotEquals, new FilterValue.Text("jira-1234"), "Beta");
        await matrix.AssertMatchesAsync("ticket", FilterOperator.Contains, new FilterValue.Text("OPS"), "Beta");
        await matrix.AssertMatchesAsync("ticket", FilterOperator.IsEmpty, null, "Gamma");
        await matrix.AssertMatchesAsync("ticket", FilterOperator.IsNotEmpty, null, "Alpha,Beta");
    }

    [Fact]
    public async Task Date_filters_cover_due_scheduled_and_custom_values()
    {
        await using var matrix = await SearchMatrix.CreateAsync();

        foreach (var field in new[] { "due", "scheduled", matrix.Reviewed.Key })
        {
            var first = field == "due" ? new DateOnly(2026, 11, 20)
                : field == "scheduled" ? new DateOnly(2026, 11, 21) : new DateOnly(2026, 11, 22);
            var second = first.AddDays(10);
            await matrix.AssertMatchesAsync(field, FilterOperator.Equals, new FilterValue.Date(first), "Alpha");
            await matrix.AssertMatchesAsync(field, FilterOperator.NotEquals, new FilterValue.Date(first), "Beta");
            await matrix.AssertMatchesAsync(field, FilterOperator.GreaterThan, new FilterValue.Date(first), "Beta");
            await matrix.AssertMatchesAsync(field, FilterOperator.LessThan, new FilterValue.Date(second), "Alpha");
            await matrix.AssertMatchesAsync(field, FilterOperator.Between,
                new FilterValue.DateRange(first, second), "Alpha,Beta");
            await matrix.AssertMatchesAsync(field, FilterOperator.IsEmpty, null, "Gamma");
            await matrix.AssertMatchesAsync(field, FilterOperator.IsNotEmpty, null, "Alpha,Beta");
        }
    }

    [Fact]
    public async Task Custom_number_filters_cover_every_allowed_operator()
    {
        await using var matrix = await SearchMatrix.CreateAsync();
        var key = matrix.Estimate.Key;

        await matrix.AssertMatchesAsync(key, FilterOperator.Equals, new FilterValue.Number(3.5), "Alpha");
        await matrix.AssertMatchesAsync(key, FilterOperator.NotEquals, new FilterValue.Number(3.5), "Beta");
        await matrix.AssertMatchesAsync(key, FilterOperator.GreaterThan, new FilterValue.Number(3.5), "Beta");
        await matrix.AssertMatchesAsync(key, FilterOperator.LessThan, new FilterValue.Number(8.5), "Alpha");
        await matrix.AssertMatchesAsync(key, FilterOperator.Between, new FilterValue.NumberRange(3.5, 8.5), "Alpha,Beta");
        await matrix.AssertMatchesAsync(key, FilterOperator.IsEmpty, null, "Gamma");
        await matrix.AssertMatchesAsync(key, FilterOperator.IsNotEmpty, null, "Alpha,Beta");
    }

    [Fact]
    public async Task Boolean_filters_cover_status_and_custom_values()
    {
        await using var matrix = await SearchMatrix.CreateAsync();

        await matrix.AssertMatchesAsync("status", FilterOperator.Equals, new FilterValue.Bool(true), "Alpha");
        await matrix.AssertMatchesAsync("status", FilterOperator.NotEquals, new FilterValue.Bool(true), "Beta,Gamma");
        await matrix.AssertMatchesAsync("status", FilterOperator.IsEmpty, null, "");
        await matrix.AssertMatchesAsync("status", FilterOperator.IsNotEmpty, null, "Alpha,Beta,Gamma");
        await matrix.AssertMatchesAsync(matrix.Approved.Key, FilterOperator.Equals, new FilterValue.Bool(true), "Alpha");
        await matrix.AssertMatchesAsync(matrix.Approved.Key, FilterOperator.NotEquals, new FilterValue.Bool(true), "Beta");
        await matrix.AssertMatchesAsync(matrix.Approved.Key, FilterOperator.IsEmpty, null, "Gamma");
        await matrix.AssertMatchesAsync(matrix.Approved.Key, FilterOperator.IsNotEmpty, null, "Alpha,Beta");
    }

    [Fact]
    public async Task Choice_filters_cover_type_priority_and_custom_values()
    {
        await using var matrix = await SearchMatrix.CreateAsync();

        await matrix.AssertChoiceOperatorsAsync("type", matrix.TypeA.Id);
        await matrix.AssertChoiceOperatorsAsync("priority", matrix.PriorityA.Id);
        await matrix.AssertChoiceOperatorsAsync(matrix.Category.Key, matrix.ChoiceA.Id);
        await matrix.AssertMatchesAsync("priority", FilterOperator.GreaterThan,
            new FilterValue.Choice(matrix.PriorityB.Id), "Alpha");
        await matrix.AssertMatchesAsync("priority", FilterOperator.LessThan,
            new FilterValue.Choice(matrix.PriorityA.Id), "Beta");
        await matrix.AssertMatchesAsync("priority", FilterOperator.Between,
            new FilterValue.ChoiceRange(matrix.PriorityA.Id, matrix.PriorityB.Id), "Alpha,Beta");
    }

    [Fact]
    public async Task Custom_text_filters_cover_every_allowed_operator()
    {
        await using var matrix = await SearchMatrix.CreateAsync();
        var key = matrix.Note.Key;

        await matrix.AssertMatchesAsync(key, FilterOperator.Equals, new FilterValue.Text(" RED "), "Alpha");
        await matrix.AssertMatchesAsync(key, FilterOperator.NotEquals, new FilterValue.Text("red"), "Beta");
        await matrix.AssertMatchesAsync(key, FilterOperator.Contains, new FilterValue.Text("LU"), "Beta");
        await matrix.AssertMatchesAsync(key, FilterOperator.IsEmpty, null, "Gamma");
        await matrix.AssertMatchesAsync(key, FilterOperator.IsNotEmpty, null, "Alpha,Beta");
    }

    [Fact]
    public async Task Date_and_number_ranges_compare_in_sqlite()
    {
        await using var matrix = await SearchMatrix.CreateAsync();
        var filters = new FieldFilter[]
        {
            new("due", FilterOperator.LessThan, new FilterValue.Date(new DateOnly(2026, 11, 30))),
            new("scheduled", FilterOperator.Equals, new FilterValue.Date(new DateOnly(2026, 11, 21))),
            new(matrix.Estimate.Key, FilterOperator.Between, new FilterValue.NumberRange(3, 4)),
            new(matrix.Reviewed.Key, FilterOperator.GreaterThan, new FilterValue.Date(new DateOnly(2026, 11, 20)))
        };

        var results = await matrix.Search.SearchAsync(
            new ItemQuery(new SearchScope.AllProjects(), null, filters, true));

        Assert.Single(results.Items);
        Assert.Equal("Alpha", results.Items[0].Title);
    }

    [Fact]
    public async Task Priority_comparison_follows_current_rank()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        var urgent = PriorityLevel.Create("Urgent", 0);
        var routine = PriorityLevel.Create("Routine", 1);
        var item = TodoItem.Create(project.Id, null, null, "Work", store.Clock);
        item.SetLookups(null, urgent.Id, store.Clock);
        database.Projects.Add(project);
        database.PriorityLevels.AddRange(urgent, routine);
        database.TodoItems.Add(item);
        await database.SaveChangesAsync();
        var search = CreateSearch(database);
        var filter = new FieldFilter("priority", FilterOperator.GreaterThan, new FilterValue.Choice(routine.Id));
        var query = new ItemQuery(new SearchScope.AllProjects(), null, [filter], true);

        var before = await search.SearchAsync(query);

        Assert.Single(before.Items);
        urgent.Reorder(1);
        routine.Reorder(0);
        await database.SaveChangesAsync();

        var after = await search.SearchAsync(query);

        Assert.Empty(after.Items);
    }

    [Fact]
    public async Task Migration_renames_reserved_custom_keys_without_registry_duplicates()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = TaskTrackerSqliteOptions.Configure(
            new DbContextOptionsBuilder<TaskTrackerDbContext>(), connection).Options;
        await using (var phaseThree = new TaskTrackerDbContext(options))
        {
            await phaseThree.GetService<IMigrator>().MigrateAsync("20261114032356_AddCustomFields");
            var title = FieldDefinition.Create("Title", FieldDataType.Text, null, 0, []);
            var existing = FieldDefinition.Create("Title 2", FieldDataType.Text, null, 1, [title.Key]);
            phaseThree.FieldDefinitions.AddRange(title, existing);
            await phaseThree.SaveChangesAsync();
        }

        await using var upgraded = new TaskTrackerDbContext(options);
        await upgraded.Database.MigrateAsync();
        var registry = new FieldRegistry(new TestUnitOfWorkFactory(upgraded));

        var fields = await registry.GetFieldsAsync(new SearchScope.AllProjects());

        Assert.Contains(fields, field => field.Key == "title-3");
        Assert.Equal(fields.Count, fields.Select(field => field.Key).Distinct().Count());
    }

    [Fact]
    public async Task Migration_indexes_items_created_before_search_was_installed()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<TaskTrackerDbContext>()
            .UseSqlite(connection).Options;
        var projectId = Guid.CreateVersion7();
        var itemId = Guid.CreateVersion7();
        var stamp = "2026-11-13 12:00:00";
        await using (var phaseThree = new TaskTrackerDbContext(options))
        {
            await phaseThree.GetService<IMigrator>().MigrateAsync("20261114032356_AddCustomFields");
            await phaseThree.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO Project (Id, Name, SortOrder, CreatedAtUtc, UpdatedAtUtc) VALUES ({projectId}, {"Existing"}, {0}, {stamp}, {stamp})");
            await phaseThree.Database.ExecuteSqlInterpolatedAsync(
                $"INSERT INTO TodoItem (Id, ProjectId, Title, SortOrder, CreatedAtUtc, UpdatedAtUtc) VALUES ({itemId}, {projectId}, {"Legacy ticket"}, {0}, {stamp}, {stamp})");
        }

        await using var upgraded = new TaskTrackerDbContext(options);
        await upgraded.Database.MigrateAsync();
        var search = CreateSearch(upgraded);

        var results = await search.SearchAsync(new ItemQuery(new SearchScope.AllProjects(), "legacy", [], true));

        Assert.Single(results.Items);
        Assert.Equal(itemId, results.Items[0].ItemId);
    }

    [Fact]
    public async Task Custom_number_filter_uses_typed_value_and_excludes_missing_rows()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        var first = TodoItem.Create(project.Id, null, null, "First", store.Clock);
        var second = TodoItem.Create(project.Id, null, null, "Second", store.Clock);
        var field = FieldDefinition.Create("Estimate", FieldDataType.Number, null, 0, []);
        database.Projects.Add(project);
        database.TodoItems.AddRange(first, second);
        database.FieldDefinitions.Add(field);
        database.ItemFieldValues.Add(ItemFieldValue.Create(first.Id, new FieldValueInput(field.Id, NumberValue: 3)));
        await database.SaveChangesAsync();
        var search = CreateSearch(database);
        var filter = new FieldFilter(field.Key, FilterOperator.NotEquals, new FilterValue.Number(2));

        var results = await search.SearchAsync(new ItemQuery(new SearchScope.AllProjects(), null, [filter], true));

        Assert.Single(results.Items);
        Assert.Equal(first.Id, results.Items[0].ItemId);
    }

    private static ItemSearchService CreateSearch(TaskTrackerDbContext database)
    {
        var factory = new TestUnitOfWorkFactory(database);
        var validator = new ItemQueryValidator(factory);
        return new ItemSearchService(factory, validator);
    }

    private sealed class FtsScenario : IAsyncDisposable
    {
        private readonly SqliteTestStore store = new();

        private TaskTrackerDbContext database = null!;

        public TodoItem Item { get; private set; } = null!;

        public ItemSearchService Search { get; private set; } = null!;

        public TimeProvider Clock => store.Clock;

        public static async Task<FtsScenario> CreateAsync()
        {
            var scenario = new FtsScenario();
            await scenario.store.InitializeAsync();
            scenario.database = scenario.store.Open();
            var project = Project.Create("Project", scenario.store.Clock);
            scenario.Item = TodoItem.Create(project.Id, null, null,
                "Résumé JIRA-1234", scenario.store.Clock);
            scenario.database.Projects.Add(project);
            scenario.database.TodoItems.Add(scenario.Item);
            await scenario.database.SaveChangesAsync();
            scenario.Search = CreateSearch(scenario.database);
            return scenario;
        }

        public Task<ItemSearchResults> SearchTextAsync(string text)
        {
            var query = new ItemQuery(new SearchScope.AllProjects(), text, [], true);
            return Search.SearchAsync(query);
        }

        public void DeleteItem()
        {
            database.TodoItems.Remove(Item);
        }

        public Task SaveAsync()
        {
            return database.SaveChangesAsync();
        }

        public Task<int> MappingRowCountAsync()
        {
            return database.Database.SqlQueryRaw<int>(
                "SELECT COUNT(*) AS Value FROM TodoItemSearchRow").SingleAsync();
        }

        public Task<int> FtsRowCountAsync()
        {
            return database.Database.SqlQueryRaw<int>(
                "SELECT COUNT(*) AS Value FROM TodoItemSearch").SingleAsync();
        }

        public Task<List<string>> TriggerNamesAsync()
        {
            return database.Database.SqlQueryRaw<string>(
                "SELECT name AS Value FROM sqlite_master WHERE type = 'trigger' "
                + "AND name LIKE 'TodoItemSearch%' ORDER BY name").ToListAsync();
        }

        public async ValueTask DisposeAsync()
        {
            await database.DisposeAsync();
            await store.DisposeAsync();
        }
    }

    private sealed class SearchMatrix : IAsyncDisposable
    {
        private readonly SqliteTestStore store = new();

        private TaskTrackerDbContext database = null!;

        public ItemSearchService Search { get; private set; } = null!;

        public FieldDefinition Note { get; private set; } = null!;

        public FieldDefinition Estimate { get; private set; } = null!;

        public FieldDefinition Reviewed { get; private set; } = null!;

        public FieldDefinition Approved { get; private set; } = null!;

        public FieldDefinition Category { get; private set; } = null!;

        public FieldChoice ChoiceA { get; private set; } = null!;

        public ItemType TypeA { get; private set; } = null!;

        private ItemType TypeB { get; set; } = null!;

        public PriorityLevel PriorityA { get; private set; } = null!;

        public PriorityLevel PriorityB { get; private set; } = null!;

        public static async Task<SearchMatrix> CreateAsync()
        {
            var matrix = new SearchMatrix();
            await matrix.store.InitializeAsync();
            matrix.database = matrix.store.Open();
            matrix.SeedItems();
            matrix.SeedFields();
            await matrix.database.SaveChangesAsync();
            matrix.Search = CreateSearch(matrix.database);
            return matrix;
        }

        public async Task AssertMatchesAsync(string key, FilterOperator operation,
            FilterValue? value, string expected)
        {
            var filter = new FieldFilter(key, operation, value);
            var query = new ItemQuery(new SearchScope.AllProjects(), null, [filter], true);

            var results = await Search.SearchAsync(query);

            var titles = results.Items.Select(item => item.Title).Order(StringComparer.Ordinal).ToArray();
            var expectedTitles = expected.Length == 0 ? [] : expected.Split(',');
            Assert.Equal(expectedTitles, titles);
        }

        public async Task AssertChoiceOperatorsAsync(string key, Guid firstChoiceId)
        {
            await AssertMatchesAsync(key, FilterOperator.Equals, new FilterValue.Choice(firstChoiceId), "Alpha");
            await AssertMatchesAsync(key, FilterOperator.NotEquals, new FilterValue.Choice(firstChoiceId), "Beta");
            await AssertMatchesAsync(key, FilterOperator.IsEmpty, null, "Gamma");
            await AssertMatchesAsync(key, FilterOperator.IsNotEmpty, null, "Alpha,Beta");
        }

        public async ValueTask DisposeAsync()
        {
            await database.DisposeAsync();
            await store.DisposeAsync();
        }

        private void SeedItems()
        {
            var project = Project.Create("Matrix", store.Clock);
            SeedLookups();
            var alpha = TodoItem.Create(project.Id, null, null, "Alpha", store.Clock);
            var beta = TodoItem.Create(project.Id, null, null, "Beta", store.Clock);
            var gamma = TodoItem.Create(project.Id, null, null, "Gamma", store.Clock);
            alpha.SetTicketNumber("JIRA-1234", store.Clock);
            beta.SetTicketNumber("OPS-9", store.Clock);
            alpha.SetLookups(TypeA.Id, PriorityA.Id, store.Clock);
            beta.SetLookups(TypeB.Id, PriorityB.Id, store.Clock);
            alpha.SetDue(new DateOnly(2026, 11, 20), null, store.Clock);
            beta.SetDue(new DateOnly(2026, 11, 30), null, store.Clock);
            alpha.SetSchedule(new DateTime(2026, 11, 21, 10, 0, 0), null, store.Clock);
            beta.SetSchedule(new DateTime(2026, 12, 1, 10, 0, 0), null, store.Clock);
            alpha.SetCompletion(store.Clock.GetUtcNow().UtcDateTime, store.Clock);
            database.Projects.Add(project);
            database.TodoItems.AddRange(alpha, beta, gamma);
            Items = (alpha, beta);
        }

        private void SeedLookups()
        {
            TypeA = ItemType.Create("Type A", 0);
            TypeB = ItemType.Create("Type B", 1);
            PriorityA = PriorityLevel.Create("Priority A", 0);
            PriorityB = PriorityLevel.Create("Priority B", 1);
            database.ItemTypes.AddRange(TypeA, TypeB);
            database.PriorityLevels.AddRange(PriorityA, PriorityB);
        }

        private (TodoItem Alpha, TodoItem Beta) Items { get; set; }

        private void SeedFields()
        {
            CreateDefinitions();
            AddFieldValues();
        }

        private void CreateDefinitions()
        {
            Note = FieldDefinition.Create("Note", FieldDataType.Text, null, 0, []);
            Estimate = FieldDefinition.Create("Estimate", FieldDataType.Number, null, 1, [Note.Key]);
            Reviewed = FieldDefinition.Create("Reviewed", FieldDataType.Date, null, 2, [Note.Key, Estimate.Key]);
            Approved = FieldDefinition.Create("Approved", FieldDataType.Boolean, null, 3,
                [Note.Key, Estimate.Key, Reviewed.Key]);
            Category = FieldDefinition.Create("Category", FieldDataType.Choice, null, 4,
                [Note.Key, Estimate.Key, Reviewed.Key, Approved.Key]);
            ChoiceA = FieldChoice.Create(Category.Id, "A", 0);
            var choiceB = FieldChoice.Create(Category.Id, "B", 1);
            database.FieldDefinitions.AddRange(Note, Estimate, Reviewed, Approved, Category);
            database.FieldChoices.AddRange(ChoiceA, choiceB);
            ChoiceB = choiceB;
        }

        private FieldChoice ChoiceB { get; set; } = null!;

        private void AddFieldValues()
        {
            AddValue(Items.Alpha.Id, Note.Id, text: "red");
            AddValue(Items.Beta.Id, Note.Id, text: "blue");
            AddValue(Items.Alpha.Id, Estimate.Id, number: 3.5);
            AddValue(Items.Beta.Id, Estimate.Id, number: 8.5);
            AddValue(Items.Alpha.Id, Reviewed.Id, date: new DateOnly(2026, 11, 22));
            AddValue(Items.Beta.Id, Reviewed.Id, date: new DateOnly(2026, 12, 2));
            AddValue(Items.Alpha.Id, Approved.Id, boolean: true);
            AddValue(Items.Beta.Id, Approved.Id, boolean: false);
            AddValue(Items.Alpha.Id, Category.Id, choiceId: ChoiceA.Id);
            AddValue(Items.Beta.Id, Category.Id, choiceId: ChoiceB.Id);
        }

        private void AddValue(Guid itemId, Guid fieldId, string? text = null, double? number = null,
            DateOnly? date = null, bool? boolean = null, Guid? choiceId = null)
        {
            var input = new FieldValueInput(fieldId, text, number, date, boolean, choiceId);
            database.ItemFieldValues.Add(ItemFieldValue.Create(itemId, input));
        }
    }

    private sealed class AreaMatrix : IAsyncDisposable
    {
        private readonly SqliteTestStore store = new();

        private TaskTrackerDbContext database = null!;

        public Project FirstProject { get; private set; } = null!;

        public Project OtherProject { get; private set; } = null!;

        public Folder Folder { get; private set; } = null!;

        public TimeProvider Clock => store.Clock;

        public ItemSearchService Search { get; private set; } = null!;

        public static async Task<AreaMatrix> CreateAsync()
        {
            var areas = new AreaMatrix();
            await areas.store.InitializeAsync();
            areas.database = areas.store.Open();
            areas.SeedProjectsAndFolders();
            areas.SeedItems();
            await areas.database.SaveChangesAsync();
            areas.Search = CreateSearch(areas.database);
            return areas;
        }

        public async Task AssertTitlesAsync(SearchScope scope, bool includeCompleted, string expected)
        {
            var query = new ItemQuery(scope, null, [], includeCompleted);

            var results = await Search.SearchAsync(query);

            var titles = results.Items.Select(item => item.Title).Order(StringComparer.Ordinal).ToArray();
            Assert.Equal(expected.Split(','), titles);
        }

        public async Task SaveAsync()
        {
            await database.SaveChangesAsync();
        }

        public async ValueTask DisposeAsync()
        {
            await database.DisposeAsync();
            await store.DisposeAsync();
        }

        private Folder childFolder = null!;

        private Folder siblingFolder = null!;

        private Folder deletedFolder = null!;

        private void SeedProjectsAndFolders()
        {
            FirstProject = Project.Create("First", store.Clock, 0);
            OtherProject = Project.Create("Second", store.Clock, 1);
            Folder = Folder.Create(FirstProject.Id, null, "Main", store.Clock);
            childFolder = Folder.Create(FirstProject.Id, Folder.Id, "Nested", store.Clock);
            siblingFolder = Folder.Create(FirstProject.Id, null, "Sibling", store.Clock);
            deletedFolder = Folder.Create(FirstProject.Id, null, "Deleted", store.Clock);
            deletedFolder.Delete(Guid.CreateVersion7(), store.Clock);
            database.Projects.AddRange(FirstProject, OtherProject);
            database.Folders.AddRange(Folder, childFolder, siblingFolder, deletedFolder);
        }

        private void SeedItems()
        {
            AddItem(FirstProject.Id, null, null, "Root");
            var completed = AddItem(FirstProject.Id, null, null, "Complete");
            completed.SetCompletion(store.Clock.GetUtcNow().UtcDateTime, store.Clock);
            AddItem(FirstProject.Id, Folder.Id, null, "Folder");
            AddItem(FirstProject.Id, childFolder.Id, null, "Child");
            var parent = AddItem(FirstProject.Id, childFolder.Id, null, "Parent");
            AddItem(FirstProject.Id, childFolder.Id, parent.Id, "Subitem");
            AddItem(FirstProject.Id, siblingFolder.Id, null, "Sibling");
            AddItem(FirstProject.Id, deletedFolder.Id, null, "Hidden in folder");
            var deleted = AddItem(FirstProject.Id, null, null, "Deleted item");
            deleted.Delete(Guid.CreateVersion7(), store.Clock);
            AddItem(OtherProject.Id, null, null, "Other project");
        }

        private TodoItem AddItem(Guid projectId, Guid? folderId, Guid? parentId, string title)
        {
            var item = TodoItem.Create(projectId, folderId, parentId, title, store.Clock);
            database.TodoItems.Add(item);
            return item;
        }
    }

}