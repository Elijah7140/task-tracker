namespace TaskTracker.Presentation.ViewModels;

/// <summary>Maps row thirds to valid positions in the current area's item tree.</summary>
public static class ItemDropMapper
{
    /// <summary>
    /// Describes where a dragged row would land, or returns null when the drop is not allowed.
    /// Dropping a row onto itself or its own descendant is rejected. Before and after placement
    /// is rejected when either row is finished, because finished rows are shown newest-completed
    /// first (§6.2), not in sort order. Dropping into a finished row is allowed; Core reopens it.
    /// </summary>
    /// <param name="rows">Every row of the current area, including nested rows.</param>
    /// <param name="sourceId">The dragged item.</param>
    /// <param name="targetId">The row under the pointer.</param>
    /// <param name="position">Which third of the target row the pointer is in.</param>
    public static ItemDropPlacement? Map(IReadOnlyList<ItemRowViewModel> rows, Guid sourceId,
        Guid targetId, ItemDropPosition position)
    {
        var source = rows.FirstOrDefault(row => row.Id == sourceId);
        var target = rows.FirstOrDefault(row => row.Id == targetId);

        if (source is null || target is null || sourceId == targetId ||
            IsDescendant(rows, target, sourceId))
        {
            return null;
        }

        if (position != ItemDropPosition.Into && (source.IsFinished || target.IsFinished))
        {
            return null;
        }

        var parentId = position == ItemDropPosition.Into ? targetId : target.ParentId;
        var siblings = rows.Where(row => row.ParentId == parentId && row.Id != sourceId)
            .OrderBy(row => row.Node.Item.SortOrder).ToList();
        var index = position == ItemDropPosition.Into ? siblings.Count :
            siblings.FindIndex(row => row.Id == targetId);

        if (position == ItemDropPosition.After)
        {
            index++;
        }

        return index < 0 ? null : new ItemDropPlacement(parentId, index);
    }

    private static bool IsDescendant(IReadOnlyList<ItemRowViewModel> rows,
        ItemRowViewModel target, Guid sourceId)
    {
        var parentId = target.ParentId;

        while (parentId is Guid id)
        {
            if (id == sourceId)
            {
                return true;
            }

            parentId = rows.FirstOrDefault(row => row.Id == id)?.ParentId;
        }

        return false;
    }
}