using TaskTracker.Core.Undo;

namespace TaskTracker.Core.Items;

public sealed partial class ItemService
{
    /// <summary>
    /// Moves an item to the area's top level at <paramref name="index"/> among the other top-level
    /// items and gives it <paramref name="priorityId"/>, in one save (the workspace card grid, §8).
    /// A sub-item is promoted. The undo step is labelled as a priority change when the priority
    /// changes, and as a move otherwise.
    /// </summary>
    public async Task MoveToPriorityGroupAsync(Guid projectId, Guid? folderId, Guid id, Guid? priorityId,
        int index, CancellationToken cancellationToken = default)
    {
        using var lease = await gate.EnterAsync(cancellationToken);
        await using var unitOfWork = unitOfWorkFactory.Begin();
        var tree = await LoadTreeAsync(unitOfWork, projectId, folderId, cancellationToken);
        var item = tree.Get(id);
        var label = item.PriorityLevelId == priorityId ? UndoLabels.Move(item.Title) : UndoLabels.SetPriority(item.Title);

        if (item.PriorityLevelId != priorityId)
        {
            await EnsureActivePriorityAsync(unitOfWork, priorityId, cancellationToken);
            item.SetLookups(item.ItemTypeId, priorityId, clock);
        }

        await MoveAtAsync(unitOfWork, tree, id, null, index, label, cancellationToken);
    }
}