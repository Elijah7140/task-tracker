using TaskTracker.Core.Completion;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Undo;

namespace TaskTracker.Core.Items;

public sealed partial class ItemService
{
    /// <summary>Sets the priority alone, leaving every other field as it is (row menus, §7.15).</summary>
    public async Task SetPriorityAsync(Guid id, Guid? priorityId, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var item = await FindItemAsync(work, id, cancellationToken);
        if (priorityId == item.PriorityLevelId)
        {
            return;
        }

        await EnsureActivePriorityAsync(work, priorityId, cancellationToken);
        item.SetLookups(item.ItemTypeId, priorityId, clock);
        await work.SaveChangesAsync(UndoLabels.SetPriority(item.Title), cancellationToken);
    }

    /// <summary>
    /// Assigns a status, or none, using the completion rules of §7.15: a Done status completes the item
    /// (asking first when it has open sub-items), and an Open status or none reopens a completed item.
    /// </summary>
    public async Task<CompletionResult> SetStatusAsync(Guid id, Guid? statusId, bool confirmed = false,
        CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var work = unitOfWorkFactory.Begin();
        var item = await FindItemAsync(work, id, cancellationToken);
        var result = await ApplyStatusChangeAsync(work, item, new StatusChange(statusId), confirmed, cancellationToken);
        if (result is CompletionResult.Applied)
        {
            await work.SaveChangesAsync(UndoLabels.SetStatus(item.Title), cancellationToken);
        }

        return result;
    }

    private static async Task<TodoItem> FindItemAsync(IUnitOfWork work, Guid id, CancellationToken cancellationToken)
    {
        var item = await work.Items.FindAsync(id, cancellationToken);
        return item ?? throw new DomainRuleException("Item is missing or deleted.");
    }

    private static async Task EnsureActivePriorityAsync(IUnitOfWork work, Guid? priorityId,
        CancellationToken cancellationToken)
    {
        if (priorityId is null)
        {
            return;
        }

        var levels = await work.Lookups.PriorityLevelsAsync(cancellationToken);
        if (!levels.Any(level => level.Id == priorityId && !level.IsArchived))
        {
            throw new DomainRuleException("Priority is missing or archived.");
        }
    }

    private async Task<CompletionResult> ApplyStatusChangeAsync(IUnitOfWork work, TodoItem item,
        StatusChange? change, bool confirmed, CancellationToken cancellationToken)
    {
        if (change is null || change.StatusId == item.StatusId)
        {
            return new CompletionResult.Applied([]);
        }

        var statuses = await work.Lookups.StatusesAsync(cancellationToken);
        var status = FindActiveStatus(statuses, change.StatusId);
        var done = status?.Kind == StatusKind.Done;
        var result = await MatchCompletionAsync(work, item, done, confirmed, StatusLevel.FirstDone(statuses),
            cancellationToken);

        if (result is CompletionResult.Applied)
        {
            AssignStatus(item, status);
        }

        return result;
    }

    private static StatusLevel? FindActiveStatus(IReadOnlyList<StatusLevel> statuses, Guid? statusId)
    {
        if (statusId is null)
        {
            return null;
        }

        var status = statuses.FirstOrDefault(row => row.Id == statusId && !row.IsArchived);
        return status ?? throw new DomainRuleException("Status is missing or archived.");
    }

    /// <summary>Completes or reopens the item, with its cascade, when the new status kind requires it.</summary>
    private async Task<CompletionResult> MatchCompletionAsync(IUnitOfWork work, TodoItem item, bool done,
        bool confirmed, Guid firstDoneStatusId, CancellationToken cancellationToken)
    {
        if (done == item.CompletedAtUtc.HasValue)
        {
            return new CompletionResult.Applied([]);
        }

        var tree = await LoadTreeAsync(work, item.ProjectId, item.FolderId, cancellationToken);
        return await ApplyCompletionAsync(work, tree, item.Id, done, confirmed, firstDoneStatusId, cancellationToken);
    }

    /// <summary>Replaces the status that completion or reopening chose with the one the user picked.</summary>
    private void AssignStatus(TodoItem item, StatusLevel? status)
    {
        if (status?.Kind == StatusKind.Done)
        {
            item.SetStatus(status.Id, item.ReopenStatusId, clock);
        }
        else
        {
            item.SetOpenStatus(status, clock);
        }
    }

    private async Task<CompletionResult> ApplyCompletionAsync(IUnitOfWork work, ItemTree tree, Guid itemId,
        bool done, bool confirmed, Guid firstDoneStatusId, CancellationToken cancellationToken)
    {
        var settings = await GetSettingsAsync(work, tree.ProjectId, cancellationToken);
        var automatic = settings.AutoCompleteParents.Value;
        if (!done)
        {
            return Reopen(tree, itemId, automatic, firstDoneStatusId);
        }

        var completion = new RecurringCompletion(tree, clock, timeZone, firstDoneStatusId);
        var completed = completion.Complete(itemId, automatic, confirmed);
        if (completed is CompletionResult.Applied)
        {
            await completion.PersistAsync(work, cancellationToken);
        }

        return completed;
    }

    private CompletionResult Reopen(ItemTree tree, Guid itemId, bool automatic, Guid firstDoneStatusId)
    {
        var result = CompletionService.Reopen(tree, itemId, automatic, clock.GetUtcNow().UtcDateTime);
        if (result is CompletionResult.Applied applied)
        {
            ApplyChanges(tree, applied, firstDoneStatusId);
        }

        return result;
    }

    private static async Task<Guid> FirstDoneStatusIdAsync(IUnitOfWork work, CancellationToken cancellationToken)
    {
        return StatusLevel.FirstDone(await work.Lookups.StatusesAsync(cancellationToken));
    }
}