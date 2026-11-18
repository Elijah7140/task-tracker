using TaskTracker.Core.Items;

namespace TaskTracker.Core.Tests.Items;

/// <summary>Checks the reasons that disable Push back in the service and row menus.</summary>
public sealed class PushBackOneDayTests
{
    [Theory]
    [InlineData(false, true, null)]
    [InlineData(false, false, "This item has no due date or scheduled block.")]
    [InlineData(true, true, "Completed items cannot be pushed back.")]
    [InlineData(true, false, "Completed items cannot be pushed back.")]
    public void Eligibility_explains_why_an_item_cannot_move(bool completed, bool hasDates, string? reason)
    {
        var result = PushBackOneDay.UnavailableReason(completed, hasDates);

        Assert.Equal(reason, result);
    }
}