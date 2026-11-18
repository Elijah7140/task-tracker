#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Items;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.Search;
using TaskTracker.Core.Search.Syntax;
using TaskTracker.Core.Settings;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Reminders;

/// <summary>Exercises the scheduler query and write operations through real SQLite.</summary>
public sealed class ReminderServiceTests
{
    [Fact]
    public async Task Due_query_respects_effective_settings_visibility_and_delivery_history()
    {
        await using var world = await UndoWorld.CreateAsync();
        var now = world.Clock.GetUtcNow().UtcDateTime;
        var due = await SaveAsync(world, "Due", now);
        await SaveAsync(world, "Future", now.AddMinutes(1));
        await SaveAsync(world, "None", now, ReminderMode.None);
        await world.Items.CreateAsync(world.Project.Id, null, null, "No due date");
        var completed = await SaveAsync(world, "Completed", now);
        var deleted = await SaveAsync(world, "Deleted", now);
        await world.Items.SetCompletedAsync(world.Project.Id, null, completed.Id, true);
        await world.Items.DeleteAsync(world.Project.Id, null, deleted.Id);
        await world.Settings.SetGlobalAsync(SettingsCatalogue.RemindersEnabled, false);

        Assert.Empty(await world.Reminders.DueAsync());

        await world.Settings.SetProjectOverrideAsync(world.Project.Id, SettingsCatalogue.RemindersEnabled, true);
        var reminder = Assert.Single(await world.Reminders.DueAsync());
        Assert.Equal(due.Id, reminder.ItemId);
        Assert.Equal(now, reminder.InstantUtc);

        var undoBeforeDelivery = world.History.UndoDescription;
        await world.Reminders.RecordDeliveryAsync([reminder]);

        Assert.Empty(await world.Reminders.DueAsync());
        Assert.Equal(now, (await world.ReadItemAsync(due.Id)).ReminderDeliveredFor);
        Assert.Equal(undoBeforeDelivery, world.History.UndoDescription);
    }

    [Fact]
    public async Task Pushing_back_rearms_a_delivered_reminder_for_the_new_day()
    {
        await using var world = await UndoWorld.CreateAsync();
        var now = world.Clock.GetUtcNow().UtcDateTime;
        var item = await SaveAsync(world, "Prepare report", now);
        var delivered = Assert.Single(await world.Reminders.DueAsync());
        await world.Reminders.RecordDeliveryAsync([delivered]);

        await world.Items.PushBackOneDayAsync(item.Id);

        Assert.Empty(await world.Reminders.DueAsync());
        world.Clock.Advance(TimeSpan.FromDays(1));
        var rearmed = Assert.Single(await world.Reminders.DueAsync());
        Assert.Equal(item.Id, rearmed.ItemId);
        Assert.Equal(now.AddDays(1), rearmed.InstantUtc);
    }

    [Fact]
    public async Task Snooze_is_undoable_even_after_delivery_changes_the_same_row()
    {
        await using var world = await UndoWorld.CreateAsync();
        var now = world.Clock.GetUtcNow().UtcDateTime;
        var item = await SaveAsync(world, "Prepare report", now);
        var reminder = Assert.Single(await world.Reminders.DueAsync());
        await world.Reminders.RecordDeliveryAsync([reminder]);

        await world.Reminders.SnoozeAsync(reminder, ReminderSnooze.TenMinutes);

        Assert.Equal("Snooze reminder for 'Prepare report'", world.History.UndoDescription);
        Assert.Equal(now.AddMinutes(10), (await world.ReadItemAsync(item.Id)).SnoozedUntilUtc);
        Assert.Empty(await world.Reminders.DueAsync());
        world.Clock.Advance(TimeSpan.FromMinutes(10));
        var deferred = Assert.Single(await world.Reminders.DueAsync());
        await world.Reminders.RecordDeliveryAsync([deferred]);

        await world.History.UndoAsync();

        var restored = await world.ReadItemAsync(item.Id);
        Assert.Null(restored.SnoozedUntilUtc);
        Assert.Equal(deferred.InstantUtc, restored.ReminderDeliveredFor);
        Assert.Equal(reminder, Assert.Single(await world.Reminders.DueAsync()));
    }

    [Fact]
    public async Task Snoozing_until_tomorrow_uses_the_effective_local_time()
    {
        await using var world = await UndoWorld.CreateAsync();
        var now = world.Clock.GetUtcNow().UtcDateTime;
        var item = await SaveAsync(world, "Tomorrow", now);
        await world.Settings.SetProjectOverrideAsync(world.Project.Id, SettingsCatalogue.DateOnlyReminderTime, new TimeOnly(10, 30));
        var entry = Assert.Single(await world.Reminders.DueAsync());
        await world.Reminders.RecordDeliveryAsync([entry]);

        await world.Reminders.SnoozeAsync(entry, ReminderSnooze.Tomorrow);

        var stored = await world.ReadItemAsync(item.Id);
        Assert.Equal(now.Date.AddDays(1).AddHours(10).AddMinutes(30), stored.SnoozedUntilUtc);
    }

