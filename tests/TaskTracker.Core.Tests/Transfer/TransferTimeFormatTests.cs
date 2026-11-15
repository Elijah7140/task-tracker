using TaskTracker.Core.Tests.Search.Syntax;
using TaskTracker.Core.Transfer;

namespace TaskTracker.Core.Tests.Transfer;

public sealed class TransferTimeFormatTests
{
    [Theory]
    [InlineData("en-US")]
    [InlineData("de-DE")]
    [InlineData("ar-SA")]
    public void Formatting_ignores_the_current_culture(string culture)
    {
        using var scope = CultureInfoScope.Use(culture);

        Assert.Equal("2026-11-13", TransferTimeFormat.FormatDate(new DateOnly(2026, 11, 13)));
        Assert.Equal("15:30:00", TransferTimeFormat.FormatTime(new TimeOnly(15, 30)));
        Assert.Equal("2026-11-13T15:30:00", TransferTimeFormat.FormatLocal(new DateTime(2026, 11, 13, 15, 30, 0)));
        Assert.Equal("2026-11-13T12:00:00Z",
            TransferTimeFormat.FormatUtc(new DateTime(2026, 11, 13, 12, 0, 0, DateTimeKind.Utc)));
    }

    [Theory]
    [InlineData("en-US")]
    [InlineData("de-DE")]
    public void Parsing_ignores_the_current_culture(string culture)
    {
        using var scope = CultureInfoScope.Use(culture);

        Assert.True(TransferTimeFormat.TryParseDate("2026-11-13", out var date));
        Assert.True(TransferTimeFormat.TryParseLocal("2026-11-13 15:30", out var local));
        Assert.Equal(new DateOnly(2026, 11, 13), date);
        Assert.Equal(new DateTime(2026, 11, 13, 15, 30, 0), local);
        Assert.False(TransferTimeFormat.TryParseDate("13.11.2026", out _));
    }

    [Fact]
    public void Fractions_of_a_second_survive_a_round_trip()
    {
        var local = new DateTime(2026, 11, 13, 15, 30, 0).AddTicks(1234567);

        var text = TransferTimeFormat.FormatLocal(local);

        Assert.Equal("2026-11-13T15:30:00.1234567", text);
        Assert.True(TransferTimeFormat.TryParseLocal(text, out var parsed));
        Assert.Equal(local, parsed);
    }

    [Fact]
    public void A_local_value_with_an_offset_or_z_is_not_accepted()
    {
        Assert.False(TransferTimeFormat.TryParseLocal("2026-11-13T15:30:00Z", out _));
        Assert.False(TransferTimeFormat.TryParseLocal("2026-11-13T15:30:00+02:00", out _));
    }

    [Fact]
    public void A_utc_value_needs_the_trailing_z_and_comes_back_as_utc()
    {
        Assert.False(TransferTimeFormat.TryParseUtc("2026-11-13T12:00:00", out _));
        Assert.True(TransferTimeFormat.TryParseUtc("2026-11-13T12:00:00Z", out var value));
        Assert.Equal(DateTimeKind.Utc, value.Kind);
        Assert.Equal(new DateTime(2026, 11, 13, 12, 0, 0, DateTimeKind.Utc), value);
    }

    [Theory]
    [InlineData("15:30")]
    [InlineData("15:30:00")]
    public void Times_may_omit_seconds(string text)
    {
        Assert.True(TransferTimeFormat.TryParseTime(text, out var time));
        Assert.Equal(new TimeOnly(15, 30), time);
    }
}