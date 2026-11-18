namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Maps card drops and Alt+↑/↓ steps in the priority card grid to a top-level position and a
/// priority. The position is an index among the area's other top-level items in sort order,
/// finished ones included. Landing in another section gives the item that section's
/// priority, as on the Tickets page (§7.16).
/// </summary>
public static class CardDropMapper
{
    /// <summary>
    /// Places the dragged item before or after an open card, in that card's section. Returns null
    /// for a drop onto itself or onto a card outside the grid, for a finished item (finished items
    /// are ordered by completion time, §6.2), and for the Into position, which makes a sub-item
    /// and is mapped by <see cref="ItemDropMapper"/>.
    /// </summary>
    /// <param name="rows">Every row of the current area, including nested rows.</param>
    /// <param name="groups">The grid's sections, in display order.</param>
    /// <param name="sourceId">The dragged item.</param>
    /// <param name="targetId">The card under the pointer.</param>
    /// <param name="position">Before or after the card.</param>
    public static CardPlacement? Map(IReadOnlyList<ItemRowViewModel> rows,
        IReadOnlyList<PriorityGroupViewModel> groups, Guid sourceId, Guid targetId, ItemDropPosition position)
    {
        var group = groups.FirstOrDefault(candidate => candidate.Cards.Any(card => card.Id == targetId));
        var source = rows.FirstOrDefault(row => row.Id == sourceId);

        if (group is null || source is null || source.IsFinished || sourceId == targetId ||
            position == ItemDropPosition.Into)
        {
            return null;
        }

        var others = OtherTopLevel(rows, sourceId);
        var index = others.FindIndex(row => row.Id == targetId);
        var offset = position == ItemDropPosition.After ? 1 : 0;

        return new CardPlacement(group.PriorityLevelId, index + offset);
    }

    /// <summary>Places the dragged item after the last other card of a section (a drop on its header).</summary>
    public static CardPlacement? MapToGroupEnd(IReadOnlyList<ItemRowViewModel> rows,
        IReadOnlyList<PriorityGroupViewModel> groups, Guid sourceId, PriorityGroupViewModel group)
    {
        var last = group.Cards.LastOrDefault(card => card.Id != sourceId);

        return last is null ? null : Map(rows, groups, sourceId, last.Id, ItemDropPosition.After);
    }

    /// <summary>
    /// Moves an open card one place in reading order. Inside a section it swaps with its
    /// neighbour. At a section edge it enters the neighbouring section: at the end of the section
    /// above, or at the start of the section below. Returns null at either end of the grid.
    /// </summary>
    public static CardPlacement? Step(IReadOnlyList<ItemRowViewModel> rows,
        IReadOnlyList<PriorityGroupViewModel> groups, Guid cardId, int offset)
    {
        var order = groups.SelectMany(group => group.Cards.Select(card => (Card: card, Group: group))).ToList();
        var index = order.FindIndex(entry => entry.Card.Id == cardId);
        var neighbourIndex = index + offset;

        if (index < 0 || neighbourIndex < 0 || neighbourIndex >= order.Count)
        {
            return null;
        }

        var neighbour = order[neighbourIndex];
        var sameGroup = neighbour.Group == order[index].Group;
        var movesDown = offset > 0;
        var position = movesDown == sameGroup ? ItemDropPosition.After : ItemDropPosition.Before;

        return Map(rows, groups, cardId, neighbour.Card.Id, position);
    }

    private static List<ItemRowViewModel> OtherTopLevel(IReadOnlyList<ItemRowViewModel> rows, Guid sourceId)
    {
        return rows.Where(row => row.IsTopLevel && row.Id != sourceId)
            .OrderBy(row => row.Node.Item.SortOrder).ToList();
    }
}