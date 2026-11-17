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

        var deadline = EffectiveDeadline(item.DueDate, item.DueTime, item.ScheduledStart, zone);
        return Calculate(deadline, nowUtc, thresholds);
    }

    /// <summary>Classifies a resolved UTC deadline; no deadline means no urgency.</summary>
    public static Urgency Calculate(DateTime? deadlineUtc, DateTime nowUtc, UrgencyThresholds thresholds)
    {
        if (deadlineUtc is null)
        {
            return Urgency.None;
        }

        var remaining = deadlineUtc.Value - nowUtc;

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

    /// <summary>
    /// Resolves the effective deadline (§6.3): the due date and time when set, otherwise the
    /// scheduled start, otherwise none.
    /// </summary>
    public static DateTime? EffectiveDeadline(DateOnly? dueDate, TimeOnly? dueTime,
        DateTime? scheduledStart, TimeZoneInfo zone)
    {
        if (dueDate is DateOnly date)
        {
            return FloatingTime.ToUtc(date, dueTime, zone);
        }

        if (scheduledStart is DateTime start)
        {
            return FloatingTime.ToUtc(start, zone);
        }

        return null;
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

    /// <summary>Calculates rolled-up urgency from an already loaded area node.</summary>
    public static DisplayedUrgency CalculateDisplayed(ItemNode node, DateTime nowUtc,
        TimeZoneInfo zone, UrgencyThresholds thresholds)
    {
        var best = Calculate(node.Item, nowUtc, zone, thresholds);
        Guid? source = null;

        foreach (var child in node.Children)
        {
            var candidate = CalculateDisplayed(child, nowUtc, zone, thresholds);

            if (candidate.Value > best)
            {
                best = candidate.Value;
                source = candidate.SourceDescendantId ?? child.Item.Id;
            }
        }

        return new DisplayedUrgency(best, source);
    }
}