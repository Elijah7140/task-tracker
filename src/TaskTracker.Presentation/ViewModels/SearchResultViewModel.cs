using System.Windows.Input;

using TaskTracker.Core.Items;
using TaskTracker.Core.Search;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>One search hit, shown as a single row with its location and lookup names.</summary>
public sealed class SearchResultViewModel(ItemSearchResult item, string location, string? type, string? priority)
{
    public ItemSearchResult Item { get; } = item;

    public string Title => Item.Title;

    public string? StatusName { get; internal set; }

    public bool HasStatus => StatusName is not null;

    public IReadOnlyList<RowLookupChoice> StatusChoices { get; internal set; } = [];

    public IReadOnlyList<RowLookupChoice> PriorityChoices { get; internal set; } = [];

    public string? PushBackReason => PushBackOneDay.UnavailableReason(Item.IsCompleted,
        Item.DueDate is not null || Item.HasSchedule);

    public ICommand? PushBackCommand { get; internal set; }

    public string Ticket => Item.TicketNumber ?? string.Empty;

    /// <summary>Project › Folder › Subfolder; only the project name for an item at the project root.</summary>
    public string Location { get; } = location;

    public string Type => type ?? string.Empty;

    public string Priority => priority ?? string.Empty;

    public string CompletedMark => Item.IsCompleted ? "✓" : string.Empty;

    /// <summary>The due date, followed by the due time when one is set, in the current culture.</summary>
    public string Due
    {
        get
        {
            if (Item.DueDate is not DateOnly date)
            {
                return string.Empty;
            }

            if (Item.DueTime is not TimeOnly time)
            {
                return date.ToString("d");
            }

            return $"{date:d} {time:t}";
        }
    }
}