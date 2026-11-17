#pragma warning disable xUnit1051
using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Items;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Transfer;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.Transfer;

/// <summary>Checks the version 1 JSON fields for reminder choices and project settings.</summary>
public sealed class ReminderTransferTests
{
    [Fact]
    public async Task Round_trip_keeps_reminder_choice_and_project_settings_without_delivery_state()
    {
        await using var source = await SeedAsync();
        await using var target = await TransferWorld.CreateAsync();
        var reminder = Assert.Single(await source.Reminders.DueAsync());
        await source.Reminders.RecordDeliveryAsync([reminder]);
        await source.Reminders.SnoozeAsync(reminder, ReminderSnooze.OneHour);
        var text = await source.Transfer.ExportJsonAsync(new TransferScope.AllData());

        var result = await target.Transfer.ImportJsonAsync(text);

        Assert.True(result.Succeeded, string.Join(", ", result.Issues));
        Assert.DoesNotContain("reminderDeliveredFor", text);
        Assert.DoesNotContain("snoozedUntilUtc", text);
        Assert.DoesNotContain("snoozedForUtc", text);
        await using var reader = target.Store.Open();
        var item = await reader.TodoItems.AsNoTracking().SingleAsync();
        Assert.Equal(ReminderMode.Offset, item.ReminderMode);
        Assert.Equal(15, item.ReminderOffsetMinutes);
        Assert.Null(item.ReminderDeliveredFor);
        Assert.Null(item.SnoozedUntilUtc);
        var settings = await target.Settings.GetEffectiveAsync(item.ProjectId);
        Assert.Equal(new TimeOnly(10, 30), settings.DateOnlyReminderTime.Value);
        Assert.Equal(SettingSource.Project, settings.DateOnlyReminderTime.Source);
    }

    [Fact]
    public async Task Invalid_reminder_settings_and_offset_are_reported_with_json_paths()
    {
        await using var world = await SeedAsync();
        var text = await world.Transfer.ExportJsonAsync(new TransferScope.AllData());
        var invalid = TransferJson.Edit(text, json =>
        {
            json["projects"]![0]!["items"]![0]!["reminderOffsetMinutes"] = 12;
            json["projects"]![0]!["settings"]!["dateOnlyReminderTime"] = "25:00";
        });

        var result = world.Transfer.CheckJson(invalid);

        Assert.False(result.IsValid);
        Assert.Contains(result.Issues, issue => issue.Path == "$.projects[0].items[0].reminderOffsetMinutes");
        Assert.Contains(result.Issues, issue => issue.Path == "$.projects[0].settings.dateOnlyReminderTime");
    }

    private static async Task<UndoWorld> SeedAsync()
    {
        var world = await UndoWorld.CreateAsync();
        var item = await world.Items.CreateAsync(world.Project.Id, null, null, "Review");
        var now = world.Clock.GetUtcNow().UtcDateTime;
        await world.Items.EditAsync(item.Id, new ItemEdit(item.Title, null, null, null, null,
            DateOnly.FromDateTime(now), TimeOnly.FromDateTime(now), null, null)
        {
            UpdateReminder = true,
            ReminderMode = ReminderMode.Offset,
            ReminderOffsetMinutes = 15,
        });
        await world.Settings.SetProjectOverrideAsync(world.Project.Id, SettingsCatalogue.DateOnlyReminderTime, new TimeOnly(10, 30));
        return world;
    }
}