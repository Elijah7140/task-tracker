using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Core.Reminders;
using TaskTracker.Core.Settings;

namespace TaskTracker.Core.Tests.Reminders;

/// <summary>Checks the exact UTC instant selected for floating reminders.</summary>
public sealed class ReminderTimingTests
{
    [Theory]
    [InlineData(3, 8, 3, 30, 60, 7, 0)]
    [InlineData(11, 1, 2, 30, 60, 5, 30)]
    public void Resolves_the_reminder_in_the_gap_or_first_repeated_hour(
        int month, int day, int hour, int minute, int offsetMinutes, int utcHour, int utcMinute)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        var dueDate = new DateOnly(2026, month, day);

        var instant = ReminderTiming.BaseInstant(dueDate, new TimeOnly(hour, minute),
            TimeSpan.FromMinutes(offsetMinutes), zone);

        Assert.Equal(new DateTime(2026, month, day, utcHour, utcMinute, 0, DateTimeKind.Utc), instant);
    }

    [Fact]
    public void Date_only_uses_project_time_and_global_default_offset()
    {
        var clock = new FakeTimeProvider();
        var item = TodoItem.Create(Guid.NewGuid(), null, null, "Date only", clock);
        item.SetDue(new DateOnly(2026, 11, 17), null, clock);
        var global = new Dictionary<string, string> { ["defaultReminderOffset"] = "PT2H" };
        var project = new Dictionary<string, string> { ["dateOnlyReminderTime"] = "10:30" };
        var effective = SettingsResolver.Resolve(global, project);
        var zone = TimeZoneInfo.CreateCustomTimeZone("Fixed", TimeSpan.FromHours(2), "Fixed", "Fixed");

        var instant = ReminderTiming.Instant(item, effective, zone);

        Assert.Equal(new DateTime(2026, 11, 17, 6, 30, 0, DateTimeKind.Utc), instant);
        Assert.Equal(SettingSource.Project, effective.DateOnlyReminderTime.Source);
        Assert.Equal(SettingSource.Global, effective.DefaultReminderOffset.Source);
        project["remindersEnabled"] = "false";
        Assert.Null(ReminderTiming.Instant(item, SettingsResolver.Resolve(global, project), zone));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(5)]
    [InlineData(15)]
    [InlineData(30)]
    [InlineData(60)]
    [InlineData(120)]
    [InlineData(1440)]
    [InlineData(2880)]
    [InlineData(10080)]
    public void An_explicit_offset_overrides_the_project_default(int minutes)
    {
        var clock = new FakeTimeProvider();
        var item = TodoItem.Create(Guid.NewGuid(), null, null, "Timed", clock);
        var due = new DateTime(2026, 11, 17, 9, 30, 0, DateTimeKind.Utc);
        item.SetDue(DateOnly.FromDateTime(due), TimeOnly.FromDateTime(due), clock);
        item.SetReminder(ReminderMode.Offset, minutes);
        var effective = SettingsResolver.Resolve(new Dictionary<string, string>(),
            new Dictionary<string, string> { ["defaultReminderOffset"] = "PT3H" });

        var instant = ReminderTiming.Instant(item, effective, TimeZoneInfo.Utc);

        Assert.Equal(due.AddMinutes(-minutes), instant);
    }

    [Fact]
    public void A_changed_instant_rearms_a_delivered_reminder()
    {
        var clock = new FakeTimeProvider();
        var item = TodoItem.Create(Guid.NewGuid(), null, null, "Timed", clock);
        var today = new DateOnly(2026, 11, 17);
        item.SetDue(today, new TimeOnly(8, 0), clock);
        var settings = SettingsResolver.Resolve(new Dictionary<string, string>(), new Dictionary<string, string>());
        var old = ReminderTiming.Instant(item, settings, TimeZoneInfo.Utc)!.Value;
        item.RecordReminderDelivery(old);

        item.SetDue(today, new TimeOnly(8, 30), clock);
        var updated = ReminderTiming.Instant(item, settings, TimeZoneInfo.Utc)!.Value;

        Assert.False(ReminderTiming.IsDue(old, updated, item.ReminderDeliveredFor));
        Assert.True(ReminderTiming.IsDue(updated, updated, item.ReminderDeliveredFor));
        Assert.False(ReminderTiming.IsValid(ReminderMode.Offset, 10));
    }
}