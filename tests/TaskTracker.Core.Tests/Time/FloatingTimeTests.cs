using TaskTracker.Core.Time;

namespace TaskTracker.Core.Tests.Time;

public sealed class FloatingTimeTests
{
    [Fact]
    public void New_york_gap_resolves_to_first_valid_fractional_instant()
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        var local = new DateTime(2026, 3, 8, 2, 30, 0).AddTicks(1234567);

        var actual = FloatingTime.ToUtc(local, zone);

        Assert.Equal(new DateTime(2026, 3, 8, 7, 0, 0, DateTimeKind.Utc), actual);
    }

    [Fact]
    public void Ambiguous_time_uses_earlier_instant()
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById("Europe/London");

        var actual = FloatingTime.ToUtc(new DateTime(2026, 10, 25, 1, 30, 0), zone);

        Assert.Equal(new DateTime(2026, 10, 25, 0, 30, 0, DateTimeKind.Utc), actual);
    }

    [Fact]
    public void Date_only_due_uses_end_of_transition_day()
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

        var actual = FloatingTime.ToUtc(new DateOnly(2026, 3, 8), null, zone);

        Assert.Equal(new DateTime(2026, 3, 9, 3, 59, 59, DateTimeKind.Utc).AddTicks(9999999), actual);
    }

    [Fact]
    public void Explicit_due_time_uses_specified_local_time()
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

        var actual = FloatingTime.ToUtc(new DateOnly(2026, 3, 8), new TimeOnly(15, 0), zone);

        Assert.Equal(new DateTime(2026, 3, 8, 19, 0, 0, DateTimeKind.Utc), actual);
    }
}