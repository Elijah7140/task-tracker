namespace TaskTracker.Core.Items;

/// <summary>Explains when an item's floating dates cannot be pushed back.</summary>
public static class PushBackOneDay
{
    public static string? UnavailableReason(bool isCompleted, bool hasDates)
    {
        if (isCompleted)
        {
            return "Completed items cannot be pushed back.";
        }

        return hasDates ? null : "This item has no due date or scheduled block.";
    }
}