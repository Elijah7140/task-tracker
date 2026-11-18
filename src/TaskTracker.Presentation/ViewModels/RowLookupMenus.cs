using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Lookups;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>
/// Builds the Set status and Set priority submenus that every item row shares (§7.15): "None", then
/// the active entries in list order, plus the item's current entry when it has been archived.
/// </summary>
internal sealed class RowLookupMenus(IReadOnlyList<StatusLevel> statuses, IReadOnlyList<PriorityLevel> priorities)
{
    /// <summary>The name shown in the row's status chip, or null when the item has no status.</summary>
    public string? StatusName(Guid? statusId)
    {
        return statuses.FirstOrDefault(status => status.Id == statusId)?.Name;
    }

    public IReadOnlyList<RowLookupChoice> Statuses(Guid? currentId, Func<Guid?, Task> set)
    {
        return Build(statuses, currentId, status => status.Name, set);
    }

    public IReadOnlyList<RowLookupChoice> Priorities(Guid? currentId, Func<Guid?, Task> set)
    {
        return Build(priorities, currentId, priority => priority.Label, set);
    }

    private static List<RowLookupChoice> Build<T>(IReadOnlyList<T> entries, Guid? currentId,
        Func<T, string> label, Func<Guid?, Task> set) where T : LookupEntity
    {
        var choices = new List<RowLookupChoice> { Choice(null, "None", currentId, set) };
        foreach (var entry in entries.Where(entry => !entry.IsArchived || entry.Id == currentId))
        {
            choices.Add(Choice(entry.Id, label(entry), currentId, set));
        }

        return choices;
    }

    private static RowLookupChoice Choice(Guid? id, string label, Guid? currentId, Func<Guid?, Task> set)
    {
        return new RowLookupChoice(label, id == currentId, new AsyncRelayCommand(() => set(id)));
    }
}