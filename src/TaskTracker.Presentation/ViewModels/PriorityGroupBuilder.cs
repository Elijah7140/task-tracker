using TaskTracker.Core.Lookups;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Sorts open top-level rows into the card grid's priority sections: "No priority" first, then
/// one section per level in level sort order (never by level number, §7.15). Only sections
/// with cards are returned. Cards keep the order they arrive in.
/// </summary>
public static class PriorityGroupBuilder
{
    public const string NoPriorityTitle = "No priority";

    public static IReadOnlyList<PriorityGroupViewModel> Build(IReadOnlyList<ItemRowViewModel> openRows,
        IReadOnlyList<PriorityLevel> levels)
    {
        var knownIds = levels.Select(level => level.Id).ToHashSet();
        var groups = new List<PriorityGroupViewModel>();
        AddIfAny(groups, null, NoPriorityTitle, openRows.Where(row => !HasKnownPriority(row, knownIds)));

        foreach (var level in levels.OrderBy(level => level.SortOrder))
        {
            var cards = openRows.Where(row => row.Node.Item.PriorityLevelId == level.Id);
            AddIfAny(groups, level.Id, level.Label, cards);
        }

        return groups;
    }

    private static bool HasKnownPriority(ItemRowViewModel row, HashSet<Guid> knownIds)
    {
        return row.Node.Item.PriorityLevelId is Guid id && knownIds.Contains(id);
    }

    private static void AddIfAny(List<PriorityGroupViewModel> groups, Guid? priorityId, string title,
        IEnumerable<ItemRowViewModel> rows)
    {
        var cards = rows.ToArray();

        if (cards.Length > 0)
        {
            groups.Add(new PriorityGroupViewModel(priorityId, title, cards));
        }
    }
}