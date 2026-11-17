using TaskTracker.Core.Items;
using TaskTracker.Core.Items.Recurrence;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Completion;

/// <summary>Applies completions bottom-up so each parent sees any newly opened occurrence.</summary>
internal sealed class RecurringCompletion(ItemTree tree, TimeProvider clock, TimeZoneInfo timeZone)
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

    public void Reconcile(Guid? parentId)
    {
        while (parentId is Guid id)
        {
            var parent = tree.Get(id);
            var children = tree.Children(id);
            if (children.Count > 0)
            {
                SetCompleted(parent, children.All(child => child.CompletedAtUtc is not null));
            }

            parentId = parent.ParentItemId;
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
        item.SetCompletion(timestamp, clock);
        changes.Add(new CompletionChange(item.Id, timestamp));

        if (completed && item.Recurrence is { } rule)
        {
            var localDay = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, timeZone).DateTime);
            if (RecurrenceCalculator.Next(rule, item.RecurrenceDate!.Value, localDay) is { } next)
            {
                copies.Add(item, next, rule);
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