    [Fact]
    public async Task Has_reminder_matches_only_open_items_with_an_enabled_due_reminder()
    {
        await using var world = await UndoWorld.CreateAsync();
        var now = world.Clock.GetUtcNow().UtcDateTime;
        await SaveAsync(world, "Active", now);
        await SaveAsync(world, "None", now, ReminderMode.None);
        var complete = await SaveAsync(world, "Complete", now);
        await world.Items.SetCompletedAsync(world.Project.Id, null, complete.Id, true);
        var parser = new ItemQueryParser(world.Clock, TimeZoneInfo.Utc);
        var scope = new SearchScope.AllProjects();
        var fields = new[] { new SearchableField("reminder", "Reminder", TaskTracker.Core.Fields.FieldDataType.Boolean, null) };

        var parsed = parser.Parse("has:reminder", fields, new Dictionary<string, IReadOnlyList<SearchChoice>>());
        Assert.Empty(parsed.Errors);
        var query = new ItemQuery(scope, null, parsed.Filters, true);
        var active = await world.Search.SearchAsync(query);

        Assert.Equal("Active", Assert.Single(active.Items).Title);
        await world.Settings.SetProjectOverrideAsync(world.Project.Id, SettingsCatalogue.RemindersEnabled, false);
        Assert.Empty((await world.Search.SearchAsync(query)).Items);
    }

    [Fact]
    public async Task Malformed_stored_settings_fall_back_to_their_defaults_for_the_due_query()
    {
        await using var world = await UndoWorld.CreateAsync();
        var yesterday = DateOnly.FromDateTime(world.Clock.GetUtcNow().UtcDateTime).AddDays(-1);
        var item = await SaveDateOnlyAsync(world, "Corrupt settings", yesterday);
        await using (var database = world.OpenContext())
        {
            await database.Database.ExecuteSqlRawAsync(
                "INSERT INTO GlobalSetting (Key, Value) VALUES ('defaultReminderOffset', 'not a duration')");
            await database.Database.ExecuteSqlRawAsync(
                "INSERT INTO ProjectSetting (ProjectId, Key, Value) VALUES ({0}, 'dateOnlyReminderTime', '25:99')",
                world.Project.Id.ToString().ToUpperInvariant());
        }

        var reminder = Assert.Single(await world.Reminders.DueAsync());

        Assert.Equal(item.Id, reminder.ItemId);
        Assert.Equal(yesterday.ToDateTime(new TimeOnly(8, 0), DateTimeKind.Utc), reminder.InstantUtc);
    }

    [Fact]
    public async Task Due_query_still_finds_items_that_only_a_large_default_offset_makes_due()
    {
        await using var world = await UndoWorld.CreateAsync();
        var today = DateOnly.FromDateTime(world.Clock.GetUtcNow().UtcDateTime);
        await world.Settings.SetProjectOverrideAsync(world.Project.Id, SettingsCatalogue.DefaultReminderOffset,
            TimeSpan.FromDays(30));
        var farAhead = await SaveDateOnlyAsync(world, "Twenty days ahead", today.AddDays(20));
        await SaveDateOnlyAsync(world, "Forty days ahead", today.AddDays(40));
        var weekAhead = await world.Items.CreateAsync(world.Project.Id, null, null, "Six days ahead");
        var edit = new ItemEdit("Six days ahead", null, null, null, null, today.AddDays(6), new TimeOnly(0, 0), null, null)
        {
            UpdateReminder = true,
            ReminderMode = ReminderMode.Offset,
            ReminderOffsetMinutes = 10080,
        };
        await world.Items.EditAsync(weekAhead.Id, edit);

        var due = await world.Reminders.DueAsync();

        Assert.Equal(new[] { farAhead.Id, weekAhead.Id }.Order(), due.Select(entry => entry.ItemId).Order());
    }

    private static async Task<TodoItem> SaveDateOnlyAsync(UndoWorld world, string title, DateOnly due)
    {
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, title);
        var edit = new ItemEdit(title, null, null, null, null, due, null, null, null);
        await world.Items.EditAsync(item.Id, edit);
        return item;
    }

    private static async Task<TodoItem> SaveAsync(UndoWorld world, string title, DateTime due,
        ReminderMode mode = ReminderMode.Offset)
    {
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, title);
        var edit = new ItemEdit(title, null, null, null, null, DateOnly.FromDateTime(due),
            TimeOnly.FromDateTime(due), null, null)
        {
            UpdateReminder = true,
            ReminderMode = mode,
            ReminderOffsetMinutes = mode == ReminderMode.Offset ? 0 : null,
        };
        await world.Items.EditAsync(item.Id, edit);
        return item;
    }
}