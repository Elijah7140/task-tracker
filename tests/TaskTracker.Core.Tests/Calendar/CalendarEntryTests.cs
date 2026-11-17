using TaskTracker.Core.Calendar;

namespace TaskTracker.Core.Tests.Calendar;

public sealed class CalendarEntryTests
{
    private static readonly DateTime Start = new(2026, 11, 16, 9, 0, 0);

    [Fact]
    public void Scheduled_end_after_the_start_is_used_as_given()
    {
        var entry = Scheduled(Start, Start.AddHours(2));

        Assert.Equal(Start.AddHours(2), entry.EffectiveScheduledEnd);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    public void Missing_or_zero_length_end_gives_the_default_block(int? lengthMinutes)
    {
        var end = lengthMinutes is int minutes ? Start.AddMinutes(minutes) : (DateTime?)null;
        var entry = Scheduled(Start, end);

        Assert.Equal(Start + CalendarEntry.DefaultBlockLength, entry.EffectiveScheduledEnd);
    }

    [Fact]
    public void End_before_the_start_gives_the_default_block()
    {
        var entry = Scheduled(Start, Start.AddMinutes(-10));

        Assert.Equal(Start + CalendarEntry.DefaultBlockLength, entry.EffectiveScheduledEnd);
    }

    [Fact]
    public void Entry_without_a_schedule_has_no_effective_end()
    {
        var entry = Scheduled(null, null);

        Assert.Null(entry.EffectiveScheduledEnd);
    }

    [Fact]
    public void Thresholds_default_to_the_application_defaults()
    {
        var entry = Scheduled(Start, null);

        Assert.Equal(TimeSpan.FromDays(3), entry.Thresholds.Yellow);
        Assert.Equal(TimeSpan.FromHours(24), entry.Thresholds.Red);
    }

    private static CalendarEntry Scheduled(DateTime? start, DateTime? end)
    {
        return new CalendarEntry(
            ItemId: Guid.NewGuid(),
            ProjectId: Guid.NewGuid(),
            FolderId: null,
            Title: "Block",
            Kind: CalendarEntryKind.Scheduled,
            Date: DateOnly.FromDateTime(start ?? Start),
            StartTime: null,
            ScheduledStart: start,
            ScheduledEnd: end,
            IsCompleted: false,
            DueDate: null,
            DueTime: null,
            ItemType: null,
            Priority: null);
    }
}