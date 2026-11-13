namespace TaskTracker.Core.Time;

/// <summary>Resolves floating local dates and times using an explicit time zone.</summary>
public static class FloatingTime
{
    /// <summary>Treats a date without a time as due at the end of the local day.</summary>
    public static DateTime ToUtc(DateOnly date, TimeOnly? time, TimeZoneInfo zone)
    {
        return ToUtc(date.ToDateTime(time ?? TimeOnly.MaxValue), zone);
    }

    /// <summary>Uses the first valid instant after a gap and the earlier instant in a repeated hour.</summary>
    public static DateTime ToUtc(DateTime local, TimeZoneInfo zone)
    {
        var value = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);

        if (zone.IsInvalidTime(value))
        {
            value = FirstValidLocalTime(value, zone);
        }

        var offset = zone.IsAmbiguousTime(value)
            ? zone.GetAmbiguousTimeOffsets(value).Max()
            : zone.GetUtcOffset(value);

        return new DateTimeOffset(value, offset).UtcDateTime;
    }

    private static DateTime FirstValidLocalTime(DateTime invalid, TimeZoneInfo zone)
    {
        var candidate = invalid;

        do
        {
            candidate = candidate.AddMinutes(1);
        }
        while (zone.IsInvalidTime(candidate));

        var lastInvalidTick = invalid.Ticks;
        var firstValidTick = candidate.Ticks;

        while (lastInvalidTick + 1 < firstValidTick)
        {
            var middleTick = lastInvalidTick + (firstValidTick - lastInvalidTick) / 2;
            var middle = new DateTime(middleTick, DateTimeKind.Unspecified);

            if (zone.IsInvalidTime(middle))
            {
                lastInvalidTick = middleTick;
            }
            else
            {
                firstValidTick = middleTick;
            }
        }

        return new DateTime(firstValidTick, DateTimeKind.Unspecified);
    }
}