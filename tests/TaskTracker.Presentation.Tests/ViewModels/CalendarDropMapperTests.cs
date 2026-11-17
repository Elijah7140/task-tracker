using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Pointer position to snapped time, grab offset, clamping and the click-versus-drag threshold.</summary>
public sealed class CalendarDropMapperTests
{
    private const double EightOClock = 8 * CalendarMetrics.HourHeight;

    [Theory]
    [InlineData(0, "00:00")]
    [InlineData(EightOClock, "08:00")]
    [InlineData(EightOClock + 5, "08:00")]
    [InlineData(EightOClock + 7, "08:15")]
    [InlineData(EightOClock + 12, "08:15")]
    [InlineData(EightOClock + 19, "08:30")]
    public void Pointer_position_snaps_to_the_nearest_quarter_hour(double pointerY, string expected)
    {
        var start = CalendarDropMapper.SnapStart(pointerY, grabOffset: 0);

        Assert.Equal(TimeOnly.Parse(expected), start);
    }

    [Fact]
    public void Grab_offset_keeps_the_block_where_it_was_picked_up()
    {
        var grabbedTwentyPixelsBelowTheTop = 20;
        var pointerY = EightOClock + grabbedTwentyPixelsBelowTheTop;

        var start = CalendarDropMapper.SnapStart(pointerY, grabbedTwentyPixelsBelowTheTop);

        Assert.Equal(new TimeOnly(8, 0), start);
    }

    [Fact]
    public void A_block_dragged_above_the_grid_starts_at_midnight()
    {
        Assert.Equal(TimeOnly.MinValue, CalendarDropMapper.SnapStart(-100, grabOffset: 0));
        Assert.Equal(TimeOnly.MinValue, CalendarDropMapper.SnapStart(10, grabOffset: 30));
    }

    [Fact]
    public void A_block_dragged_below_the_grid_starts_at_a_quarter_to_midnight()
    {
        var start = CalendarDropMapper.SnapStart(CalendarMetrics.DayHeight + 200, grabOffset: 0);

        Assert.Equal(new TimeOnly(23, 45), start);
    }

    [Fact]
    public void Dropping_near_the_bottom_with_a_grab_offset_still_stays_inside_the_day()
    {
        var start = CalendarDropMapper.SnapStart(CalendarDayBottomMinusOnePixel(), grabOffset: 5);

        Assert.Equal(new TimeOnly(23, 45), start);
    }

    [Theory]
    [InlineData(-30, "00:00")]
    [InlineData(0, "00:00")]
    [InlineData(61, "01:01")]
    [InlineData(2000, "23:45")]
    public void Minutes_since_midnight_are_clamped_into_the_day(int minutes, string expected)
    {
        Assert.Equal(TimeOnly.Parse(expected), CalendarDropMapper.FromMinutes(minutes));
    }

    [Theory]
    [InlineData(0, 0, 3, 0, false)]
    [InlineData(0, 0, 2, 3, false)]
    [InlineData(10, 10, 10, 13.9, false)]
    [InlineData(0, 0, 4, 0, true)]
    [InlineData(0, 0, 0, -4, true)]
    [InlineData(0, 0, 3, 3, true)]
    public void A_press_becomes_a_drag_only_after_four_pixels(
        double pressedX, double pressedY, double currentX, double currentY, bool expected)
    {
        Assert.Equal(expected, CalendarDropMapper.IsDrag(pressedX, pressedY, currentX, currentY));
    }

    private static double CalendarDayBottomMinusOnePixel()
    {
        return CalendarMetrics.DayHeight - 1;
    }
}