using TaskTracker.Core.Calendar;
using TaskTracker.Core.Items;
using TaskTracker.Core.Projects;
using TaskTracker.Infrastructure.Persistence;

namespace TaskTracker.Infrastructure.Tests.Persistence;

/// <summary>Calendar range and visibility behavior against SQLite.</summary>
public sealed class EfCalendarRepositoryTests
{
    [Fact]
    public async Task Range_includes_due_boundaries_and_overlapping_schedules()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        var first = TodoItem.Create(project.Id, null, null, "First", store.Clock);
        var last = TodoItem.Create(project.Id, null, null, "Last", store.Clock);
        var outside = TodoItem.Create(project.Id, null, null, "Outside", store.Clock);
        var spanning = TodoItem.Create(project.Id, null, null, "Spanning", store.Clock);
        var noEnd = TodoItem.Create(project.Id, null, null, "No end", store.Clock);
        first.SetDue(new DateOnly(2026, 11, 1), null, store.Clock);
        last.SetDue(new DateOnly(2026, 11, 30), new TimeOnly(8, 0), store.Clock);
        outside.SetDue(new DateOnly(2026, 12, 1), null, store.Clock);
        spanning.SetSchedule(new DateTime(2026, 10, 31, 22, 0, 0),
            new DateTime(2026, 11, 2, 2, 0, 0), store.Clock);
        noEnd.SetSchedule(new DateTime(2026, 10, 31, 23, 45, 0), null, store.Clock);
        database.Projects.Add(project);
        database.TodoItems.AddRange(first, last, outside, spanning, noEnd);
        await database.SaveChangesAsync(TestContext.Current.CancellationToken);
        var repository = new EfCalendarRepository(database);
        var query = new CalendarQuery(null, new DateOnly(2026, 11, 1), new DateOnly(2026, 12, 1), false);

        var entries = await repository.LoadAsync(query, TestContext.Current.CancellationToken);

