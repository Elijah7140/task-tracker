using TaskTracker.Core.Items;
using TaskTracker.Core.Time;

namespace TaskTracker.Core.Urgency;

/// <summary>Calculates deadline urgency and rolls it up over active sub-items.</summary>
public static class UrgencyCalculator
{
    /// <summary>Calculates one item's own urgency from its effective deadline.</summary>
    public static Urgency Calculate(TodoItem item, DateTime nowUtc, TimeZoneInfo zone, UrgencyThresholds thresholds)
    {
        if (item.CompletedAtUtc is not null || item.DeletedAtUtc is not null)
        {
            return Urgency.None;
        }

        var deadline = EffectiveDeadline(item, zone);

        if (deadline is null)
        {
            return Urgency.None;
        }

        var remaining = deadline.Value - nowUtc;

        if (remaining < TimeSpan.Zero)
        {
            return Urgency.Overdue;
        }

        if (remaining <= thresholds.Red)
        {
            return Urgency.Imminent;
        }

        return remaining <= thresholds.Yellow ? Urgency.Approaching : Urgency.None;
    }

    /// <summary>Finds the most urgent active item in a branch and identifies its source.</summary>
    public static DisplayedUrgency CalculateDisplayed(ItemTree tree, Guid id, DateTime nowUtc, TimeZoneInfo zone, UrgencyThresholds thresholds)
    {
        var best = Calculate(tree.Get(id), nowUtc, zone, thresholds);
        Guid? source = null;

        foreach (var child in tree.Children(id))
        {
            var candidate = CalculateDisplayed(tree, child.Id, nowUtc, zone, thresholds);

            if (candidate.Value <= best)
            {
                continue;
            }

            best = candidate.Value;
            source = candidate.SourceDescendantId ?? child.Id;
        }

        return new DisplayedUrgency(best, source);
    }

    private static DateTime? EffectiveDeadline(TodoItem item, TimeZoneInfo zone)
    {
        if (item.DueDate is DateOnly dueDate)
        {
            return FloatingTime.ToUtc(dueDate, item.DueTime, zone);
        }

        if (item.ScheduledStart is DateTime scheduledStart)
        {
            return FloatingTime.ToUtc(scheduledStart, zone);
        }

        return null;
    }
}