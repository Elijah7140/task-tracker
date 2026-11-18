using TaskTracker.Core.Items;
using TaskTracker.Core.Items.Recurrence;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Completion;

/// <summary>Applies completions bottom-up so each parent sees any newly opened occurrence.</summary>
internal sealed class RecurringCompletion(ItemTree tree, TimeProvider clock, TimeZoneInfo timeZone, Guid doneStatusId)
{
    private readonly OccurrenceCopies copies = new(tree, clock);
    private readonly List<CompletionChange> changes = [];
    private readonly DateTimeOffset now = clock.GetUtcNow();
    private bool lastRepeat;

    public CompletionResult Complete(Guid itemId, bool autoComplete, bool confirmed)
    {
        var item = tree.Get(itemId);
        if (!autoComplete)
        {
            SetCompleted(item, true);
            return Result();
        }

        var openCount = tree.Descendants(itemId).Count(child => child.CompletedAtUtc is null);
        if (openCount > 0 && !confirmed)
        {
            return new CompletionResult.NeedsConfirmation(openCount);
        }

        CompleteBranch(item);
        Reconcile(item.ParentItemId);
        return Result();
    }

    /// <summary>Reconciles each affected ancestor once, after its affected descendants.</summary>
    public void Reconcile(params Guid?[] parentIds)
    {
        var depths = new Dictionary<TodoItem, int>();
        foreach (var parentId in parentIds.OfType<Guid>().Distinct())
        {
            var ancestors = tree.Ancestors(parentId);
            depths[tree.Get(parentId)] = ancestors.Count;
            for (var index = 0; index < ancestors.Count; index++)
            {
                depths[ancestors[index]] = ancestors.Count - index - 1;
            }
        }

        foreach (var parent in depths.OrderByDescending(entry => entry.Value).Select(entry => entry.Key))
        {
            var children = tree.Children(parent.Id);
            if (children.Count > 0)
            {
                SetCompleted(parent, children.All(child => child.CompletedAtUtc is not null));
            }
        }
    }

    public Task PersistAsync(IUnitOfWork work, CancellationToken cancellationToken)
    {
        return copies.PersistAsync(work, cancellationToken);
    }

    private void CompleteBranch(TodoItem item)
    {
        var children = tree.Children(item.Id);
        foreach (var child in children)
        {
            CompleteBranch(child);
        }

        SetCompleted(item, tree.Children(item.Id).All(child => child.CompletedAtUtc is not null));
    }

    private void SetCompleted(TodoItem item, bool completed)
    {
        if (completed == item.CompletedAtUtc.HasValue)
        {
            return;
        }

        DateTime? timestamp = completed ? now.UtcDateTime : null;
        item.SetCompletion(timestamp, clock, doneStatusId);
        changes.Add(new CompletionChange(item.Id, timestamp));

        if (completed && !item.RecurrenceSuccessorCreated && item.Recurrence is { } rule)
        {
            var localDay = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, timeZone).DateTime);
            if (RecurrenceCalculator.Next(rule, item.RecurrenceDate!.Value, localDay) is { } next)
            {
                copies.Add(item, next, rule);
                item.MarkRecurrenceSuccessorCreated(clock);
            }
            else
            {
                lastRepeat = true;
            }
        }
    }

    private CompletionResult.Applied Result()
    {
        return new CompletionResult.Applied(changes)
        {
            LastRepeat = lastRepeat
        };
    }
}