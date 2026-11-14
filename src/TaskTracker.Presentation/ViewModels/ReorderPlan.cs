namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Works out the new saved order when a row moves up or down. The user only sees active rows,
/// but the service needs every row, so archived rows keep their slots.
/// </summary>
public static class ReorderPlan
{
    /// <summary>
    /// Returns every id in the new order: the moved row and its neighbour among the
    /// active rows exchange positions.
    /// </summary>
    /// <param name="allIds">Every id of the list, archived ones included, in saved order.</param>
    /// <param name="activeIds">The ids of the active rows, in the order the user sees them.</param>
    /// <param name="movedId">The row being moved.</param>
    /// <param name="offset">-1 to move up, +1 to move down.</param>
    public static List<Guid> SwapWithActiveNeighbour(IReadOnlyList<Guid> allIds,
        IList<Guid> activeIds, Guid movedId, int offset)
    {
        var neighbourId = activeIds[activeIds.IndexOf(movedId) + offset];
        var reordered = allIds.ToList();
        var movedIndex = reordered.IndexOf(movedId);
        var neighbourIndex = reordered.IndexOf(neighbourId);
        (reordered[movedIndex], reordered[neighbourIndex]) = (reordered[neighbourIndex], reordered[movedIndex]);

        return reordered;
    }
}