        Assert.Equal(4, entries.Count);
        Assert.DoesNotContain(entries, entry => entry.Title == "Outside");
    }

    [Fact]
    public async Task Project_scope_and_completion_filter_apply_to_sub_items()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var selected = Project.Create("Selected", store.Clock);
        var other = Project.Create("Other", store.Clock);
        var parent = TodoItem.Create(selected.Id, null, null, "Parent", store.Clock);
        var child = TodoItem.Create(selected.Id, null, parent.Id, "Child", store.Clock);
        var completed = TodoItem.Create(selected.Id, null, null, "Completed", store.Clock);
        var otherItem = TodoItem.Create(other.Id, null, null, "Other item", store.Clock);
        child.SetDue(new DateOnly(2026, 11, 16), null, store.Clock);
        completed.SetDue(new DateOnly(2026, 11, 16), null, store.Clock);
        completed.SetCompletion(store.Clock.GetUtcNow().UtcDateTime, store.Clock);
        otherItem.SetDue(new DateOnly(2026, 11, 16), null, store.Clock);
        database.Projects.AddRange(selected, other);
        database.TodoItems.AddRange(parent, child, completed, otherItem);
        await database.SaveChangesAsync(TestContext.Current.CancellationToken);
        var repository = new EfCalendarRepository(database);
        var query = new CalendarQuery(selected.Id, new DateOnly(2026, 11, 16),
            new DateOnly(2026, 11, 17), false);

        var entries = await repository.LoadAsync(query, TestContext.Current.CancellationToken);

        Assert.Equal(child.Id, Assert.Single(entries).ItemId);
    }

    [Fact]
    public async Task Deleted_item_folder_and_project_are_excluded()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var activeProject = Project.Create("Active", store.Clock);
        var deletedProject = Project.Create("Deleted", store.Clock);
        var deletedFolder = Folder.Create(activeProject.Id, null, "Deleted folder", store.Clock);
        var active = TodoItem.Create(activeProject.Id, null, null, "Active", store.Clock);
        var deletedItem = TodoItem.Create(activeProject.Id, null, null, "Deleted item", store.Clock);
        var hiddenByFolder = TodoItem.Create(activeProject.Id, deletedFolder.Id, null, "Folder item", store.Clock);
        var hiddenByProject = TodoItem.Create(deletedProject.Id, null, null, "Project item", store.Clock);
        var date = new DateOnly(2026, 11, 16);

        foreach (var item in new[] { active, deletedItem, hiddenByFolder, hiddenByProject })
        {
            item.SetDue(date, null, store.Clock);
        }

        deletedItem.Delete(Guid.NewGuid(), store.Clock);
        deletedFolder.Delete(Guid.NewGuid(), store.Clock);
        deletedProject.Delete(Guid.NewGuid(), store.Clock);
        database.Projects.AddRange(activeProject, deletedProject);
        database.Folders.Add(deletedFolder);
        database.TodoItems.AddRange(active, deletedItem, hiddenByFolder, hiddenByProject);
        await database.SaveChangesAsync(TestContext.Current.CancellationToken);
        var repository = new EfCalendarRepository(database);
        var query = new CalendarQuery(null, date, date.AddDays(1), true);

        var entries = await repository.LoadAsync(query, TestContext.Current.CancellationToken);

        Assert.Equal(active.Id, Assert.Single(entries).ItemId);
    }

    [Fact]
    public async Task Due_date_on_the_exclusive_end_date_is_excluded_and_the_day_before_is_included()
    {
        await using var store = new SqliteTestStore();
        var range = new CalendarQuery(null, new DateOnly(2026, 11, 16), new DateOnly(2026, 11, 23), false);

        var titles = await LoadTitlesAsync(store, range, (project, clock) =>
        {
            var lastDay = TodoItem.Create(project.Id, null, null, "Last day", clock);
            var endDate = TodoItem.Create(project.Id, null, null, "End date", clock);
            lastDay.SetDue(new DateOnly(2026, 11, 22), null, clock);
            endDate.SetDue(new DateOnly(2026, 11, 23), null, clock);
            return [lastDay, endDate];
        });

        Assert.Equal(["Last day"], titles);
    }

    [Fact]
    public async Task Schedule_ending_exactly_at_the_range_start_is_excluded()
    {
        await using var store = new SqliteTestStore();
        var range = new CalendarQuery(null, new DateOnly(2026, 11, 16), new DateOnly(2026, 11, 17), false);

        var titles = await LoadTitlesAsync(store, range, (project, clock) =>
        {
            var endsAtStart = TodoItem.Create(project.Id, null, null, "Ends at start", clock);
            var endsAfterStart = TodoItem.Create(project.Id, null, null, "Ends after start", clock);
            var startsAtEnd = TodoItem.Create(project.Id, null, null, "Starts at end", clock);
            endsAtStart.SetSchedule(new DateTime(2026, 11, 15, 23, 0, 0), new DateTime(2026, 11, 16, 0, 0, 0), clock);
            endsAfterStart.SetSchedule(new DateTime(2026, 11, 15, 23, 0, 0), new DateTime(2026, 11, 16, 0, 1, 0), clock);
            startsAtEnd.SetSchedule(new DateTime(2026, 11, 17, 0, 0, 0), new DateTime(2026, 11, 17, 1, 0, 0), clock);
            return [endsAtStart, endsAfterStart, startsAtEnd];
        });

        Assert.Equal(["Ends after start"], titles);
    }

    [Fact]
    public async Task Zero_length_schedule_at_midnight_of_the_first_day_is_included()
    {
        await using var store = new SqliteTestStore();
        var range = new CalendarQuery(null, new DateOnly(2026, 11, 16), new DateOnly(2026, 11, 17), false);

        var titles = await LoadTitlesAsync(store, range, (project, clock) =>
        {
            var atMidnight = TodoItem.Create(project.Id, null, null, "At midnight", clock);
            var atNoon = TodoItem.Create(project.Id, null, null, "At noon", clock);
            var atNextMidnight = TodoItem.Create(project.Id, null, null, "At next midnight", clock);
            atMidnight.SetSchedule(new DateTime(2026, 11, 16, 0, 0, 0), new DateTime(2026, 11, 16, 0, 0, 0), clock);
            atNoon.SetSchedule(new DateTime(2026, 11, 16, 12, 0, 0), new DateTime(2026, 11, 16, 12, 0, 0), clock);
            atNextMidnight.SetSchedule(new DateTime(2026, 11, 17, 0, 0, 0), new DateTime(2026, 11, 17, 0, 0, 0), clock);
            return [atMidnight, atNoon, atNextMidnight];
        });

        Assert.Equal(["At midnight", "At noon"], titles.Order().ToArray());
    }

    [Fact]
    public async Task Schedule_without_end_reaching_into_the_range_by_its_default_length_is_included()
    {
        await using var store = new SqliteTestStore();
        var range = new CalendarQuery(null, new DateOnly(2026, 11, 16), new DateOnly(2026, 11, 17), false);

        var titles = await LoadTitlesAsync(store, range, (project, clock) =>
        {
            var reaches = TodoItem.Create(project.Id, null, null, "Reaches in", clock);
            var misses = TodoItem.Create(project.Id, null, null, "Misses", clock);
            reaches.SetSchedule(new DateTime(2026, 11, 15, 23, 45, 0), null, clock);
            misses.SetSchedule(new DateTime(2026, 11, 15, 23, 29, 0), null, clock);
            return [reaches, misses];
        });

        Assert.Equal(["Reaches in"], titles);
    }

    [Fact]
    public async Task Sub_item_deleted_together_with_its_parent_is_excluded()
    {
        await using var store = new SqliteTestStore();
        var range = new CalendarQuery(null, new DateOnly(2026, 11, 16), new DateOnly(2026, 11, 17), true);

        var titles = await LoadTitlesAsync(store, range, (project, clock) =>
        {
            var parent = TodoItem.Create(project.Id, null, null, "Parent", clock);
            var child = TodoItem.Create(project.Id, null, parent.Id, "Child", clock);
            var survivor = TodoItem.Create(project.Id, null, null, "Survivor", clock);
            var batch = Guid.NewGuid();
            child.SetDue(new DateOnly(2026, 11, 16), null, clock);
            survivor.SetDue(new DateOnly(2026, 11, 16), null, clock);
            parent.Delete(batch, clock);
            child.Delete(batch, clock);
            return [parent, child, survivor];
        });

        Assert.Equal(["Survivor"], titles);
    }

    [Fact]
    public async Task Item_with_a_due_date_and_a_schedule_produces_both_entries()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        var item = TodoItem.Create(project.Id, null, null, "Both", store.Clock);
        item.SetDue(new DateOnly(2026, 11, 16), new TimeOnly(17, 0), store.Clock);
        item.SetSchedule(new DateTime(2026, 11, 16, 9, 0, 0), new DateTime(2026, 11, 16, 10, 0, 0), store.Clock);
        database.Projects.Add(project);
        database.TodoItems.Add(item);
        await database.SaveChangesAsync(TestContext.Current.CancellationToken);
        var repository = new EfCalendarRepository(database);
        var query = new CalendarQuery(null, new DateOnly(2026, 11, 16), new DateOnly(2026, 11, 17), false);

        var entries = await repository.LoadAsync(query, TestContext.Current.CancellationToken);

        Assert.Equal(2, entries.Count);
        var due = Assert.Single(entries, entry => entry.Kind == CalendarEntryKind.Due);
        var scheduled = Assert.Single(entries, entry => entry.Kind == CalendarEntryKind.Scheduled);
        Assert.Equal(new TimeOnly(17, 0), due.StartTime);
        Assert.Equal(new TimeOnly(9, 0), scheduled.StartTime);
        Assert.All(entries, entry => Assert.Equal(item.Id, entry.ItemId));
    }

    [Fact]
    public async Task Item_due_inside_the_range_but_scheduled_outside_it_returns_only_the_due_entry()
    {
        await using var store = new SqliteTestStore();
        var range = new CalendarQuery(null, new DateOnly(2026, 11, 16), new DateOnly(2026, 11, 23), false);

        var entries = await LoadEntriesAsync(store, range, (project, clock) =>
        {
            var item = TodoItem.Create(project.Id, null, null, "Due now", clock);
            item.SetDue(new DateOnly(2026, 11, 18), null, clock);
            item.SetSchedule(new DateTime(2026, 1, 5, 9, 0, 0), new DateTime(2026, 1, 5, 10, 0, 0), clock);
            return [item];
        });

        Assert.Equal(CalendarEntryKind.Due, Assert.Single(entries).Kind);
    }

    [Fact]
    public async Task Item_scheduled_inside_the_range_but_due_outside_it_returns_only_the_scheduled_entry()
    {
        await using var store = new SqliteTestStore();
        var range = new CalendarQuery(null, new DateOnly(2026, 11, 16), new DateOnly(2026, 11, 23), false);

        var entries = await LoadEntriesAsync(store, range, (project, clock) =>
        {
            var item = TodoItem.Create(project.Id, null, null, "Scheduled now", clock);
            item.SetDue(new DateOnly(2027, 1, 15), null, clock);
            item.SetSchedule(new DateTime(2026, 11, 18, 9, 0, 0), new DateTime(2026, 11, 18, 10, 0, 0), clock);
            return [item];
        });

        Assert.Equal(CalendarEntryKind.Scheduled, Assert.Single(entries).Kind);
    }

    private static async Task<IReadOnlyList<CalendarEntry>> LoadEntriesAsync(SqliteTestStore store,
        CalendarQuery query, Func<Project, TimeProvider, TodoItem[]> createItems)
    {
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        database.Projects.Add(project);
        database.TodoItems.AddRange(createItems(project, store.Clock));
        await database.SaveChangesAsync(TestContext.Current.CancellationToken);
        var repository = new EfCalendarRepository(database);

        return await repository.LoadAsync(query, TestContext.Current.CancellationToken);
    }

    private static async Task<string[]> LoadTitlesAsync(SqliteTestStore store, CalendarQuery query,
        Func<Project, TimeProvider, TodoItem[]> createItems)
    {
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = Project.Create("Project", store.Clock);
        database.Projects.Add(project);
        database.TodoItems.AddRange(createItems(project, store.Clock));
        await database.SaveChangesAsync(TestContext.Current.CancellationToken);
        var repository = new EfCalendarRepository(database);

        var entries = await repository.LoadAsync(query, TestContext.Current.CancellationToken);

        return entries.Select(entry => entry.Title).Distinct().ToArray();
    }
}