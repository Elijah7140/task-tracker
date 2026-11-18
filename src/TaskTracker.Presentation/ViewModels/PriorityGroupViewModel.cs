namespace TaskTracker.Presentation.ViewModels;

/// <summary>One priority section of the workspace card grid and the open top-level cards in it.</summary>
public sealed class PriorityGroupViewModel
{
    public PriorityGroupViewModel(Guid? priorityLevelId, string title, IReadOnlyList<ItemRowViewModel> cards)
    {
        PriorityLevelId = priorityLevelId;
        Title = title;
        Cards = cards;
    }

    /// <summary>The level the section stands for; null for the "No priority" section.</summary>
    public Guid? PriorityLevelId { get; }

    public string Title { get; }

    public IReadOnlyList<ItemRowViewModel> Cards { get; }

    public string CountLabel => Cards.Count == 1 ? "1 item" : $"{Cards.Count} items";
}