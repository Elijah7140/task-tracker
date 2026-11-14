using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class ReorderPlanTests
{
    private static readonly Guid First = Guid.NewGuid();
    private static readonly Guid Archived = Guid.NewGuid();
    private static readonly Guid Third = Guid.NewGuid();

    [Fact]
    public void Moving_down_exchanges_the_row_with_the_next_active_row()
    {
        var reordered = ReorderPlan.SwapWithActiveNeighbour(
            [First, Archived, Third], [First, Third], First, 1);

        Assert.Equal([Third, Archived, First], reordered);
    }

    [Fact]
    public void Moving_up_exchanges_the_row_with_the_previous_active_row()
    {
        var reordered = ReorderPlan.SwapWithActiveNeighbour(
            [First, Archived, Third], [First, Third], Third, -1);

        Assert.Equal([Third, Archived, First], reordered);
    }

    [Fact]
    public void The_input_list_is_not_changed()
    {
        var saved = new List<Guid> { First, Archived, Third };

        ReorderPlan.SwapWithActiveNeighbour(saved, [First, Third], First, 1);

        Assert.Equal([First, Archived, Third], saved);
    }
}